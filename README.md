# PERUSAT CREW: Operation El Niño

> **An Educational 2D Cooperative Web Game for the NASA Space Apps Challenge 2026**  
> **Challenge:** Space Mission Design Game  
> **Topic:** Flood Monitoring in Northern Peru via Earth Observation Satellite Operations  
> **Contract Version:** `schemaVersion: 3` · **Engine:** React 19 + Phaser 4 + TypeScript + Zustand 5 + Vite

[![Tests](https://img.shields.io/badge/Tests-17%20Passed-emerald.svg)](#testing-and-verification)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict%20v5.7-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-v6.4-cyan.svg)](https://vite.dev/)
[![License](https://img.shields.io/badge/License-MIT-lightgrey.svg)](LICENSE)

---

## 1. Overview and Educational Problem

During intense El Niño events, torrential rains across northern Peru (Piura and Chira river basins) cause severe river swellings, infrastructure disruptions, and agricultural flooding.

**PERUSAT CREW** puts students and space science enthusiasts in the shoes of two complementary aerospace operators working together to plan, acquire, downlink, and analyze critical satellite evidence:
- **Base CNOIS (`ground`):** National Satellite Imagery Operations Center (Earth ground station in Punta Hermosa, Lima).
- **PerúSAT-1 Console (`satellite`):** Virtual telemetry and payload control for Peru's high-resolution Earth observation satellite.

Rather than teaching orbital mechanics or power subsystems in isolation, the game turns space mission operations into an **interactive series of collaborative engineering trade-offs**.

> **Important Scientific & Ethical Disclaimer:**  
> This game is an educational simulator created for the NASA Space Apps Challenge. All telemetry values, battery capacities, and pass durations are calibrated for pedagogical gameplay. The game does not operate the physical PerúSAT-1 satellite nor does it issue live emergency alerts or evacuation notices to INDECI or COEN.

---

## 2. Gameplay Experience & Station Navigation

Inspired by top-down 2D navigation (similar to *Among Us*), players move inside a retro-futuristic pixel-art CNOIS control room using **WASD, Arrow keys, or point-and-click**.

### Four Dedicated Workstations
1. **Mission Planning & Target Selection (Base CNOIS - Left):**  
   Operators examine NASA GPM/IMERG multisatellite precipitation context (e.g. 42.5 mm/h in Piura) to justify prioritized targets (`rio-piura` or `rio-chira`).
2. **Optical Acquisition & Payload Bench (Center):**  
   Satellite operators select camera acquisition profiles, evaluating electrical power (EPS battery) and onboard storage before triggering the high-resolution optical sensor (NAOMI).
3. **Telemetry & Communication Terminal (Right):**  
   Satellite operators manage the downlink over a simulated X-band pass window of **80 seconds** at 4 Mb/s into the Punta Hermosa ground station.
4. **Analysis & Situation Reporting (Front):**  
   Ground analysts inspect the downloaded imagery, identify limitations (cloud obscuration or sensor artifacts), classify findings prudently, and submit the final emergency situation report.

### The Mission Guide Cat ("Gato Guía")
A contextual guide cat navigates the station alongside the crew, providing real-time instructions, alerting operators when weather clouds threaten optical capture, and explaining why an engineering decision succeeded or failed without obstructing player movement.

### Procedural Web Audio Engine
100% native Web Audio API sound synthesis with zero external dependencies:
- Ambient polyphonic cosmic synth pad.
- Footstep feedback when walking.
- Console interaction beeps.
- Mechanical camera shutter click on optical capture.
- Telemetry telemetry pulse tones during X-band transmission.
- Two-tone amber alerts upon cloud obstruction or resource depletion.
- Mute/unmute toggle and browser autoplay policy compliance.

---

## 3. Real Engineering Decisions with Observable Consequences

Every operational choice directly impacts finite physical resources:

| Subsystem Variable | Demo Baseline | Operational Rule & Consequence |
|---|:---:|---|
| **Energy (`energyWh`)** | `100 Wh` | Optical capture consumes `12 Wh`; X-band downlink consumes `4 Wh`. If battery drops below `12 Wh`, capture is rejected to protect satellite bus health. |
| **Storage (`storageMb`)** | `70 MB` free | Standard image consumes `14 MB`; Detailed image consumes `28 MB`; Compressed image consumes `9 MB`. Memory is freed upon confirmed Earth reception. |
| **Contact Window (`contactSeconds`)** | `80 seconds` | X-band downlink consumes `ceil((sizeMb * 8) / 4)` seconds at 4 Mb/s. A 28 MB detailed image takes 56 seconds, leaving insufficient time for a second transmission! |
| **Budget (`budgetCredits`)** | `100 credits` | High-resolution profiles cost 20 credits; standard profiles cost 10 credits. |
| **Image Quality (`quality`)** | `valid` / `cloudy` / `corrupt` | **Optical limitation:** Visible sensors cannot pierce dense clouds. In the event of cloud cover, the player must classify as `insufficient` evidence rather than falsely claiming flood certainty. |

---

## 4. Alignment with NASA Space Apps Judging Criteria

| Criterion | How PERUSAT CREW Demonstrates It | Evidence in Demo |
|---|---|---|
| **IMPACT** | Addresses real-world flooding in northern Peru (Piura/Chira) and teaches responsible risk communication without sensationalism. | Prudent situation report delivered to a simulated emergency operations center (COEN). |
| **CREATIVITY** | Asymmetric cooperation between Ground Base and Satellite; interactive 2D station exploration and contextual guide cat. | Two playable consoles with real-time synchronized mission snapshots. |
| **VALIDITY** | Explicit separation of NASA IMERG rainfall context, simulated PerúSAT-1 optical captures, and prominent "SIMULATED" watermarks. | Verifiable citation of NASA GPM/IMERG V07 data and optical sensor physics. |
| **RELEVANCE** | Models the complete NASA mission engineering lifecycle: Requirements → Planning → Capture → Downlink → Analysis → Debrief. | Full traversal of all six mission phases under `schemaVersion: 3`. |
| **PRESENTATION** | Responsive web interface, pixel-art retro aesthetics, procedural audio, 100% test coverage, and public static build. | Interactive demo accessible via URL with zero installation friction. |

---

## 5. Architecture & Tech Stack

```
PERUSAT CREW
├── src/contracts/     # Canonical types (schemaVersion: 3) & runtime validators
├── src/core/          # MissionGateway interface & confirmed event pipeline
├── src/store/         # Zustand 5 client state reflection (no optimistic drift)
├── src/game/          # 2D Station canvas, Peru maps, audio synthesizer, situation report
├── src/integration/   # React-Phaser event bridge & technical harnesses
├── src/devtools/      # Integration test harness, DevMissionGateway, fault injectors
└── public/assets/     # Optimized pixel art and asset attribution catalog
```

- **Contracts:** Schema Version 3 (`MissionSnapshot`, `MissionAction`, `Observation`, `MissionResources`).
- **Idempotency & Concurrency:** Every action carries a unique `actionId` to prevent double-spending of energy/memory, and `expectedRevision` for optimistic concurrency control.
- **Connection Separation:** The simulated physical satellite pass (`contactSeconds`) is strictly decoupled from web network connectivity (`ConnectionState`).

---

## 6. Getting Started

### Prerequisites
- **Node.js:** v20 LTS or v22 LTS
- **Package Manager:** `pnpm` (v10+ recommended) or `npm`

### Installation & Run
```bash
# Clone the repository
git clone https://github.com/your-org/perusat-crew.git
cd perusat-crew

# Install dependencies
corepack pnpm install

# Start local development server
corepack pnpm dev
```
Open your browser at `http://localhost:5173`.

### Entry Points Available
- **`http://localhost:5173/`** → Main 2D Station Game with Top Bar Switcher (Game, DevTools, Technical Harness).
- **`http://localhost:5173/devtools.html`** → Standalone Integration & Verification Workbench.
- **`http://localhost:5173/role01-demo.html`** → Two-operator guided walkthrough demo.

---

## 7. Testing and Verification

Run the automated Vitest test suite covering contract validation, idempotency, revision conflicts, and resource depletion invariants:

```bash
# Run all unit and integration tests
corepack pnpm test

# Build production bundle for static hosting (Vercel / Cloudflare Pages)
corepack pnpm build
```

---

## 8. Scientific Sources and References

- **S1 · Space Mission Design Game:** Official NASA Space Apps Challenge 2026.
- **S2 · NASA Design and Develop Science Missions:** Mission lifecycle segments and engineering trade-offs.
- **S3 · CNOIS / CONIDA:** National Satellite Operations Center of Peru and PerúSAT-1 technical overview.
- **S4 · NASA GPM / IMERG:** Global Precipitation Measurement Integrated Multi-satellitE Retrievals for GPM ([https://gpm.nasa.gov/data/imerg](https://gpm.nasa.gov/data/imerg)).
