# Zebra / ZPL printer discovery and identification: sourced protocol facts

Researched 2026-10-14. Confidence labels: CONFIRMED (a primary source states it, or real code plus hardware validation), INFERRED (follows from sources but not stated), UNKNOWN (could not find a source).
No Zebra hardware was available to us. "ZPL PG" below means Zebra's "ZPL II, ZBI 2, Set-Get-Do, Mirror, WML Programming Guide" P1134473-06EN Rev A (2025-01-31), downloaded and text-extracted:
https://www.zebra.com/content/dam/zebra/manuals/printers/common/programming/zpl-zbi2-pm-en.pdf
(HTML version: https://docs.zebra.com/us/en/printers/software/zpl-pg.html). Page numbers cited are the guide's own.

---------------------------------------------------------------------------------------------------

## 1. Zebra network discovery (the NetworkDiscoverer / ZebraNet Bridge protocol)

### Port, transport: CONFIRMED
- UDP 4201, request may be unicast, directed-broadcast or multicast. Zebra's own ZebraNet Bridge Enterprise guide: "UDP packets to the printer over port 4201 / Directed broadcast requires UDP broadcast packets (xxx.xxx.xxx.255) / Multicast must be enabled for specific address - 241.0.1.55." Also "Discovery Port ... The default is 4201", changeable on the printer.
  https://www.gammasolutions.com/wp-content/uploads/2022/04/zebranet-bridge-ug-en-v6.pdf (copy of Zebra doc 13743L-004, 2/18/10; sections "Requirements for Cross-Network Communication" and "Set System Preferences")
- A third-party Zebra support snippet (search result, article page itself not retrievable) lists `ip.discovery.enable` and `ip.discovery.port` = 4201: https://support.zebra.com/article/000031643. These two SGDs do NOT appear in the 2025 ZPL PG (grep for "ip.discovery" gave nothing), so treat the SGD names as INFERRED.

### Multicast address: UNKNOWN / conflicting
- Zebra's doc literally says **241.0.1.55**, which is not a valid multicast group (multicast is 224.0.0.0/4). Almost certainly a typo for 224.0.1.55 but NO source states 224.0.1.55 for Zebra. I could not find the IANA entry (csv fetch returned nothing) and no code that sends to either address.
- The SDK doc for `NetworkDiscoverer.Multicast(handler, hops, waitMs)` ("Sends a multicast discovery packet", hops = TTL) gives no address, port or bytes: https://techdocs.zebra.com/link-os/2-14/pc_net/content/html/8140b2e8-f3c7-71de-607a-7443a9e324f9
- Recommendation: do not depend on multicast. Use limited broadcast 255.255.255.255 plus per-interface directed broadcasts, plus unicast sweep of the subnet (the SDK `SubnetSearch` does the unicast variant; docs: https://techdocs.zebra.com/link-os/2-14/pc_net/content/html/f0bd72a6-c982-2f1f-f4d3-d54caefae70c, no wire details).

### Request packet: CONFIRMED (reverse-engineered + hardware-validated by a second project)
- 6 bytes `2E 2C 3A 01 00 00` (ASCII `.,:` then 01 00 00). The official client sends 3 identical packets from one socket, waits 1 s, then repeats from a new source port, 9 packets total; printers reply to each (so expect up to 9 duplicate replies, de-dupe by source IP).
  Source: "Zebra network discovery protocol", John Runyon, 2024-09-11, https://jfr.im/blog/2024/09/zebra-network-discovery-protocol/
- Independent implementations using the same bytes: Go https://github.com/theinventor/labl-printr/blob/main/internal/printer/discovery.go ("field offsets unverified against real hardware"), Swift https://github.com/jonathanspiva/zplkit/blob/main/Sources/ZPLKitPrinter/ZPLPrinterBrowser.swift .
- zplkit's HARDWARE-VALIDATION.md (https://github.com/jonathanspiva/zplkit/blob/main/HARDWARE-VALIDATION.md, section 2b) says it was run 2026-07-23 against a real ZM400 (V53.17.24Z) and GX420t (V56.17.17Z): broadcast to 255.255.255.255:4201, each printer replied unicast with magic `:,.`, and the parser extracted host, product, "ZebraNet Wired PS", firmware. Both are old-generation ZebraNet wired print servers, NOT Link-OS ZT231. Whether a ZT231 (Link-OS) replies identically is UNKNOWN (no source), though the Link-OS SDK's NetworkDiscoverer is documented to find Link-OS printers so some reply exists.

### Response layout: CONFIRMED for ZebraNet wired print server only; offsets approximate
Annotated hexdump from the jfr.im post (ZebraNet Wired PS, product 79071), quoted:
```
0000   3a 2c 2e 03 37 39 30 37 31 00 00 00 5a 65 62 72   :,..79071...Zebr
       ^-Cmd?----^ ^-Product #--^-------?^ ^-Name-----
0010   61 4e 65 74 20 57 69 72 65 64 20 50 53 00 00 00   aNet Wired PS...
0020   31 31 36 36 41 00 00 56 35 36 2e 31 37 2e 31 31   1166A..V56.17.11
       ^-Datecode---^----?^ ^-FW Version--------------
0030   5a 5a 42 52 00 61 00 07 4d 41 08 bd 34 32 36 32   ZZBR.a..MA..4262
       -^                                  ^-S/N------
0040   30 37 37 00 00 00 01 00 0a 01 00 9e ff ff ff 00   077.............
       -------^-------?^       ^-IP------^ ^-Netmask-^
0050   0a 01 00 01 5a 42 52 34 32 36 32 30 37 37 00 00   ....ZBR4262077..
       ^-Gateway-^ ^-System Name (hostname?)---^---?
```
(the remainder, 0x60..0x176, is mostly zeros plus unidentified bytes; total 0x177 = 375 bytes.)
Derived field table (author's labels; "?" boundaries are his):
| offset | meaning |
|---|---|
| 0x00..0x02 | magic `3A 2C 2E` |
| 0x03 | `03` (magic or version; author unsure) |
| 0x04 | "Product Number" string, NUL padded (e.g. "79071"). NOTE: this is the print-server product number, not the printer model |
| 0x0C | name string ("ZebraNet Wired PS") |
| 0x20 | date code ("1166A") |
| 0x27 (author: 0x25-ish) | firmware "V56.17.11Z" |
| 0x37 | serial number string ("4262077", approx. offset) |
| 0x48 | IPv4 address, 4 bytes (hexdump shows 0a 01 00 9e) |
| 0x4C | netmask 4 bytes (ff ff ff 00) |
| 0x50 | gateway 4 bytes (0a 01 00 01) |
| 0x54 | system name / hostname string ("ZBR4262077") |
zplkit independently parses: product at 4 (max 16), server name at 12, firmware via regex `V##.##.##<letter>` in first 80 bytes, IP at 72 (= 0x48), system (friendly) name at 84 (= 0x54), requires length >= 88 (parseReply in ZPLPrinterBrowser.swift). That agrees with the table.
- **Port (TCP print port) is NOT in the reply**; zplkit hard-codes 9100. **Model name (e.g. "ZT231") is NOT visibly in the reply**: the printable fields are print-server name/number. DNS name = the system-name field at 0x54 (author's guess "hostname?"). **No MAC in the reply.**
- Fields the question asked about that are absent/unknown: product/model name of printer (absent), TCP port (absent), MAC (absent), DNS name (probably 0x54, unconfirmed).
- Practical design: use UDP 4201 only to find IPs (+ firmware/serial/system name), then identify the model with SGD/~HI over TCP 9100 (items 2-4). Parse defensively: check magic, length, NUL-terminated strings, ignore unknown tail.
- Is the layout the same on Link-OS ZT2xx/ZT4xx? UNKNOWN. The 2025 ZPL PG documents no discovery packet format at all.

---------------------------------------------------------------------------------------------------

## 2. SGD over raw TCP 9100

### Syntax: CONFIRMED (ZPL PG, "About SGD Printer Commands", pp. 607-608)
- Form: `! U1 getvar "name"` ; "!" then space, "U1", space, command, then the attribute in double quotes. Command and attribute must be lowercase. "SGD commands must be terminated by a carriage return or a space and line feed" and "must be terminated by a space character or CR/LF (0x0D, 0x0A)". So send `! U1 getvar "device.unique_id"\r\n`.
- Unknown/misspelled/unset variable: printer answers `"?"` (quoted question mark).
- Multiple getvars in one send: CONFIRMED, via the "U" (no "1") form ended by `END `:
```
! U getvar "ip.telnet.enable"
getvar "ip.dhcp.enable" getvar "ip.dhcp.cid_prefix"
END
```
  "The command portion of the string does not use the '1' after the '! U'... terminated by the word END with a space after the word, and by a carriage return/line feed." Response format for this multi-form is not documented in the guide; UNKNOWN (likely one quoted value per getvar in order). Safer: send separate `! U1 getvar` per variable on one connection and read each reply, as codyps does.
- JSON alternative: TCP port 9200 (`ip.sgd_json_port`), `{}{"device.product_name":null}` returns `{"device.product_name":"ZT231..."}`; per PG: "If you connect to port 9200, the printer ONLY accepts JSON". Doc says JSON text is for QLn/iMZ "mobile" printers, so do not rely on it for ZT231. (PG p.608 ff.; https://docs.zebra.com/us/en/printers/software/zpl-pg/r-sgd-sgd-printer-commands/c-sgd-json-javascript-object-notation-/c-sgd-configuring-json-usage-communications/c-sgd-getvar-using-json.html)

### Response format: CONFIRMED by real-printer captures and working client code
- A double-quoted string, e.g. `"18J161604846"`. Captured from a ZT410 in https://github.com/Ladder99/ladder99/blob/main/services/adapter/src/drivers/printer/zebra-responses.txt : device.friendly_name -> `"18J161604846"`; media.speed -> `"6.0"`; odometer.headclean -> `"313247 INCHES, 795649 CENTIMETERS"`; sensor.paper_supply -> `"out"`; sensor.cover_open -> `"no"`; head.latch -> `"ok"`.
- Terminator: not documented. The guide says only that the *host_status* variant has CR/LF after lines 1 and 2. Working code does NOT rely on a newline: codyps `zebra-sgd` reads byte by byte, skips CR/LF before the opening quote, collects to the closing `"` (so a value containing `"` would break it), caps 4096 bytes, treats `"?"` / empty as unsupported, and uses a per-call deadline: https://github.com/codyps/zpl/blob/main/zebra-sgd/src/lib.rs  (quoting: "Replies need not end with a newline."). Another working client reads to `\n` with a 1 s read deadline and a 3 s connect timeout: https://github.com/angelside/zebra-serial-reader/blob/main/cmd/socket.go
- Wait time: not specified by Zebra. Use connect timeout ~2-3 s, per-reply read deadline ~1-2 s, overall budget a few seconds (code above uses 1 s and 3 s). Mark as engineering choice, not a sourced number.
- Multi-line replies (device.host_status) are 3 lines inside one pair of quotes (see item 3).

### Variable names and values (all from ZPL PG, page numbers = guide pages)
| Variable | Status | Notes |
|---|---|---|
| `device.unique_id` | CONFIRMED to exist, p.790 | "retrieves the printer identifier"; example returns "12345". Guide does not use the word "serial". Evidence it is serial-like: the default `ip.hostname` is `"<device.product_name>-<device.unique_id>"` e.g. `"ZT411-99J000800418"` (p.1270); SNMP `zbrGeneralUniqueId` is used as serial by GLPI (item 5). Treat as the serial; fall back to device.friendly_name (default = main logic board serial, p.706) |
| `device.friendly_name` | CONFIRMED, p.706 | user-settable, up to 63 chars; default = main logic board serial number (ZT410 capture: `"18J161604846"`) |
| `device.product_name` | INFERRED | Not a documented section in the 2025 PG, but referenced in `ip.hostname` and `ip.dhcp.vendor_class_id` formulas (pp.1270) and queried successfully by code: https://github.com/codyps/zpl/blob/main/zebra-sgd/src/lib.rs (`get_required(stream,"device.product_name")`). The related `device.product_name_submodel` (p.749) returns "hc"/"none". Value format unconfirmed (SNMP model for ZT410 is "ZT410-203dpi ZPL"; ~HI gives "ZT410-200dpi,...") |
| `head.resolution.in_dpi` | CONFIRMED, p.841 | returns "200", "300" or "600" per PG (a ZD230 allcv capture shows `203`: https://github.com/u8array/ZPLab/blob/main/packages/core/src/lib/sgd.fixture.ts). Parse as int, do not whitelist |
| `ezpl.print_method` | CONFIRMED, p.819 | values `"thermal trans"` and `"direct thermal"`, default "thermal trans". ZD230 capture: `direct thermal` |
| `ezpl.print_width` | CONFIRMED, p.820 | print width in dots; default = printhead width (ZD230: 813; ZPL PG says any printhead width) |
| `zpl.label_length` | CONFIRMED, p.1090 | dots, "1".."32000" (ZD230: 1219) |
| `device.languages` | CONFIRMED, p.723 | values epl, epl_zpl, zpl, hybrid_xml_zpl, apl-*; "zpl" setvar reads back as "hybrid_xml_zpl"; default "epl_zpl" (ZD230 capture: `epl_zpl`). So ZPL-capable == contains "zpl" |
| `ip.port` | CONFIRMED, p.1321 | TCP print port; default **"9100"**; valid 1-65535 |
| `ip.port_alternate` | CONFIRMED, p.1322 | default **"9100"** too; printer listens on both primary and alternate concurrently. (Guide examples elsewhere show ip.port="6101" with alternate "9100", PG p.~1380 JSON example, so ports can differ in the field) |
| `device.host_identification` | CONFIRMED, see item 4 | SGD twin of ~HI. ZT410 capture `"ZT410-200dpi,V75.19.15Z,8,4096KB"` |
| `device.host_status` | CONFIRMED, see item 3 | |
| `usb.device.mode` | CONFIRMED, p.1029 | "composite" or "legacy"; **default "legacy"** = single PRN interface only; "composite" adds IPP-over-USB and WebUSB interfaces. Relevant to item 7 (not tested by any source whether usbprint still binds to the PRN interface in composite mode) |
| `usb.device.vendor_id/product_id/serial_string/device_id_string` | exist as SGD names (TOC p.1026-1034) | no content extracted |

### Does a ZT231 answer on 9100, is the port bidirectional? INFERRED (strong)
- ZT231 is a Link-OS industrial printer with internal 10/100 Ethernet: https://docs.zebra.com/us/en/printers/industrial/zt231-industrial-printer-user-guide/r-2x1-specifications/r-communication-interface-specifications/c-standard-connections/r-zt4x1-wired-10100-internal-ethernet-print-server.html . (The page is the standard-connections page; I did not see a ZT231-specific port-9100 sentence.)
- Port 9100 is the factory default TCP print service (`ip.port`, PG p.1321). Bidirectionality: the three open-source clients above (codyps, angelside, Ladder99 on a ZT410 in 2021) all write a getvar to 9100 and read the reply on the same socket. Zebra's own text calls it "the TCP print service" and has no statement "bidirectional by default". No source shows a ZT231 specifically.
- Gotchas (CONFIRMED in PG): `ip.port_single_conn` is a separate single-connection port (p.1324); the printer silently does not answer ~HS when in MEDIA OUT/RIBBON OUT/HEAD OPEN (see item 3 contradiction). EMEA purchases after 2025-08-01 require a Protected Mode password for wired setup (ZT231 guide), whether that blocks 9100 queries is UNKNOWN.

---------------------------------------------------------------------------------------------------

## 3. ~HS host status

### Format: CONFIRMED (ZPL PG p.233-236; SGD twin `device.host_status` p.714-718)
`~HS` returns three lines, each `<STX>...<ETX><CR><LF>` (0x02 ... 0x03 0x0D 0x0A). The SGD form `! U1 getvar "device.host_status"` returns the same without STX/ETX and with the whole thing in quotes, CR/LF after lines 1 and 2.
```
String 1: <STX>aaa,b,c,dddd,eee,f,g,h,iii,j,k,l<ETX><CR><LF>
String 2: <STX>mmm,n,o,p,q,r,s,t,uuuuuuuu,v,www<ETX><CR><LF>
String 3: <STX>xxxx,y<ETX><CR><LF>
```
String 1 fields (PG): aaa = communication (interface) settings (bit-packed); **b = paper out flag (1 = paper out)**; **c = pause flag (1 = pause active)**; dddd = label length in dots; eee = number of formats in receive buffer; f = buffer full flag; g = comm diagnostic mode flag; h = partial format in progress; iii = unused (000); j = corrupt RAM flag; k = under temperature; l = over temperature.
String 2 fields: mmm = function settings; n = unused; **o = head up flag (1 = head in up position, i.e. head open)**; **p = ribbon out flag (1 = ribbon out)**; q = thermal transfer mode flag (1 = TT, 0 = DT); r = print mode (0 rewind, 1 peel-off, 2 tear-off, 3 cutter, 4 applicator, 5 delayed cut, 6 linerless peel, 7 linerless rewind, 8 partial cutter, 9 RFID, K kiosk); s = print width mode; t = label waiting flag; uuuuuuuu = labels remaining in batch; v = format-while-printing (always 1); www = number of graphics stored.
String 3: xxxx = (password/other value per PG), y = static RAM installed.
Mapping asked for: paper out = String1 field 2 (b); paused = String1 field 3 (c); head open = String2 field 3 (o); ribbon out = String2 field 4 (p).
(The PG's extracted table is slightly garbled in the layout view; I confirmed the b/c/dddd... order against the non-layout text extraction of PDF pages 233-236 and the SGD section p.715.)

### Real capture (ZT410, SGD form, from https://github.com/Ladder99/ladder99/blob/main/services/adapter/src/drivers/printer/zebra-responses.txt)
```
"030,1,1,1225,000,0,0,0,000,0,0,0
001,0,0,1,1,2,6,0,00000000,1,000
1234,0"
```
Same capture shows `sensor.paper_supply = "out"` at the same time, so String 1 field 2 = 1 (paper out) and field 3 = 1 (paused) is the paper-out state; the printer DID respond while paper was out.

### Contradiction to be aware of
The PG says: "When a ~HS command is sent the printer will not send a response to the host if the printer is in one of these conditions: MEDIA OUT, RIBBON OUT, HEAD OPEN, REWINDER FULL, HEAD OVER-TEMPERATURE" (same note on device.host_status). The Ladder99 ZT410 capture above shows a reply while paper was out. So: treat a timeout as "unknown or in a fault state", never as "offline".
Also `~HS` is a ZPL command and requires the printer to be in ZPL mode; legacy EPL mode printers will not answer it.

---------------------------------------------------------------------------------------------------

## 4. ~HI host identification

### Format: CONFIRMED (ZPL PG p.224, `device.host_identification` p.713)
Request `~HI`; reply `XXXXXX,V1.0.0,dpm,000KB,X`:
- XXXXXX = model of the Zebra printer
- V1.0.0 = firmware (software) version
- dpm = dots/mm: 6, 8, 12 or 24 (=152, 203, 300, 600 dpi)
- 000KB = memory (512KB, 1024KB, ... 8192KB)
- X = recognizable options (only if present)
Real example (ZT410, SGD form `device.host_identification`): `"ZT410-200dpi,V75.19.15Z,8,4096KB"` (Ladder99 capture, link in item 3). In that capture the model token already includes the dpi suffix ("ZT410-200dpi"). Framing of raw `~HI`: STX before and ETX CR LF after (like other ~H* replies); the PG text for ~HI does not state framing explicitly, so strip control characters defensively. (INFERRED framing.)
Another OSS project that identifies Zebras by sending ~hi to subnet hosts on 9100: https://github.com/WDC/Striped-Printer (README: "Scan your local subnets for Zebra printers on port 9100 ... via the ~hi command"). Not independently verified.

---------------------------------------------------------------------------------------------------

## 5. SNMP on Zebra

### Enabled by default, community "public": CONFIRMED with an important recent exception (ZPL PG p.1330-1331)
- `ip.snmp.enable` default: **"off" for printers purchased in EMEA after August 1, 2025; "on" for all other printers.** (Our deployment is the Faroe Islands/Europe context: a ZT231 bought recently in EMEA may have SNMP OFF.)
- `ip.snmp.get_community_name` default **"public"** (max 19 chars; getvar returns "*" for protection). Set community has its own SGD (`ip.snmp.set_community_name`). SNMPv3 SGDs exist (`ip.snmpv3.*`).
- Source: the ZPL PG PDF above (sections ip.snmp.enable, ip.snmp.get_community_name).

### sysDescr: CONFIRMED format for Link-OS >= v6.1; older print servers differ
- Zebra Link-OS v6.1 release notes: sysDescr (1.3.6.1.2.1.1.1.0) changed to `"company name product name active print server"`, example `"Zebra Technologies ZD510-300dpi / internal wired"`; previously it was only the print server name. sysName (1.3.6.1.2.1.1.5.0) became `"Product name"` (e.g. "ZD510"), previously the serial number. hrDeviceDescr (1.3.6.1.2.1.25.3.2.1.3) became `"Zebra Technologies ZD510"`, previously "Zebra Printer". https://www.zebra.com/content/dam/support-dam/en/documentation/unrestricted/release-notes/Link-OSv6.1ReleaseNotes.pdf (the notes cover ZT230/ZT410 families too, per the notes' model tables).
- Older ZebraNet wired print server (LibreNMS test data): sysDescr = hex 5a656272614e6574205769726564205053 = "ZebraNet Wired PS"; sysObjectID 1.3.6.1.4.1.683.6.0: https://github.com/librenms/librenms/blob/master/tests/snmpsim/zebra.snmprec . Another capture: sysDescr "Zebra Wired", sysObjectID 1.3.6.1.4.1.10642.1.1: https://github.com/librenms/librenms/blob/master/tests/snmpsim/zebra_1.snmprec .
- Detection heuristics used by monitoring tools: Checkmk detects `sysDescr contains "zebra"` (https://github.com/Checkmk/checkmk/blob/master/cmk/plugins/zebra/agent_based/zebra_model.py); LibreNMS matches sysObjectID prefixes .1.3.6.1.4.1.683. or .1.3.6.1.4.1.10642. (https://github.com/librenms/librenms/blob/master/resources/definitions/os_detection/zebra.yaml); netdata profile selects `sysobjectid 1.3.6.1.4.1.10642.1.1` with the comment "ZT410-203dpi ZPL" (https://github.com/netdata/netdata/blob/master/src/go/plugin/go.d/config/go.d/snmp.profiles/default/zebra-printer.yaml), so on a ZT410 sysObjectID looks like `1.3.6.1.4.1.10642.1.1` (INFERRED from the comment).
- Exact sysDescr text of a ZT231/ZT411: UNKNOWN (no captured string found). Expect "Zebra Technologies ZT231-203dpi / internal wired" by the v6.1 rule, INFERRED.

### Zebra enterprise OIDs (1.3.6.1.4.1.10642): CONFIRMED by three independent implementations
GLPI agent (https://github.com/glpi-project/glpi-agent/blob/develop/lib/GLPI/Agent/SNMP/MibSupport/Zebra.pm) names the ZEBRA-MIB objects:
| OID | ZEBRA-MIB name | meaning |
|---|---|---|
| 1.3.6.1.4.1.10642.1.1.0 | zbrGeneralModel | model, e.g. "ZT410-203dpi ZPL"; (netdata also uses it as `model`) |
| 1.3.6.1.4.1.10642.1.2.0 | zbrGeneralFirmwareVersion | firmware |
| 1.3.6.1.4.1.10642.1.4.0 | zbrGeneralName | name/hostname |
| 1.3.6.1.4.1.10642.1.9.0 | zbrGeneralUniqueId | **serial / unique id** (GLPI `getSerial` prefers it; ServiceNow community post also lists 1.3.6.1.4.1.10642.1.9.0 and a Link-OS walk with .2.3.27.0 = "31422GCI4143RHH") |
| 1.3.6.1.4.1.10642.1.11.0 | zbrGeneralCompanyName | "Zebra Technologies" |
| 1.3.6.1.4.1.10642.1.18.0 | zbrGeneralLINKOSVersion | Link-OS version (also netdata os_version) |
Older QL-family fallbacks: 1.3.6.1.4.1.10642.200.19.5.0 (serial) and .19.7.0 (model); ESI-MIB 1.3.6.1.4.1.683.1.5.0 (serial), 1.3.6.1.4.1.683.6.2.3.2.1.15.1 (model). Test data confirming values for a ZTC TLP 2824 Plus: model "ZTC TLP 2824 Plus", serial "37J162600538" (snmprec above).
Other sources: LibreNMS fetches model from ESI-MIB::genProductNumber.0 / ZEBRA-QL-MIB::zql-device-product-name, serial ESI-MIB::genSerialNumber.0; ServiceNow thread https://www.servicenow.com/community/itom-articles/how-to-successfully-set-up-snmp-discovery-for-zebra-printers-to/tac-p/3220171 (third-party, mixed reports).
The enterprise MIB files themselves (ZEBRA-MIB) are at https://github.com/librenms/librenms/tree/master/mibs/zebra (ZEBRA-QL-MIB confirmed present; I did not read ZEBRA-MIB). Zebra Link-OS SDK `SnmpPrinter` class uses 10642 OIDs too (e.g. .20.3.5.0 friendly name): https://techdocs.zebra.com/link-os/2-14/pc/content/com/zebra/sdk/printer/snmpprinter .

### PWG IEEE 1284 device ID OID 1.3.6.1.4.1.2699.1.2.1.2.1.1.3: UNKNOWN (no evidence of support)
- Searched for 2699 / Printer-MIB (1.3.6.1.2.1.43) on Zebra: the only Zebra walk with full dump (zebra.snmprec above, ZTC TLP 2824 Plus on ZebraNet wired PS) has **zero** 1.3.6.1.4.1.2699 and zero 1.3.6.1.2.1.43 entries. It does expose an HP-JetDirect-style device-ID OID `1.3.6.1.4.1.11.2.3.9.1.1.7.0` whose value decodes to `MANUFACTURER:Zebra Technologies;COMMAND SET:ZPL;MODEL:ZTC TLP 2824 Plus;CLASS:PRINTER;PROTOCOLS:IEEE1284.4;` (old firmware only; unknown on Link-OS).
- Do not rely on PWG 2699. Use ZEBRA-MIB 10642.1.x.0 (above) instead, or IPP (next point).
- A ZT411 captured over IPP (port 631, Link-OS supports IPP) returned `printer-device-id: "MFG:Zebra Technologies;MDL:ZTC ZT411-203dpi ZPL;CMD:ZPL;"`, `printer-make-and-model: "Zebra Technologies ZTC ZT411-203dpi ZPL"`, `document-format-default: application/vnd.zebra`: https://github.com/dfigueredo0/Printer_Troubleshoot_AI/blob/main/zt411-troubleshooter-agent/tests/fixtures/snmp_walks/zt411_fixture_media_out.json (a test fixture whose provenance I could not verify beyond its captured_at field). Zebra's IPP guide: https://www.zebra.com/content/dam/support-dam/en/documentation/unrestricted/guide/software/ipp-ipps-link-os-cg-en.pdf (not read).

### Argox O4-250 and SNMP: UNKNOWN
- No Argox document found that mentions SNMP, an Argox enterprise OID or a sysDescr. Argox "Web Setting Tool for LAN" manual says the LAN printers have a built-in web page (default login admin/admin), "default static IP 0.0.0.0, default listen port is 9100", and lists MAC addresses of printers in its tool; it never mentions SNMP: https://doc.argox.com/usermanual/Web_Setting_Tool_for_LAN_V1.0_EN.pdf
- Argox O4 brochure (marketing): built-in Ethernet, 2 USB host, USB device, RS-232; languages PPLA, PPLB, PPLZ with "Automatic Language Emulation Detection": https://www.argox.com/docfile/brochure/O4%20brochure%20en%20v3.2.pdf . A Polish retailer listing disagrees (only PPLA/PPLB, RS-232/LPT), so verify on the actual unit.
- Practical consequence: for Argox, do not plan on SNMP. Use TCP 9100 (confirmed default listen port by Argox's own manual) and the vendor's PPL query commands, which I did NOT research.

---------------------------------------------------------------------------------------------------

## 6. Bonjour / mDNS service types for Zebra Link-OS: UNKNOWN (leaning "not advertised by default")
- The 2025 ZPL PG contains no mention of mDNS, Bonjour, zeroconf, UPnP or WS-Discovery (grep over the whole extracted guide).
- Zebra's IPP/IPPS Link-OS configuration guide states multicast DNS is a later-phase feature ("...not fully supported ... until other features, including multicast DNS, automatic IP assignment, and so on, are implemented in a later phase") (search-result excerpt of https://www.zebra.com/content/dam/support-dam/en/documentation/unrestricted/guide/software/ipp-ipps-link-os-cg-en.pdf; guide is old, so may be out of date).
- Hardware report from the zplkit author, 2026-07-23 (ZM400/GX420t, pre-Link-OS): "Zebra print servers don't advertise `_pdl-datastream._tcp` over Bonjour/mDNS by default (browsing it finds generic IPP/socket printers ... not Zebra units), so ZPLPrinterBrowser uses ... UDP-4201": https://github.com/jonathanspiva/zplkit/blob/main/HARDWARE-VALIDATION.md . Not tested on Link-OS ZT2xx.
- A Zebra ZT411 exposes IPP at http://<ip>:631 (fixture above), but no source says which DNS-SD types it publishes.
- Verdict: do not count on mDNS. If you want to probe anyway, query `_pdl-datastream._tcp`, `_ipp._tcp`, `_printer._tcp`, `_http._tcp` and treat any hit as a bonus.

---------------------------------------------------------------------------------------------------

## 7. Windows driverless USB printing

### 7a. GUID and IOCTL value: CONFIRMED (Windows SDK header usbprint.h)
- `GUID_DEVINTERFACE_USBPRINT` = **{28D78FAD-5A12-11d1-AE5B-0000F803A8C2}**; `DEFINE_GUID(GUID_DEVINTERFACE_USBPRINT, 0x28d78fad, 0x5a12, 0x11d1, 0xae, 0x5b, 0x0, 0x0, 0xf8, 0x3, 0xa8, 0xc2);` in usbprint.h: https://github.com/tpn/winsdk-10/blob/master/Include/10.0.16299.0/shared/usbprint.h
- `IOCTL_USBPRINT_GET_1284_ID = CTL_CODE(FILE_DEVICE_UNKNOWN, USBPRINT_IOCTL_INDEX+13, METHOD_BUFFERED, FILE_ANY_ACCESS)` with index base 0, so function 13 -> **0x00220034** (computed: (0x22<<16)|(13<<2)). Independently listed as `IOCTL_USBPRINT_GET_1284_ID 0x220034` (also GET_LPT_STATUS 0x220030, VENDOR_SET 0x220038, VENDOR_GET 0x22003c, SOFT_RESET 0x220040) in https://github.com/MartinDrab/IRPMon/blob/master/ioctl.txt
- Doc for the IOCTL: input buffer unused; output = 2-byte big/leading length prefix + device ID string + NUL; ID up to 64 KB; "On some USB print devices, using the maximum 65535 bytes can cause the call to fail with error 23. Reduce the buffer to 4094 bytes or less." https://github.com/MicrosoftDocs/windows-driver-docs-ddi/blob/main/wdk-ddi-src/content/usbprint/ni-usbprint-ioctl_usbprint_get_1284_id.md (rendered: https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/usbprint/ni-usbprint-ioctl_usbprint_get_1284_id). Byte order of the 2-byte prefix is not stated in what I read (UNKNOWN; handle both or skip the prefix and trim).
- Programming considerations (WritePort/ReadPort semantics shared with parallel stack; "Usbprint.sys does not provide a mechanism for obtaining descriptors from the device, nor for directly manipulating USB pipes"): https://learn.microsoft.com/en-us/windows-hardware/drivers/print/programming-considerations-for-usbprint

### 7b. usbprint.sys binds to a printer-class device with no vendor driver: CONFIRMED locally + by code
- This machine's `C:\Windows\INF\usbprint.inf` (Windows 11 10.0.26100): `%USBPRINT.DeviceDesc% = USBPRINT_Inst,USB\Class_07,GENERIC_USB_PRINTER`, DeviceDesc "USB Printing Support", service `usbprint` ("Microsoft USB PRINTER Class"), StartType demand; plus `USBPRINT\UnknownPrinter` -> "No Printer Attached". So any USB device with interface class 07 (printer) binds to the inbox usbprint via the compatible ID, with no Zebra driver.
- ZebraFileManager (C#, Zebra-specific) finds printers by WMI `Win32_PnPEntity` where Name == "USB Printing Support" or Service == "usbprint": https://github.com/choicebooks/ZebraFileManager/blob/master/ZebraFileManager/Zebra/USBPrinter.cs
- The "Unspecified" device-category label is a Devices-and-Printers UI detail; I found no document for it (INFERRED only).
- Caveat: Zebra SGD `usb.device.mode` default "legacy" = single PRN interface (good for usbprint); in "composite" mode the printer adds IPP-over-USB and WebUSB interfaces (PG p.1029), and whether usbprint still binds then is UNKNOWN.

### 7c. User-mode (non-admin) CreateFile + WriteFile of raw ZPL: INFERRED (strong), not documented as such
- Method (all projects below use it): SetupDiGetClassDevs(GUID_DEVINTERFACE_USBPRINT, DIGCF_PRESENT|DIGCF_DEVICEINTERFACE) -> SetupDiEnumDeviceInterfaces -> SetupDiGetDeviceInterfaceDetail -> DevicePath like `\\?\usb#vid_0a5f&pid_xxxx#<serial>#{28d78fad-5a12-11d1-ae5b-0000f803a8c2}` -> `CreateFile(path, GENERIC_READ|GENERIC_WRITE, FILE_SHARE_READ|FILE_SHARE_WRITE, NULL, OPEN_EXISTING, 0 (or FILE_FLAG_OVERLAPPED), NULL)` -> WriteFile.
- Zebra: https://github.com/choicebooks/ZebraFileManager/blob/master/ZebraFileManager/Zebra/USBPrinter.cs (C#, MIT; opens with `GENERIC_READ|GENERIC_WRITE`, `FILE_SHARE_READ|FILE_SHARE_WRITE`, writes ZPL in 1 MiB chunks via FileStream).
- Brother QL (no vendor driver, "usbprint class-driver Windows, NESSUN driver Brother"), Java/JNA, overlapped IO with real timeout: https://github.com/GianlucaCelante/etichette-da-matteo/blob/main/tools/spike-jna/QlStatusSpike.java
- C#: TSC SDK decompile https://github.com/hyunmui/Hyunmui.TSCPrinter/blob/master/tsclibnet.Core/usb.cs ; Argox-specific C# worker https://github.com/Labor-Link/scanlink/blob/main/ScanLinkPrinter.Argox/Class1.cs (tries both the generic-USB interface {a5dcbf10-6530-11d2-901f-00c04fb951ed} and the USBPRINT interface path; comment: "Try generic first for some models where USBPRINT interface is inert", i.e. some Argox models do not respond via usbprint).
- Rust: https://github.com/MarcusSanchez/ezrama/blob/main/src/win.rs ; Go: https://github.com/mohamed-saad-edu/Odoo-print-system/blob/main/agent/internal/printer/usb_windows.go ; Python agent https://github.com/bnbselfcare/glamiris-print-agent/blob/main/windows/app.py
- Non-admin: no source states "no admin required". I could not find any ACL documentation for the interface. None of the above require elevation in their READMEs/code, so INFERRED. Test on a clean standard-user account before shipping. (Same limitation applies as everywhere in this file: no Zebra printer to test with.)
- Interface paths also appear in `Win32_PnPEntity.PNPDeviceID` for "USB Printing Support" nodes.

### 7d. ReadFile for bidirectional status: CONFIRMED by code (Zebra and Brother), caveats
- ZebraFileManager does write-then-read on the same interface: opens the path again, reads with a 20 s first-read timeout then 1 s idle timeout, and uses `CancelSynchronousIo` (plus `TerminateThread` as last resort) to break out of a hung synchronous ReadFile. So a ReadFile with no data pending BLOCKS indefinitely; always use overlapped IO or a worker thread with CancelIoEx/CancelSynchronousIo. https://github.com/choicebooks/ZebraFileManager/blob/master/ZebraFileManager/Zebra/USBPrinter.cs
- Brother QL spike reads 32 status bytes via overlapped ReadFile with WaitForSingleObject timeout + CancelIoEx (note from its comments: with JNA, disable OVERLAPPED auto-sync).
- MS says usbprint shares the parallel stack's ReadPort/WritePort model (programming-considerations page above).
- Zebra answers `! U1 getvar` and `~HS`/`~HI` over USB the same as TCP: INFERRED (ZebraFileManager's USBPrinter sends arbitrary SGD/ZPL and reads replies). No document states it for the ZT231 explicitly.

### 7e. Conflict with a spooler queue (usbmon) for the same device: UNKNOWN
- No source found that says whether usbprint allows concurrent opens (spooler's usbmon port vs your handle) or exclusive access. Web searches for sharing-violation/access-denied on usbprint paths returned only HID/WebUSB material. A WebUSB issue (https://github.com/WICG/webusb/issues/199) mentions a label printer whose usbprint.sys ownership blocked WebUSB, a different (libusb/WinUSB) case.
- Design hedge: open per exchange (open, write, read, close) as ZebraFileManager does, share-mode READ|WRITE, retry on ERROR_SHARING_VIOLATION (32) / ERROR_ACCESS_DENIED (5) / ERROR_BUSY, never hold the handle between polls, and surface "device busy (print job in progress?)" instead of treating it as offline. If the driver is installed, the user can also see the spooler hold the port during a job.
- Windows spooler path alternative: GetPrinter/OpenPrinter + "RAW" datatype + WritePrinter works when a queue exists but needs a queue; not researched here.

---------------------------------------------------------------------------------------------------

## 8. Vendor identification

| Item | Value | Confidence | Source |
|---|---|---|---|
| Zebra USB VID | **0x0A5F** | CONFIRMED | linux-usb.org usb.ids: `0a5f  Zebra Technologies` (list includes LP2844, GK420d/t, GX420d, ZM400 ...): http://www.linux-usb.org/usb.ids |
| Argox USB VID | **0x1664** | CONFIRMED by code (not in usb.ids) | `#define MY_VID 0x1664` in https://github.com/ch593030323/fastfd20200204/blob/master/peripheral/win32_printer_argox_pplb.cpp ; "No ARGOX (vid 0x1664) USB printer found" in https://github.com/LarryHsiao/argox_ix4/blob/main/lib/src/usb_printer.dart ; `USB\VID_1664&PID_025E` example in https://github.com/Labor-Link/scanlink/blob/main/ScanLinkPrinter.Argox/Class1.cs |
| Zebra Technologies MAC OUIs | 00:05:12, 00:07:4D, 00:15:70, 00:23:68, 00:A0:F8, 40:83:DE, 48:8E:B7, 60:95:32, 74:93:A4, 78:B8:D6, 84:24:8D, 88:BC:AC, 90:75:DE, 94:FB:29, C4:7D:CC, C8:1C:FE, FC:59:7A (all "Zebra Technologies Inc/Corp.") | CONFIRMED | Wireshark manuf (IEEE registry derived): https://www.wireshark.org/download/automated/data/manuf |
| Other "Zebra" OUIs (not Zebra Technologies) | C4:BB:4C "Zebra Information Tech Co. Ltd" ; 70:B3:D5:25:90/36 "Zebra Elektronik A.S." (MA-S block) | CONFIRMED but exclude | same file. Do not treat as Zebra Technologies printers |
| Argox OUI | **78:5F:4C = "Argox Information Co., Ltd."** | CONFIRMED | same Wireshark manuf file. Yes, the guess in the brief is right. I found no other Argox OUI in the file |
| Real Zebra printer MACs seen | ZT410 00:07:4D:69:58:80 and ZE500 00:07:4d:6c:51:7b (via ~HQHA) | CONFIRMED | Ladder99 capture, link in item 3 |
Caveats: OUI list is a snapshot (the Wireshark file is regenerated daily from IEEE); Zebra has several OUIs and new ones get added, so use OUI as a hint, not a filter. A Zebra network card in a ZT231 may also use the Zebra OUIs above (INFERRED); wireless radios may carry module-vendor OUIs. `~HQHA` returns the MAC over TCP (capture above).

---------------------------------------------------------------------------------------------------

## 9. Windows ARP / neighbour table without admin

- **Use `GetIpNetTable2(AF_INET, &table)` (iphlpapi.dll, netioapi.h)** (Vista+). Returns MIB_IPNET_TABLE2 whose rows give Address (SOCKADDR_INET), InterfaceIndex/Luid, `PhysicalAddress[]`/`PhysicalAddressLength`, and `State` (NlnsUnreachable/Incomplete/Probe/Delay/Stale/Reachable/Permanent). Free with `FreeMibTable`. Returns NO_ERROR or ERROR_NOT_FOUND (empty ARP table is not a failure). https://learn.microsoft.com/en-us/windows/win32/api/netioapi/nf-netioapi-getipnettable2 (CONFIRMED API; the page lists no privilege requirement).
- Legacy IPv4-only equivalent: `GetIpNetTable` (iphlpapi.h). To force an entry for a known-live IP on the local subnet: `SendARP(destIP, 0, &mac, &len)` (works only on the local subnet; on Vista+ it also updates the local ARP table) or `ResolveIpNetEntry2` (Vista+ replacement, sends ARP for IPv4). https://learn.microsoft.com/en-us/windows/win32/api/iphlpapi/nf-iphlpapi-sendarp
- Non-admin: documentation lists no requirement. Verified on this machine in a non-elevated session (IsInRole(Administrator) = False): PowerShell `Get-NetNeighbor -AddressFamily IPv4` returned the table (IPv4 rows incl. 255.255.255.255 / 239.255.250 / 224.0.0.251). Get-NetNeighbor is a CIM wrapper over the same NetIO neighbour table, so reading works without admin (CONFIRMED for read via this path; the P/Invoke call itself INFERRED identical). Writing entries (CreateIpNetEntry2, FlushIpNetTable2) does need admin per general knowledge but was not verified here.
- Workflow: after a UDP 4201 or TCP 9100 probe, the target IP is in the ARP cache (state Reachable/Stale), so call GetIpNetTable2 then look up by IP -> MAC -> OUI (item 8). Entries age out in ~15-45 s; read soon after probing or call SendARP/ResolveIpNetEntry2 per IP. Only same-subnet hosts have a MAC; routed hosts show the gateway MAC, so never attribute that MAC to the printer.

---------------------------------------------------------------------------------------------------

## Summary of what is NOT verified (read before building)
1. Multicast group address for Zebra discovery (docs say 241.0.1.55; unverified).
2. Response layout on Link-OS printers (ZT231); the hexdump is from a ZebraNet wired print server; reply has no model name, TCP port or MAC.
3. Exact reply termination and best wait for SGD getvar (code uses quote-delimited parsing, 1-3 s deadlines).
4. SNMP default on an EMEA ZT231 bought after 2025-08-01 is OFF per PG; PWG device-ID OID 2699 support unknown (not seen on Zebra); Argox SNMP support unknown.
5. Bonjour/mDNS service types for Link-OS: unknown (no evidence of advertisement).
6. Non-admin ACL on the USBPRINT interface and behaviour when a spooler queue exists: no document; only code that works.
7. Whether usbprint still binds when the printer is in `usb.device.mode = composite`.
8. All ZT231-specific behaviours are by extension from other Link-OS models (ZT410/ZT411/ZD230); nothing here was tested on hardware.

---------------------------------------------------------------------------------------------------

## Verified on our own hardware (2026-10-14, office network 192.168.1.0/24)

- **Argox O4-250 (192.168.1.19):**
  - It answers SNMPv1 GET sysDescr with community `public`; the reply starts `ARGOX O4`. This settles item 5's "Argox SNMP: UNKNOWN" for our unit.
  - Its MAC is 78-5F-4C-00-55-67 (Argox OUI) in `Get-NetNeighbor`, read without admin rights.
  - Earlier spike: no reply to `~HI`, `<SOH>A` or `UQ` on 9100, and nothing printed. Its HTTP root returns non-text content.
- **Canon MF460 (192.168.1.15):**
  - SNMP sysDescr `Canon MF460 Series /P`, MAC 6C-3C-7C-F4-0F-48.
  - Its HTTP title names "MF460 Series".
  - It accepts TCP 9100, so any probe bytes sent to it would print as a page.
- **Dev PC adapters:**
  - Ethernet 192.168.1.7/24;
  - Hyper-V `vEthernet (Default Switch)` 172.25.160.1/20, a virtual adapter that a search must skip.
- **USB:** no USB printer was attached; `C:\Windows\INF\usbprint.inf` is present.

## Verified on our own hardware (2026-10-26, office Argox O4-250 in PPLZ mode)

- **USB with no vendor driver.**
  - The in-box usbprint binds it as `USB\VID_1664&PID_0D10\80384F461093`.
  - `IOCTL_USBPRINT_GET_1284_ID` returns `46 46` + `MFG:ARGOX ;CMD:PPLZ;MDL:O4-250 PPLZ;CLS:PRINTER;DES:ARGOX O4-250 PPL`. The 2-byte prefix is the count written into both bytes, and DES is cut short.
  - A cancelled overlapped read returns.
  - A 0-byte write fails with 1450.
  - Two handles can be open at once.
  - Printing works.
- **`~HS` answers over USB (14 ms) and over TCP 9100 (about 110 ms), in the full Zebra framing.**
  - The Argox does NOT answer `~HI` (§4), so `~HS` is the only status channel it has.
  - Ready state: `<STX>030,0,0,0059,000,0,0,0,000,0,0,0<ETX><CR><LF><STX>000,0,0,0,0,2,5,0,00000000,1,002<ETX><CR><LF><STX>0000,0<ETX><CR><LF>`.
  - Head open: String 2 field 3 becomes `1` (`000,0,1,0,0,2,5,0,00000000,1,002`). The printer kept answering while the head was open, at 123 ms.
  - Taking the labels out, and pressing the button, changed nothing in a 2-minute poll. Paper-out is probably only detected on a feed attempt; this is not yet verified.
