# Cabin master: relay and status wiring

Machine-room side of the cabin-reader system: the ESP32-S3 (`src/main_cabin_can_wifi_test.cpp`,
build env `cabin-master`). The CAN side (Nano, MCP2515, SN65HVD230, reader) is in
`CABIN_CAN_4G_MIGRATION.md` §8b and is unchanged.

> **Safety.** All work inside the elevator controller must be done by a qualified lift
> technician with the controller isolated and locked out. The BioSwitch relays only
> interrupt **car-call button signals**. They also drive the 6 remote-control functions,
> which stay exactly as on the previous installation. **Never wire anything into the
> safety chain.** Confirm with the controller manufacturer how car calls behave in
> fire/evacuation mode before go-live.

---

## 1. What gets wired

```
                        MACHINE ROOM (next to the elevator controller)
 ┌────────────────────────────────────────────────────────────────────────────┐
 │  5 V PSU (≥3 A) ──┬──────────────► JD-VCC  16-ch relay board ─► floor-button lines
 │                   └──────────────► JD-VCC   8-ch relay board ─► door/shutdown/revision
 │                                                                            │
 │  ESP32-S3 ── 16 GPIOs ────────────► IN1..IN16 (16-ch)  floors 1..16         │
 │           ── GPIO 39..48 + 35 ────► IN1..IN7  (8-ch)   controls + RDC       │
 │           ── GPIO 11/12 (I2C) ────► MCP23017 ◄── 16 status inputs ◄── controller
 │           ── GPIO 4/5 (CAN) ──────► SN65HVD230 ═══ CAN bus ═══► cabin (Nano + reader)
 └────────────────────────────────────────────────────────────────────────────┘
```

Everything except the cabin node sits in the machine room. The car-call buttons are already
wired from the cabin to the controller through the travelling cable, so they are interrupted
**at the controller terminals**. Nothing new is wired in the cabin apart from the reader and
the Nano.

Building size: up to **RDC + 16 floors** (17 relays).

Behaviour after a valid badge swipe: the relays of the floors the badge may use are closed
for `unlockSeconds`, which the Syndic sets in the app (default 10 s). The resident presses
the button they want. Every other button stays dead. Landing (hall) calls are **not**
touched: anyone can still call the car to their floor.

## 2. Parts

| Qty | Part | Notes |
|---|---|---|
| 1 | ESP32-S3-DevKitC-1 | Check the module: on **N16R8 / N8R8** (octal PSRAM) GPIO 35–37 are unusable. This pin plan avoids them. |
| 1 | 16-channel 5 V relay board, **optocoupler-isolated**, active-LOW inputs, with a **JD-VCC jumper** | Floors 1–16 (all 16 channels). Contacts rated ≥ 1 A / 30 VDC / 250 VAC is plenty for call signals. |
| 1 | 8-channel relay board, same type | Remote controls (IN1–IN6) **+ RDC car call (IN7)**. |
| 1 | MCP23017 breakout | Status inputs. |
| 16 | Signal interfaces, one per status line. Choose after measuring (§6): PC817 optocoupler boards (12–24 VDC in), **or** interposing relays with AC coils, **or** nothing (dry contacts) | |
| 1 | 5 V DC DIN-rail PSU, **≥ 3 A** | Relay coils only. Do not feed coils from the ESP board. |
| — | DIN enclosure, terminal blocks, ferrules, 0.5 mm² wire, 2× 4.7 kΩ (I2C pull-ups if the MCP board has none) | |

**Power budget:** about 75 mA per relay coil. Worst case is "accès libre" with all 17
floor relays plus 6 control relays on, about 1.7 A. A 3 A supply leaves margin.

## 3. ESP32-S3 pin map

| Function | GPIO | Relay board / chip | Channel |
|---|---|---|---|
| **RDC** car call | 35 | **8-ch** | **IN7** |
| Floor 1 | 1 | 16-ch | IN1 |
| Floor 2 | 2 | 16-ch | IN2 |
| Floor 3 | 6 | 16-ch | IN3 |
| Floor 4 | 7 | 16-ch | IN4 |
| Floor 5 | 8 | 16-ch | IN5 |
| Floor 6 | 9 | 16-ch | IN6 |
| Floor 7 | 10 | 16-ch | IN7 |
| Floor 8 | 13 | 16-ch | IN8 |
| Floor 9 | 14 | 16-ch | IN9 |
| Floor 10 | 15 | 16-ch | IN10 |
| Floor 11 | 16 | 16-ch | IN11 |
| Floor 12 | 17 | 16-ch | IN12 |
| Floor 13 | 18 | 16-ch | IN13 |
| Floor 14 | 21 | 16-ch | IN14 |
| Floor 15 | 38 | 16-ch | IN15 |
| Floor 16 | 36 | 16-ch | IN16 |
| Open door (`OPEN_DOOR_*`) | 39 | 8-ch | IN1 |
| Close door (`CLOSE_DOOR_*`) | 40 | 8-ch | IN2 |
| Shutdown (`SHUTDOWN_*`) | 41 | 8-ch | IN3 |
| Revision mode (`REVISION_MODE_*`) | 42 | 8-ch | IN4 |
| Revision up (`REV_MONTEE_*`) | 47 | 8-ch | IN5 |
| Revision down (`REV_DESCENTE_*`) | 48 | 8-ch | IN6 |
| I2C SDA | 11 | MCP23017 | SDA |
| I2C SCL | 12 | MCP23017 | SCL |
| CAN TX | 4 | SN65HVD230 | D |
| CAN RX | 5 | SN65HVD230 | R |

A building with fewer floors simply leaves the upper relays unconnected. The firmware never
energises a floor above `floorCount`, even in free-access mode.

**GPIO 35 and 36** (RDC and floor 16) are only free on modules **without octal PSRAM**: the
module label must not end in `R8` (e.g. `N8R8`, `N16R8`). If yours does, tell us and we move
those two relays to GPIO 19/20 (then flash and monitor through the **UART** USB port only).

**Do not use:** 0, 3, 45, 46 (boot strapping), 19, 20 (USB), 43, 44 (serial monitor),
26–32 (flash), 37. GPIO 48 (board v1.0) or 38 (v1.1) also drives
the on-board RGB LED. That is harmless; the LED may flicker when that relay switches.

## 4. Relay boards: power and logic

For each relay board:

1. **Remove the JD-VCC jumper.**
2. `JD-VCC` → **+5 V of the PSU**. The coil-side `GND` next to it → **PSU 0 V**.
3. `VCC` (logic side, next to the IN pins) → **ESP 3V3**.
4. Logic `GND` (next to VCC) → **ESP GND**.
5. `IN1…` → the GPIOs in §3.

The ESP's 3.3 V only lights the optocoupler LEDs, while the coils run from the separate
5 V supply. Elevator-side noise therefore never reaches the ESP. If your board has no
JD-VCC jumper (non-isolated), join PSU 0 V to ESP GND and power VCC from 5 V. Isolated
boards are strongly preferred.

The inputs are active-LOW: IN = LOW means the coil is on. The firmware drives every pin
to its "locked" level before switching it to an output, so **no relay clicks at boot**.

## 5. Floor buttons (car calls)

### 5.1 Find the car-call terminals

On the controller, each cabin button arrives on its own terminal. The labels depend on the
manufacturer, for example `C0 C1 C2 …`, `AC0…`, `KC…` or "appels cabine", plus a common
(+24 V or 0 V). With the technician, identify for each floor:

- the **call wire** coming from the cabin (travelling cable) and
- the **controller input terminal** it lands on.

> ⚠️ **Check the panel type first.** This method works for **parallel-wired** cabin
> panels, with one wire per button. If the cabin panel talks to the controller over a
> serial bus (CAN/RS485 between the panel and the controller), the individual wires
> don't exist. In that case you need the manufacturer's access-control input instead.

### 5.2 Wire one relay per floor (default, fail-secure)

```
 cabin button wire ──────► relay NO
                            relay COM ──────► controller call input (e.g. C3)
```

1. Disconnect the call wire from the controller terminal.
2. Land it on the relay's **NO** contact.
3. Run a new short wire from that relay's **COM** to the now-empty controller terminal.
4. Repeat for every floor, **including RDC** (card-controlled on this installation),
   following §3: **RDC = 8-ch board IN7**, floor 1 = 16-ch IN1 … floor 16 = 16-ch IN16.

Result: the relay is at rest, so the button is disconnected and dead. After a valid swipe
the relay closes and the button works for the unlock window.

### 5.3 Fail-secure or fail-open: decide with the building

| Mode | Contact used | ESP powered off / rebooting | Firmware |
|---|---|---|---|
| **Fail-secure** (default) | **NO** | All cabin buttons dead; landing calls and door-open still work | `FLOOR_RELAYS_FAIL_OPEN false` |
| Fail-open | **NC** | All cabin buttons work (no access control until the ESP is back) | `FLOOR_RELAYS_FAIL_OPEN true` |

Fail-open keeps the coils of every **locked** button energised all the time (about 1.3 A
continuous for 17 relays). Size the PSU for that and expect more heat.

In normal operation, the Syndic's **"Accès libre"** switch in the app unlocks every button
remotely: useful for moving days, deliveries or emergencies.

### 5.4 Illuminated buttons

On some panels the "call registered" lamp is fed back through the same wire. With the
relay open after the unlock window, the lamp may switch off even though the controller has
latched the call. The car still goes there. Test this with the technician on one floor
before wiring all of them.

## 6. Status inputs (16 signals → MCP23017)

### 6.1 MCP23017 wiring

| MCP23017 | Connect to |
|---|---|
| VDD | ESP 3V3 |
| VSS | ESP GND |
| SDA | GPIO 11 (+4.7 kΩ to 3V3 if the board has no pull-up) |
| SCL | GPIO 12 (+4.7 kΩ to 3V3 if the board has no pull-up) |
| A0, A1, A2 | GND → address **0x20** |
| RESET | **3V3** (never leave floating) |

Inputs (the names are what the apps display):

| MCP pin | Signal | Shown in app as |
|---|---|---|
| GPA0 (0) | CMD_MONTEE | En montée |
| GPA1 (1) | CMD_DESCENTE | En descente |
| GPA2 (2) | CMD_GV | Grande vitesse |
| GPA3 (3) | CMD_PV | Petite vitesse |
| GPA4 (4) | INSPECTION | Mode inspection |
| GPA5 (5) | ML1 | ML1 |
| GPA6 (6) | ML2 | ML2 |
| GPA7 (7) | IMP_ARRET | Impulsion d'arrêt |
| GPB0 (8) | IMP_PV | Impulsion petite vitesse |
| GPB1 (9) | LIMIT_HAUT | Fin de course haute |
| GPB2 (10) | LIMIT_BAS | Fin de course basse |
| GPB3 (11) | SEC_GENERALE | Sécurité générale (alarm) |
| GPB4 (12) | SEC_PORTE_OPEN | Sécurité porte (alarm) |
| GPB5 (13) | OBSTACLE | Obstacle / cellule (alarm) |
| GPB6 (14) | PORTE_PHYSIQUE_OPEN | Porte ouverte |
| GPB7 (15) | FAULT_GENERAL | Défaut général (alarm) |

The firmware enables the MCP's internal pull-ups. **A signal counts as active when its
input is pulled to GND.** The ESP publishes changes within about 150 ms, and a heartbeat
every 30 s.

### 6.2 Identify what each controller signal is

With the technician, measure every signal terminal against the controller's 0 V, once
with the signal active and once inactive:

| Measurement | Signal type | Interface |
|---|---|---|
| ~24 V DC in one state, ~0 V in the other | DC signal | **Case B**: optocoupler |
| ~230 V or ~110 V AC in one state | AC signal | **Case C**: interposing relay |
| No voltage at all; with the controller **off**, continuity between two terminals changes with the state (Ω meter) | Dry contact | **Case A**: direct |

Note which state is "active". If a signal is active when the voltage is *absent*, set its
bit in `STATUS_INVERT_MASK`, for example `0x0010` for pin 4.

### 6.3 Case A: dry contact

```
contact side 1 ──► MCP input (e.g. GPB3)
contact side 2 ──► ESP GND
```

Only for contacts inside the cabinet, with short wires and no other voltage on them. Add
100 nF from the input to GND if the line is long or noisy.

### 6.4 Case B: 12–24 V DC (PC817 optocoupler board, recommended)

```
controller signal ──► opto IN+          opto OUT ──► MCP input
controller 0 V    ──► opto IN−          opto GND ──► ESP GND
                                         opto VCC ──► ESP 3V3 (if the board has one)
```

Signal present → optocoupler conducts → MCP input pulled LOW → active. The controller and
the ESP stay galvanically isolated.

### 6.5 Case C: 110/230 V AC (interposing relay)

Use a DIN relay with an AC coil matching the signal voltage. The coil goes between the
signal and the controller's neutral/return. Wire its **NO** contact as in **Case A**.
**Mains voltage must never reach the ESP enclosure side.** Keep the AC wiring on the
relay's coil terminals only.

## 7. Remote-control relays

These are the same 6 functions as the original master; only the GPIOs changed (§3). Wire
the 8-channel board's contacts exactly as on the previous installation, in parallel with
the controller's corresponding inputs.

- Commands come from the admin app / web dashboard (`POST /elevators/:id/command`).
  Syndics can only toggle "accès libre".
- Each `*_ON` command holds the relay until the matching `*_OFF`. This includes
  `REV_MONTEE_ON` and `REV_DESCENTE_ON`, as before.

## 8. Commissioning checklist

1. **Bench, no elevator wiring.**
   - Flash `cabin-master`.
   - Copy `include/secrets.example.h` to `include/secrets.h` and fill in the site WiFi.
   - At power-up, no relay should click. The serial monitor shows `[FLASH]`, `[CAN] bus up`, `[STATUS] MCP23017 status board ready`.
2. **Register.**
   - Read the MAC from the serial log (`[WIFI] connecting… (MAC …)`).
   - Create the elevator with that MAC in the admin app.
   - The serial log shows `elevator #N`.
3. **Configure.**
   - In the Syndic app: building → number of floors, terrace access, unlock time.
   - Add a test resident with **"Scanner le badge"**: swipe the badge in the cabin and the code fills in by itself.
4. **Swipe test.** The relay LEDs for RDC, the home floor and the top floor light for the
   unlock time. The app's Journal shows the swipe within about a second.
5. **Free access.** Toggle it in the app: all used relays on, then off again.
6. **Status inputs.** Activate each signal (or short the input to GND on the bench). The
   app's home screen shows it live, and a `STATE_CHANGE` entry appears in the Journal.
7. **Elevator wiring, one floor at a time, with the technician.** For each floor check:
   button dead without a badge, works after a swipe, dead again after the window.
8. **Offline test.**
   - Unplug the WiFi router. A swipe must still unlock (the whitelist is kept in flash), and the app shows "Hors ligne" almost immediately (MQTT last-will).
   - Plug it back in. The swipes made offline appear in the Journal marked "reçu en différé".
9. **Reboot test.** Power-cycle the ESP. Buttons stay locked during boot, and the
   configuration and whitelist come back from flash before the network does.
