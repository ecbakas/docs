# Printer discovery and zero-IT setup: design

**Status:** approved in conversation 2026-10-14 (sections 1–5), written for review.
**Repos:**
- `print-helper` (ayasofyazilim-clomerce/unirefund-print-helper);
- `web-app` (`apps/web`, sticker print dialog).

**Builds on:** [2026-10-14-sticker-zpl-printing-design.md](2026-10-14-sticker-zpl-printing-design.md).
**Protocol facts and sources:** [2026-10-14-printer-discovery-research.md](2026-10-14-printer-discovery-research.md). Every Zebra wire detail below comes from there.

## 1. Goal

Our clients have no IT knowledge. The promise to them:

> Download Unirefund Print Helper, plug in your Zebra (cable or network), and it works.

An admin must be able to set up a label printer without knowing what an IP address, a port, dpi or a printer driver is.

**Success:**
- **Network:** a Zebra or Argox on the same network appears by name and model within about 8 seconds of opening Manage printers.
- **USB:** a Zebra plugged in by USB appears the same way, **with no Zebra driver installed**.
- **One click** creates a working printer, with dpi, ribbon mode and roll read from the printer when it can tell us.
- **Guided alignment:** a yes/no question plus arrow buttons. No millimetre fields.
- **After setup, it keeps working:**
  - the printer is re-found silently when its IP changes;
  - printer problems such as "out of labels" appear in plain words before anything is sent.

## 2. Constraints and non-goals

- **No backend work.**
  - The backend Device Service (it has `PrintTag` / `PrintCustomTemplate` commands and a SignalR hub) is **not** used. That was the user's decision.
  - Everything stays local: the portal talks to the helper on the same PC.
- **Platform and install:** Windows, plus macOS since helper PR #3 made Core cross-platform. Per-user install on Windows, **no admin rights**, **no vendor driver**. Driverless USB (§5) is Windows-only.
- **Unchanged security rules:** the Origin and Host allowlists and the 127.0.0.1-only listener stay exactly as they are.
- **Old portal builds keep working:** `GET /printers?scan=1` and `POST /print` with a `target` stay as they are.
- **Out of scope:**
  - Bluetooth and serial (COM);
  - Bonjour/mDNS, which Zebra doesn't document (research §6);
  - IPP;
  - changing printer settings. The helper only reads from printers.
- **No Zebra hardware is available to us.** Zebra behaviour is built from Zebra's documentation and verified at the first client, so §11 makes sure unverified Zebra code can never block printing.

## 3. What the admin sees (web)

All of this needs helper `apiVersion >= 2` with the matching entry in `features` (§6). With an older helper, the current sheet stays as it is, and the dialog shows the existing `HelperOutdated` text.

### 3.1 Automatic search

Opening **Manage printers** starts `GET /printers/search`. While it runs, the sheet says "Looking for printers on your network and on USB…". Afterwards a **Search again** button is shown.

Results appear as cards, label printers first:

- **Zebra ZT231 · 203 dpi · Network**: **Use this printer**
- **Zebra ZT231 · 300 dpi · USB cable**: **Use this printer**
- **Argox O4-250 · Network**: **Use this printer**
- Printers already saved show **Added** instead of the button. A saved printer matches a card by `printerId`.
- Non-label printers are collapsed under "Other printers (not label printers)". They can't be added from there.

### 3.2 One-click add

**Use this printer** creates a `PrinterProfile` with no further fields:

| Field | Source |
|---|---|
| name | `maker model`, e.g. "Zebra ZT231" |
| preset | from model and dpi: ZT231 at 203 or 300 → `zt231-203` / `zt231-300`; Argox → `argox-o4-250`; another Zebra → closest preset by dpi |
| dpi | as reported. If unknown, a one-tap question: "203 or 300 dpi? It's printed on the label on the back of the printer" |
| ribbon | `printMethod`: thermal transfer → `ribbon`, direct thermal → `direct`, unknown → `printer` (never forces `^MT`) |
| roll / layout | from `labelLengthMm`: about 100 mm (±6) → pre-printed 70x100 roll; about 70 mm (±6) → blank 100x70 roll with artwork. If unknown or outside both ranges, ask "Which roll is loaded?" with two pictures |
| connection | `{ kind: "found", printerId, connection, lastAddress? }` |

The rotation follows the roll and the preset, as in the current geometry: pre-printed rolls use rotation 0, and a blank roll on the Argox uses 90.

### 3.3 Guided alignment (right after adding, and from the printer's card)

1. **Print a test label.**
   - On a pre-printed roll: a square exactly where the QR goes.
   - On a blank roll: a frame 2 mm inside the label edge.
2. Next to it, a picture of a correct result and the question: "Is the square inside the printed box?" (or, on a blank roll, "Is the whole frame on the label?").
3. **Yes** saves the printer and finishes.
4. **No** shows four arrow buttons, each moving the print 1 mm, plus **Print again**. The offsets change in the profile's `offsetXMm` / `offsetYMm`, within the existing ±100 mm bounds.

### 3.4 Nothing found

A plain checklist:
- Is the printer switched on?
- Is the cable plugged in, or is it connected to the same network as this computer?
- **Search again**

Under **Advanced**:
- **Enter an address by hand** (private IPv4, port 9100, as today);
- a tip: "On a Zebra, hold the FEED button for 2 seconds to print its network settings; the address is on that label."

### 3.5 Advanced

The current editor (size, rotation, offsets, ribbon, connection, host or queue, alignment rulers) moves under an **Advanced** disclosure, unchanged. Everything the current sheet can do stays possible.

### 3.6 While printing

- **Before a run**, if the printer supports status: `GET /printers/{id}/status`.
  - Problems are shown in plain words ("The printer is out of labels." and so on), and nothing is sent.
  - "Unknown" (the Argox, or no reply) prints as today.
  - On a Zebra that answered `~HS` at search time, a timeout shows "Couldn't read the printer's state. Check it has labels and the head is closed" with **Print anyway**. Zebra may not answer `~HS` while in a fault (research §3).
- **When the helper reports a new address** after re-finding (§8), the profile's `lastAddress` is updated and a toast says "Printer found at a new address".
- **Errors** map to the messages in §9.

## 4. Helper: finding printers on the network

New `Discovery` pipeline in `Unirefund.PrintHelper.Core`. One search at a time: a second request while a search runs awaits the same task and gets the same result. A search takes about 8 s.

### 4.1 Networks searched

- **Which adapters:** those that are up and connected, with a private IPv4 (RFC 1918), excluding:
  - loopback;
  - tunnel and PPP adapters;
  - virtual adapters: Hyper-V `vEthernet`, WSL, Docker, VPN. This means a description or name containing "Hyper-V", "vEthernet", "WSL", "Docker", "VirtualBox", "VMware" or "TAP", or `NetworkInterfaceType` of Tunnel/Ppp.
- **This dev PC** has a Hyper-V Default Switch at 172.25.160.1/20 that must be skipped.
- **Any mask is accepted.** The address set is the adapter's subnet, capped at the **1,024 addresses around the PC's own address** (its /22) when the subnet is larger. Network and broadcast addresses and the PC itself are excluded.

### 4.2 Candidates

Four sources run in parallel, and their results are merged by IPv4 address.

| Source | How | Gives |
|---|---|---|
| Port sweep | TCP connect to `:9100`, 1.5 s timeout, up to 256 concurrent, then close **without sending a byte** | "accepts raw printing" |
| SNMP | One SNMPv1 GET of sysDescr `1.3.6.1.2.1.1.1.0` to every candidate address, community `public`. Wait 2 s total. Phase 1 asks for sysDescr only, because an SNMPv1 GET for several OIDs fails as a whole when one is missing (the Argox has no Zebra OIDs). A Zebra's model and dpi come from its description and its own answers | description (model and dpi for Zebras) |
| Zebra discovery | UDP `2E 2C 3A 01 00 00` to `255.255.255.255:4201` and each adapter's directed broadcast, 3 rounds 1 s apart. Replies are de-duplicated by source IP | "a Zebra is here". Phase 1 doesn't parse the reply's fields: the layout is known only for old print servers (research §1) |
| Neighbour table | The `arp` tool after the sweep, so the probed hosts are in the cache: `arp -a` on Windows, `arp -an` on macOS. It needs no admin rights and is parsed by address only, so localised headers don't matter. Chosen over `GetIpNetTable2` when the plan was verified, because it also works on macOS | MAC → maker through the OUI table (research §8: Zebra Technologies OUIs, Argox `78:5F:4C`). Only for hosts on the adapter's own subnet; routed hosts show the gateway's MAC, which must never be attributed to the printer |

### 4.3 Recognising a candidate

Steps run in this order, and later steps fill only fields still unknown:

1. **Zebra commands** over the print port, **only when the candidate is already marked as Zebra** by its OUI, an SNMP description containing "Zebra", or a discovery reply. **Probing rule:** the helper never sends any byte to an unrecognised port-9100 device, because an office printer prints whatever it receives as a page.

   On one TCP connection, with a 3 s connect deadline and a 1.5 s per-reply deadline, it sends:
   - `~HI` → `model,firmware,dpm,mem`, where dpm 8 = 203 dpi and 12 = 300 dpi. Strip STX/ETX and CR/LF;
   - `! U1 getvar "device.unique_id"\r\n` → the serial;
   - `! U1 getvar "ezpl.print_method"\r\n` → `"thermal trans"` or `"direct thermal"`;
   - `! U1 getvar "zpl.label_length"\r\n` → dots, converted with the dpi to mm;
   - `! U1 getvar "device.languages"\r\n` → contains `zpl` or not;
   - `! U1 getvar "ip.port"\r\n` → the print port, in case it isn't 9100.

   Replies are double-quoted strings. A reply of `"?"` or empty means unknown.
2. **SNMP** (already collected): Zebra model and serial OIDs; sysDescr for every maker. Verified here: the Argox answers `ARGOX O4…` and the Canon `Canon MF460 Series /P`.
3. **OUI maker.** The model stays unknown.
4. **HTTP title** (`GET http://ip/`, 2 s), only for candidates still unnamed. Used for display only ("Canon MF460 Series").

**Classification.** A candidate is a **label printer** when any of these holds:
- maker Zebra or Argox (from OUI, SNMP or discovery);
- `device.languages` contains `zpl`;
- an SNMP description contains "ZPL".

Everything else is listed as an other printer.

**Printer id.** The first available of:
- `mac:<MAC>`, same subnet only, and only when no other address in the neighbour table shares that MAC (range extenders, VMs and proxy ARP do);
- `zebra:<serial>`;
- `ip:<host>:<port>` (no re-finding possible).

The hardware address comes first, so a Zebra that is out of labels or slow to answer keeps its id and still prints (§11). This was revised after the phase 1 review; the first draft put the serial first.

**Logging.** Raw identification replies (model strings, SNMP descriptions, discovery fields) are logged at Information. They are printer metadata, not label data, and they let us debug a client's search from their log file.

## 5. Helper: USB without a driver

### 5.1 Finding

- **Enumeration:** `SetupDiGetClassDevs(GUID_DEVINTERFACE_USBPRINT {28D78FAD-5A12-11D1-AE5B-0000F803A8C2}, DIGCF_PRESENT | DIGCF_DEVICEINTERFACE)` → device paths like `\\?\usb#vid_0a5f&pid_xxxx#<serial>#{28d78fad-…}`. Windows' in-box `usbprint.inf` binds every USB printer-class device with no vendor driver (research §7b).
- **Identity:**
  - `IOCTL_USBPRINT_GET_1284_ID` (`0x220034`), with a 4,094-byte buffer and a 2-byte length prefix in either byte order, trimmed. Parsed into `MFG`/`MANUFACTURER`, `MDL`/`MODEL` and `CMD`/`COMMAND SET`.
  - VID 0x0A5F = Zebra, VID 0x1664 = Argox.
  - For Zebra, the same `~HI` / getvar exchange as §4.3, over the device: write, then overlapped `ReadFile` with a 1.5 s timeout and `CancelIoEx`. A plain `ReadFile` blocks forever (research §7d).
- **Printer id:** `usb:<VID>:<PID>:<USB serial>` taken from the device path. This survives a re-plug into another port. A device with no serial falls back to the path, and is then port-bound.

### 5.2 Printing

- **Per job:** open the device path, write, close.
  - Open: `CreateFile(GENERIC_READ|GENERIC_WRITE, FILE_SHARE_READ|FILE_SHARE_WRITE, OPEN_EXISTING, FILE_FLAG_OVERLAPPED)`.
  - Write: overlapped `WriteFile` in 64 KB chunks, with an inactivity timeout of 10 s per chunk.
  - Close.
- **The same `TargetLocks` rule applies:** one job at a time per printer id.
- **A Windows printer for the same device** (vendor driver installed) is matched to the USB device by model name, and the two are shown as one card with `connection: "usb"`.
  - If the direct open fails with `ERROR_SHARING_VIOLATION`, `ERROR_ACCESS_DENIED` or `ERROR_BUSY`, the job goes through that Windows printer (existing winspool RAW path).
  - With no Windows printer to fall back to, the error is `printer-busy`.
- **Known risk:** one Argox C# project notes that some Argox models don't respond through usbprint (research §7c). The office Argox's USB port lets us test exactly this (§11).

## 6. API version 2

`/status` reports `apiVersion: 2` plus `features`, a list of `"search"`, `"usb"` and `"status"` that grows with each phase (§12). The web gates each feature on that list, not on version numbers. Every existing endpoint and contract stays as it is.

### `GET /printers/search`

```json
{
  "printers": [
    {
      "id": "zebra:99J000800418",
      "connection": "network",
      "labelPrinter": true,
      "maker": "Zebra",
      "model": "ZT231",
      "dpi": 203,
      "printMethod": "thermal-transfer",
      "labelLengthMm": 100,
      "address": { "host": "192.168.1.20", "port": 9100 },
      "windowsPrinter": null,
      "statusSupported": true,
      "recognisedBy": ["zebra-commands", "snmp", "mac"]
    }
  ],
  "searchedMs": 6400
}
```

**Field values:**
- `connection`: `"network"`, `"usb"` or `"windows"`.
- `printMethod`: `"thermal-transfer"`, `"direct-thermal"` or `null`.
- `maker`, `model`, `dpi`, `printMethod` and `labelLengthMm` may each be `null`.
- `windowsPrinter`: the queue name for a `"windows"` connection, or for a USB device with a matched queue.
- `statusSupported`: true for Zebras that answered `~HI`.

### `GET /printers/{id}/status`

```json
{ "state": "ready" }
{ "state": "problem", "problems": ["paper-out", "head-open", "paused", "ribbon-out"] }
{ "state": "unknown" }
```

`~HS` over network or USB, with a 2 s deadline. Mapping:
- String 1 field 2 = paper out;
- String 1 field 3 = paused;
- String 2 field 3 = head open;
- String 2 field 4 = ribbon out.

A printer that doesn't support status, or doesn't reply, returns `unknown`.

### `POST /print`

Additionally accepts:

```json
{ "printerId": "zebra:99J000800418", "lastAddress": { "host": "192.168.1.20", "port": 9100 }, "data": "^XA…", "jobName": "…" }
```

The response is unchanged, plus `"address"` when the printer was re-found somewhere else.

**New error codes:**
- `printer-not-found` (404): searched and not found;
- `printer-busy` (409);
- `not-a-label-printer` (400).

Printer problems come from the status endpoint, not from `/print`.

## 7. Security rules

1. Origin and Host checks: unchanged.
2. **By printer id**, the helper prints only to printers in its own registry: the in-memory results of its searches since start. The web can't name a device path, a queue it didn't list, or an arbitrary host:port.
3. **After a helper restart** (empty registry), a `printerId` plus `lastAddress` is accepted only after verification. For a `mac:` id, the helper checks the neighbour table shows that MAC at the address and nowhere else. A `zebra:` id is never verified by asking the device: it prints where a search in the last 30 s saw it, and otherwise the helper searches. If verification fails, it runs a search.
4. **Ports:**
   - 9100 is always allowed for private IPv4, as today;
   - any other port only when the printer itself reported it (`ip.port` getvar or a discovery reply) and it's recorded in the registry. **Phase 1 prints on 9100 only**: the reported port can only be read over 9100 itself, and the discovery reply carries none;
   - the legacy `target` form stays 9100-only.
5. **Read-only probing:** the helper only sends `~HI`, `~HS` and `getvar`, never `setvar` or `do`. It never probes unrecognised devices (§4.3).
6. **Searching is serialised** (one at a time, shared result), which bounds the network traffic a page can cause.

## 8. Re-finding after an IP change

When printing to a network printer by id:

1. **Check the last address.** For a `mac:` id: does the neighbour table show that MAC at `lastAddress` (or the registry's address), and only there? If yes, print. A positive check is reused for 60 s, so the jobs of one run don't each open a connection. For a `zebra:` id, see §7.3.
2. **If it's unreachable or a different device:** run a search, or reuse one finished less than 30 s ago, and look the id up.
3. **Found:** print, and return `address` so the web updates the profile.
4. **Not found:** `printer-not-found`.

`ip:` ids (no MAC or serial) can't be re-found. For them, step 2 is skipped and the error is `printer-unreachable`, as today.

## 9. Errors (web messages)

| Code | Message |
|---|---|
| none found | the checklist in §3.4 |
| `printer-not-found` | "The printer isn't on the network. Is it switched on and connected?" |
| `printer-unreachable` (USB) | "The printer isn't connected. Check the USB cable." |
| `printer-busy` | "The printer is busy. Try again in a moment." |
| status `problem` | "The printer is out of labels." · "The print head is open." · "The printer is paused." · "The ribbon has run out." |
| `not-a-label-printer` | "This printer can't print these labels." |
| status timeout on a status-capable Zebra | "Couldn't read the printer's state…" + **Print anyway** |

If one search source fails (SNMP blocked, UDP blocked), the others still return their results. The failure is logged, not shown.

## 10. Testing

**Helper unit tests** (xUnit, no hardware). Each part takes injected sources:
- **Adapter filter:** includes and excludes real adapter descriptions, including `vEthernet (Default Switch)` 172.25.160.1/20 being excluded.
- **Address set:** /24, /23 and /16 inputs, the 1,024 cap, excluding the PC itself.
- **SNMP:** the BER GET encoder; the decoder fed the **real replies captured 2026-10-14** from the Argox (`ARGOX O4…`) and the Canon (`Canon MF460 Series /P`); a malformed-reply test.
- **Zebra reply parsers:** `~HI` (documented `ZT410-200dpi,V75.19.15Z,8,4096KB`), getvar (quoted, `"?"`, empty, and a missing terminator), `~HS` (the documented paper-out capture in research §3).
- **Discovery reply parser:** the documented hexdump, plus truncated, wrong-magic and empty replies.
- **OUI lookup and classification:** Zebra, Argox, Canon and unknown makers.
- **Probing rule:** no bytes are sent to an unrecognised port-9100 host.
- **Id, merge and registry; re-find; security rules 2–5.**
- **USB:** the 1284 ID parser (both length-prefix byte orders), the device-path → id mapping, and the busy-fallback decision.

**Fake Zebra.** An in-test TCP listener answers `~HI`, getvar and `~HS` like the documentation. It drives search → add → status → print end to end, including a fake IP change.

**Web unit tests:**
- a found printer → profile (preset, ribbon, roll ranges, unknown fields → questions);
- arrow nudges and their bounds;
- error-code → message mapping;
- the `apiVersion` gate.

**Walkthrough (browser):** the real helper and the Argox on the network; with a cable, the Argox on USB.

## 11. Verification

| What | Where |
|---|---|
| Argox found and recognised on the network (SNMP `ARGOX O4…`, OUI 78:5F:4C) | **Here**: both already observed 2026-10-14 |
| Canon sorted as an other printer, and never sent probe bytes | **Here** |
| Virtual adapter skipped | **Here** (Hyper-V Default Switch on the dev PC) |
| Driverless USB: enumerate, 1284 ID, print | **Here, if** the office Argox is connected by USB. Its PPLA driver is already on the dev PC, so Windows may also create a queue, which tests the busy fallback |
| Everything Zebra: discovery reply, `~HI`/getvar, roll length, `~HS`, USB VID 0x0A5F, `ip.port` | **First client**, with the helper's log capturing the raw replies |
| Non-admin access to the USB interface | **Here** (standard user) when testing USB |

**Safety net.** A Zebra that doesn't behave as documented still appears through the port sweep and its OUI. Setup then asks for dpi and roll instead of reading them, status shows `unknown`, and printing works as today. Unverified Zebra code can never block printing.

**Known unknowns** (research summary):
- Zebra's discovery reply on Link-OS;
- `~HS` silence in fault states;
- whether Zebra's EMEA "Protected Mode" (purchases after 2025-08-01) restricts getvar;
- whether usbprint still binds in `usb.device.mode = composite`;
- usbprint behaviour alongside a spooler queue.

## 12. Phases

Each phase is a helper release plus a web-app PR. The web shows a feature only when `/status` says the helper supports it.

1. **Network search and setup (helper 1.1.0, apiVersion 2):**
   - helper: §4, §6 (`search`, print by id), §7, §8;
   - web: §3.1–3.5, re-found address update, error messages.
2. **Driverless USB (helper 1.2.0):** §5, plus the USB cards in the web.
3. **Status (helper 1.3.0):** `GET /printers/{id}/status` and the web pre-run check (§3.6).

Earlier follow-ups this design resolves:
- the scanner only handled exact /24 networks;
- virtual adapters slowed the scan;
- scans had no rate limit;
- every scan failure looked like "helper missing".
