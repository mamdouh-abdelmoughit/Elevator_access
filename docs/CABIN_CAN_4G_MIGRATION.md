# Cabin-Reader / CAN-Bus / 4G Migration — What I Understood

> **Update (Oct 2026) — decisions that supersede parts of this document:**
> - Production stays on **WiFi** (`src/main_cabin_can_wifi_test.cpp`, env `cabin-master`); the
>   4G variant is shelved as `src/main_cabin_can.cpp.bak`.
> - A swipe **unlocks** the allowed car-call buttons for `unlockSeconds` (the resident presses the
>   one they want); it no longer presses buttons itself.
> - Floor rule: **RDC + home floor + top floor** (top floor = shared roof/terrace, building setting
>   `roofAccess`). Staff and custom profiles exist too — see backend `src/services/accessRules.js`.
> - Floor relays are on **direct GPIO** (RDC + 14 floors max); one MCP23017 is kept **only for the
>   16 status inputs**. Wiring: `docs/CABIN_RELAY_WIRING.md`.
> - Residents and the floor count are managed by the **Syndic app** (`frontend_syndic`).

This describes the new elevator configuration for the 17-floor client, as I understood it
from our conversation, plus the wiring walkthrough and the firmware/backend/frontend
implications. Please correct anything that's off before we treat this as final.

## 1. Why this change

The old design (`src/main.cpp`) wires up to 8 Wiegand readers directly to the master
ESP32 — 4 native + 4 relayed through a slave ESP32 over UART (`src/slave.cpp.bak`).
That assumed **one reader per floor, at the hall/landing**, calling the elevator to that
floor. Two problems killed this for the new client:

- Raw Wiegand (open-collector, unbalanced, no error checking) doesn't survive long,
  noisy cable runs — and a 17-floor shaft is long. It also doesn't scale past a handful
  of physically-wired GPIOs on one controller.
- This client's actual requirement is different anyway: **one reader inside the cabin**,
  not one per floor. A resident badges once, inside the elevator car, and the car should
  automatically go to *their* assigned floor (a "car call", not a "hall call").

## 2. New hardware topology

```
[Machine room / top floor — with motor & controller]
   ESP32-S3 + SIM module (4G/3G)  ── UART (AT) ──> SIM7600/A7670-class modem
        │
        │  TWAI (CAN controller, built into ESP32-S3)
        ▼
   SN65HVD230 (3.3V CAN transceiver)
        │
        │  CAN_H / CAN_L (twisted pair) + GND, 120Ω termination each end
        │  runs down the elevator shaft (traveling cable)
        ▼
[Cabin]
   MCP2515 + TJA1050 module (SPI CAN controller+transceiver)
        │  SPI (MOSI/MISO/SCK/CS) + INT
        ▼
   Arduino Nano  ── Wiegand D0/D1 ──>  RFID reader ("lecteur") mounted in the cabin
```

Roles:
- **ESP32-S3 + SIM module** — stays at the top, next to the existing motor/controller
  equipment, same physical spot as today's master. It keeps doing what `main.cpp`
  already does (fetch config/permissions from the backend, publish status over MQTT,
  receive remote commands, drive the floor-call relays) — the only things that change
  are *where the internet comes from* (cellular instead of WiFi) and *where the card
  scan comes from* (a CAN frame instead of a local GPIO interrupt).
- **SN65HVD230** — just a transceiver: converts the ESP32's CAN TX/RX logic signals
  into differential CAN_H/CAN_L for the bus. No logic of its own.
- **CAN bus** — the long run down the shaft. This is the part that replaces raw
  Wiegand-over-distance; CAN is designed for exactly this (differential, noise-immune,
  built-in error detection, used in cars/elevators/industrial gear for this reason).
- **MCP2515 + TJA1050 module** — the cabin-side CAN node. TJA1050 is the transceiver
  (same role as the SN65HVD230, just a 5V-tolerant variant sold on these breakout
  boards), MCP2515 is the CAN controller talked to over SPI by the Nano.
- **Arduino Nano** — the "translator" you described: it reads the Wiegand card scan
  from the reader in the cabin (same manual ISR bit-banging technique already used in
  `main.cpp`/`slave.cpp.bak`) and re-packages the decoded card code into a CAN frame it
  hands to the MCP2515 to put on the bus. It does **not** make any access decision —
  it's a dumb bridge. All permission logic still lives on the master ESP32 (and the
  backend), same as today.

## 3. Wiegand → CAN frame

To keep the master's decoding logic unchanged, the Nano decodes Wiegand exactly like
the existing readers do (`cleanCode = (rawCode >> 1) & 0x00FFFFFF` after ≥26 bits), then
sends it as a CAN frame:

- **CAN ID**: `0x100` (standard 11-bit ID), reserved for "cabin reader card scan".
- **Payload** (8 bytes): bytes 0–3 = card code as `uint32` little-endian, byte 4 =
  reader/source id (`0x01`, room to add more cabin readers later), bytes 5–7 reserved.
- Bus bitrate: **125 kbps** (proposal — reliable over long/noisy shaft cable; can go to
  250/500 kbps if the cable run turns out short and clean).

This is a **one-directional bus for now** (Nano → Master only). The design leaves room
to add cabin-side sensors/actuators on the same bus later (door status, cabin display)
without changing the master's core logic.

## 4. Floor + RDC access logic (the actual behavior change)

Today, `checkGlobalAccess()` only checks "is this card code in the list at all" — floor
selection is implicit, decided by *which physical reader* triggered the scan
(Reader 1 → `RELAY_F1`, etc.). The `Permission.relay` field in Postgres is fetched but
**currently ignored** by the firmware (`fetchPermissions()` hardcodes `relay = 1` for
every rule).

With a single cabin reader, that trick no longer works — the firmware now has to know
*which floor* a given card is allowed to reach, and press that floor's car-call button
itself. So:

- `Permission.relay` is repurposed to mean **assigned floor number** (0 = RDC,
  1–17 = the client's floors) instead of an arbitrary relay index.
- On a card scan, the master looks up the card's assigned floor and pulses **two**
  relays: the RDC relay (ground floor is always reachable — proposed default, see
  open question below) and the assigned-floor relay.
- Floor→relay pin mapping needs up to **18 outputs** (17 floors + RDC), which won't fit
  on the direct GPIOs + a single MCP23017 (16 lines) the way the old board did — the new
  master firmware assumes **two MCP23017s** (I2C addresses `0x20` and `0x21`) purely for
  floor buttons, separate from whatever's left for door/safety signals if this
  controller also keeps those.

## 5. Backend changes — implemented

- `Elevator.floorCount` (nullable `Int`) added to `schema.prisma`, migration at
  `prisma/migrations/20260801000000_add_elevator_floor_count/`. **Not applied to the
  live Railway DB yet** — run `npx prisma migrate deploy` when ready, I didn't do this
  automatically since it's a shared/production database.
- `Permission.relay` is now explicitly "floor number" for elevators that have a
  `floorCount` set (0 = RDC). Elevators with `floorCount = null` keep the old
  per-floor-reader meaning — no behavior change for them.
- New endpoint `POST /elevators/:id/residents` (`elevatorController.createResident`,
  wired in `elevatorRoutes.js`) — body `{ residentName, cardCode, floor }`. Creates the
  `Card` and, transactionally, a `Permission` for the chosen floor **plus** one for RDC
  (floor 0) if the chosen floor isn't already RDC — implementing the "always has RDC"
  rule you confirmed. Authorized for ADMIN or the elevator's assigned Syndic
  (`elevator.managerId === req.user.id`), same pattern as the existing
  `toggleCardAccess`. Publishes `UPDATE_PERMISSIONS` over MQTT same as before.
- `getElevatorWhitelist` now also selects `relay` on permissions so the dashboard can
  show which floor(s) each card is allowed to reach.
- Confirmed per your last message: **no default "roof" floor** — only RDC is granted
  automatically, nothing else.

## 6. Frontend changes — implemented (web_dashboard)

- Add-Elevator form (`elevators/add/page.jsx`) has a new optional "Nombre d'étages"
  field → sent as `floorCount`. Leave blank for the older per-floor-reader elevators.
- Elevator detail page (`elevators/[id]/page.jsx`) gained an "Ajouter un résident" form
  — name, card code, and a floor `<select>` (RDC + 1..floorCount) — shown only when
  `elevator.floorCount` is set and the viewer is ADMIN or that elevator's Syndic. The
  Syndic literally cannot pick more than one floor; RDC is granted automatically and
  isn't a second thing they need to select. The whitelist table now shows a "Étages"
  column (e.g. "Étage 5, RDC") for these elevators.
- I did **not** touch `frontend_syndic` (the Expo mobile app) — it currently has no
  resident-management screen at all, and the web dashboard already has role-aware
  Syndic access to this same elevator page, so I extended that instead. Say the word if
  you actually want this in the mobile app too.

## 7. Firmware deliverables (this migration)

Two new PlatformIO environments/files, kept **alongside** the existing ones (this is a
new elevator hardware variant, not a replacement — sites that still use direct
per-floor readers keep building `main.cpp` as-is):

- `esp32/src/main_cabin_can.cpp` + `[env:esp32-s3-cabin-can]` — the new master: CAN
  receive (ESP32-S3 built-in TWAI) instead of local Wiegand ISRs/UART bridge, TinyGSM
  cellular modem instead of `WiFiClient`, floor+RDC permission logic.
- `esp32/src/nano_cabin_bridge.cpp` + `[env:nano-cabin-bridge]` — the Nano: Wiegand
  reader ISRs (single reader) + MCP2515 CAN transmit.

## 8b. Bench-test wiring (before this goes anywhere near the real elevator)

Two nodes, connected only by a short CAN pair on your desk. Pin numbers match
`main_cabin_can.cpp` / `nano_cabin_bridge.cpp` as written.

### Node 1 — "cabin" bench: Arduino Nano + MCP2515/TJA1050 + Wiegand reader

| MCP2515 module pin | Nano pin |
|---|---|
| VCC | 5V |
| GND | GND |
| CS  | D10 |
| SO (MISO) | D12 |
| SI (MOSI) | D11 |
| SCK | D13 |
| INT | **not connected** (this node only transmits, no need to receive) |

| Reader pin | Nano pin |
|---|---|
| D0 | D2 |
| D1 | D3 |
| GND | GND |
| +V  | reader's own supply (12V for most readers) — **do not** power a 12V reader from the Nano's 5V pin. D0/D1 are open-collector, so the reader's supply voltage doesn't matter to the Nano side as long as grounds are common. |

### Node 2 — "machine room" bench: ESP32-S3 + SN65HVD230 (+ SIM module later)

| SN65HVD230 pin | ESP32-S3 pin |
|---|---|
| VCC | 3V3 |
| GND | GND |
| D (driver in)  | GPIO4 (`CAN_TX_PIN`) |
| R (receiver out) | GPIO5 (`CAN_RX_PIN`) |
| CANH / CANL | → to the bus, see below |

Leave the SIM module disconnected for the first CAN test — `main_cabin_can.cpp` still
runs `pollCan()` in `loop()` even if the cellular link never comes up (it just falls
back to `loadOfflineBackup()`), so you can validate the whole reader→CAN→floor-lookup
chain with zero cellular setup. When you do wire the SIM module in:
- **Do not** power it from the ESP32 board's 3.3V regulator or from a laptop's USB port.
  4G modules pull current spikes up to ~2A on transmit, more than either can supply —
  you'll get random ESP32 brownouts that look like a software bug. Give the modem its
  own 3.7–4.2V supply (LiPo, or a bench supply per its datasheet) with grounds tied to
  the ESP32's.
- Antenna must be attached before power-up — transmitting without one risks the PA.
- `SIM TXD → ESP32 GPIO17`, `SIM RXD → ESP32 GPIO18`, `SIM PWRKEY → ESP32 GPIO14`, `SIM GND → ESP32 GND`.

### Joining the bus

- `SN65HVD230 CANH ↔ MCP2515 module CANH`, `SN65HVD230 CANL ↔ MCP2515 module CANL`.
- **120Ω termination resistor across CANH/CANL at each end of the bus** (i.e. one at
  the SN65HVD230 side, one at the MCP2515 side — not in the middle). Many MCP2515
  breakout boards already have one built in behind a solder-jumper labelled `R120` or
  similar — check before adding a second one, since terminating both ends *and* the
  onboard jumper on the same node double-terminates that end.
- **Tie the two nodes' grounds together** even though CAN is differential — without a
  shared ground reference the bus won't work reliably.

### Bring-up order (don't wire it all at once)

1. Flash `nano_cabin_bridge.cpp` alone, open its Serial Monitor, badge the reader —
   you should see the `Scanned: bits=... clean=...` line. (`sendMsgBuf()` may report a
   TX error at this stage since there's no second node yet to ACK the frame — that's
   expected and fine, it just confirms the Wiegand decode works.)
2. Flash `main_cabin_can.cpp` alone, confirm `CAN bus up (125 kbps).` prints and there
   are no repeating bus-error prints.
3. Join the two nodes on the CAN pair (terminated, common ground) and badge the reader
   again — you should now see `[CAN] Card scanned: ...` on the ESP32 side. This is the
   point where floor/RDC logic can be tested using `loadOfflineBackup()`'s cached
   permissions, with no backend or SIM connectivity required at all.
4. Only after that works, bring in the SIM module and backend/MQTT connectivity.

## 8. Assumptions / things to confirm before this is final

1. **Exact SIM module.** I've written the master against **TinyGSM with a SIM7600-class
   modem** (`TINY_GSM_MODEM_SIM7600`) because it's the most common 4G/3G module paired
   with ESP32 boards and TinyGSM abstracts most AT-command differences behind that
   `#define` — but if you bought a specific board (SIM7600E/A7670C/EC200U/etc.), tell me
   the exact model and I'll set the right modem macro + confirm the PWRKEY power-on
   sequence, since that part *does* differ between modules.
2. **CAN transceiver pins on the ESP32-S3.** I picked `CAN_TX = GPIO4`, `CAN_RX = GPIO5`
   as placeholders (clearly marked in the new file) — since the cabin reader and UART
   bridge pins are now freed up, most GPIOs are available; let me know if you want
   specific pins to match your board layout.
3. ~~RDC handling~~ — **confirmed**: RDC (floor 0) is always granted alongside whichever
   floor the Syndic picks for the resident; no separate "roof/last floor" default. This
   is implemented on the backend (`createResident` always adds the RDC permission) —
   firmware in `main_cabin_can.cpp` still needs its `RDC_ALWAYS_GRANTED` flag, which
   already matches this.
4. **CAN bus bitrate/cable length** — 125 kbps assumed; tell me the actual shaft length
   if you want this tuned.
5. **Relay count** — confirming 17 floors + RDC = 18 buttons to drive, wired through two
   MCP23017 boards. If this controller also still needs door open/close/shutdown/
   revision-mode relays like the original design, those need separate GPIO headroom too
   — let me know if that's still in scope for this client.
