# 🏗️ Elevator Control System

A complete **end-to-end IoT solution** for modernizing elevator access control.

From the **Syndic's smartphone** to the **Admin's dashboard**, through the **MQTT Broker**, down to the **ESP32 hardware controller** installed in the elevator machine room.

---

## ✨ Overview

This project provides a secure, scalable, and resilient elevator access control system combining **mobile apps**, a **cloud backend**, and **embedded hardware**.

It is designed for:

* Residential & commercial buildings
* Syndic / property management companies
* Elevator maintenance teams
* Offline‑safe access control

---

## 🏗️ Architecture

<img width="366" height="576" alt="image" src="https://github.com/user-attachments/assets/c354c35d-394a-46d8-aa26-9f0a96027187" />

---

## 🔄 Workflow

1. **Syndic** requests a new access card via the mobile app.
2. **Admin** approves the request.
3. **Backend** updates the database and publishes an `UPDATE_PERMISSIONS` command via MQTT.
4. **ESP32** receives the message and downloads the updated whitelist.
5. **Resident swipes card** → Access is granted.

> ✅ Even if Wi‑Fi goes down later, access still works thanks to offline caching.

---

## 🌟 Key Features

### 🤖 Hardware (ESP32‑S3 + MCP23017)

* **Global Access Logic**
  A valid card works on any connected reader (Lobby, Basement, Floors).

* **Real‑Time Telemetry**
  Monitors 16+ safety and status points:

  * Door status
  * Inspection mode
  * Fault signals
  * Limit switches

* **Remote Control**

  * Open / Close doors
  * Revision (Inspection) mode
  * Emergency shutdown

* **Offline Resilience**
  Permissions are stored locally in flash memory.

* **Multi‑Reader Support**
  Handles 3+ Wiegand readers simultaneously without blocking.

---

### 📱 Syndic Portal (Mobile App)

* View only assigned buildings
* Request new cards
* Block / unblock users
* Report issues
* View real‑time elevator status

---

### 🛡️ Admin Dashboard (Mobile App)

* Technician GPS tracking (real‑time)
* Installation wizard (Bluetooth / MAC registration)
* Global access control
* Remote relay control console
* System‑wide monitoring

---

### ☁️ Backend (Node.js & Prisma)

* Role‑based authentication:

  * `ADMIN`
  * `MANAGER (Syndic)`
  * `EMPLOYEE`

* MQTT bridge (API → Device)

* Full audit logging:

  * Card swipes (Granted / Denied)
  * Errors & faults

---

## 🛠️ Tech Stack

| Component   | Technology                                   |
| ----------- | -------------------------------------------- |
| Hardware    | ESP32‑S3, PlatformIO, C++, Arduino Framework |
| Backend     | Node.js, Express, Prisma ORM                 |
| Database    | SQLite / PostgreSQL                          |
| Broker      | HiveMQ (MQTT Protocol)                       |
| Mobile Apps | React Native, Expo, React Navigation         |
| Peripherals | Wiegand Readers, MCP23017, Relay Modules     |

---

## 🔌 Hardware Wiring Guide

### ESP32 → Wiegand Readers

| Reader Wire | Function | ESP32 Pin                               |
| ----------- | -------- | --------------------------------------- |
| Red         | 12V VCC  | External 12V PSU                        |
| Black       | GND      | GND (shared with ESP32)                 |
| Green       | D0       | GPIO 18 (Reader 1) / GPIO 16 (Reader 2) |
| White       | D1       | GPIO 17 (Reader 1) / GPIO 15 (Reader 2) |

> ⚠️ **Important:** Ground must be shared between reader and ESP32.

---

### ESP32 → Relay Module

| Function     | ESP32 Pin |
| ------------ | --------- |
| Open Door    | GPIO 6    |
| Close Door   | GPIO 4    |
| Call Floor 1 | GPIO 20   |

---

## 🚀 Getting Started

### 1️⃣ Backend Setup

```bash
cd backend_elevator
npm install
npx prisma migrate dev --name init
node index.js
```

Server runs on: `http://localhost:3000`

---

### 2️⃣ Mobile Apps Setup

```bash
# Admin App
cd frontend_elevator
npm install
npx expo start

# Syndic App
cd front-syndic
npm install
npx expo start
```

---

### 3️⃣ Hardware Flashing

1. Open `esp32_firmware` in **VS Code**
2. Install **PlatformIO** extension
3. Connect ESP32 via USB
4. Click **Upload** (▶️)
5. Open **Monitor** to view logs

---

## 📡 API & MQTT

### MQTT Topics

* `elevators/{ID}/commands`

  ```json
  { "command": "UPDATE_PERMISSIONS" }
  ```

* `elevators/{ID}/status`

  ```json
  { "status": "INSPECTION_MODE" }
  ```

* `elevators/{ID}/access_event`

  ```json
  { "card": "12345", "access": "GRANTED" }
  ```

---

### Key API Endpoints

| Method | Endpoint        | Description                    |
| ------ | --------------- | ------------------------------ |
| POST   | `/users/login`  | Authenticate user              |
| GET    | `/elevators/my` | Buildings for logged‑in Syndic |
| POST   | `/permissions`  | Grant or revoke card access    |

---

## 🤝 Contribution

1. Fork the repository
2. Create your feature branch:

   ```bash
   git checkout -b feature/AmazingFeature
   ```
3. Commit your changes:

   ```bash
   git commit -m "Add AmazingFeature"
   ```
4. Push to the branch:

   ```bash
   git push origin feature/AmazingFeature
   ```
5. Open a Pull Request

---

## ❤️ Author

Built with passion by **Abdelmoughit mamdouh**

If you like this project, ⭐ star the repo and feel free to contribute!

