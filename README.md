# 🏆 Smack Daddy Championships: Tech Titan Edition

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-r186_WebGL2-000000?logo=threedotjs&logoColor=white)](https://threejs.org/)
[![React 19](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-Apache_2.0-D4AF37.svg)](./LICENSE)

> **"Battle of the Titans — Tech Giants Collide."**  
> A 3D cinematic slap-fighting game where ten global tech leaders step up to a central metallic podium inside their corporate HQ arenas. Built with custom Three.js skeletal fighter rigs, articulated 5-finger combat gauntlets, deterministic Power Slap biomechanics, a 4-tier Knockout & 10-Count Recovery system, a 10-chapter Single-Player Story Mode, and an autonomous Agent-to-Agent (A2A) Behavior Tree simulation mode.

---

## ✨ Key Features

### 🥊 1. Authentic 5-Phase Power Slap Choreography
Every strike follows real-world slap-fighting podium rules and biomechanics:
1. **Cheek Alignment Phase (`CHEEK_ALIGNMENT`)**: The striker steps up to the podium, tilts their head to lock eyes, and hovers their open 5-finger palm 1–2 inches from the defender's cheekbone (`Mid Cheek`, `Jawline Lever`, or `High Temple`) to measure distance.
2. **Flinch-Bait Phase (`FLINCH_BAIT`)**: Psychological warfare — fake wrist flicks, shoulder pops, and practice measurement swings that puff magnesium chalk dust and charge rotational torque.
3. **Wind-Up Phase (`WIND_UP_TORQUE`)**: Full 3-bone spine twist, hip rotation, outward rear-foot pivot, and shoulder torque load synced to the official `"On 1"`, `"On 2"`, or `"On 3"` cadence call.
4. **Pre-Impact Freeze Frame (`PRE_IMPACT_FREEZE`)**: Dramatic 0.25s tension hold with camera push-in right before release.
5. **Slap Execution & 7 Hit Reaction Variants (`SLAP_EXECUTION`)**: High-velocity palm-to-cheek contact with a glowing 3D slap-trail arc, cheekbone compression, and 7 distinct hit reactions (`HIT_LIGHT_CHEEK`, `HIT_CHEEK_WHIP`, `HIT_JAW_SNAP`, `HIT_STAGGER_STEP`, `HIT_STUMBLE_BACK`, `KNOCKDOWN`, and `DELAYED_KO` neural freeze).

---

### 🧮 2. Deterministic Slap Physics Engine (`src/engine/slapPhysics.ts`)
No random coin-flip combat — every slap is governed by physical simulation:

$$\text{SlapForce} = (\text{ArmSpeed} \times \text{Mass} \times \text{Torque}) \times \text{PrecisionMultiplier}$$

$$\text{Damage} = \text{SlapForce} \times (\text{ChinWeakness} \times \text{AngleModifier})$$

$$\text{Knockout Condition: } \text{Damage} \ge \text{Effective KOResistance}$$

- **Strike Vector Modifiers**:
  - `MID_CHEEK`: Balanced palm contact (`1.00×` AngleModifier, highest sweet-spot consistency).
  - `JAWLINE_LEVER`: Maximum rotational torque on the mandible (`1.22×` AngleModifier, high Clean/Critical KO probability).
  - `HIGH_TEMPLE`: Vestibular disruption vector (`1.14×` AngleModifier, triggers multi-axis `STAGGER_KO`).
- **Cumulative Wear & Fatigue**: Stamina expenditure reduces `ArmSpeed` and `Torque` across rounds, while repeated impacts degrade `Effective KOResistance` and armor integrity.

---

### 💥 3. Comprehensive 4-Tier Knockout (KO) & 10-Count Recovery System
When `Damage ≥ Effective KOResistance`, the engine evaluates overkill ratio, strike vector, and defender fatigue to trigger one of four distinct KO classifications:

| KO Classification | Trigger Threshold | Visual & Camera Impact | 10-Count Recovery Mini-Game |
| :--- | :--- | :--- | :--- |
| **Clean KO** (`CLEAN_KO`) | `Damage ≥ 1.15 × KOResistance` on direct strike | Instant 90° rigid-body collapse, spotlight flash, dense chalk cloud | `16%` recovery window (`4.4 rad/s` needle). Restores `38% HP` + **Isometric Reboot** (`+15%` Chin Brace) |
| **Staggered KO** (`STAGGER_KO`) | `Damage ≥ KOResistance` via High Temple or Fatigue ≥ 35% | Vestibular wobble across podium, lateral knee buckle, camera roll oscillation | `22%` recovery window (`4.9 rad/s` needle). Restores `44% HP` + **Gyro Stabilizer** |
| **Delayed KO** (`DELAYED_KO`) | `Damage ∈ [1.00×, 1.15×) KOResistance` after partial brace | Defender freezes gripping podium bar for `0.65s`, then crumples forward | `28%` recovery window (`3.5 rad/s` needle). Restores `50% HP` + **Second-Wind Surge** (Special recharge) |
| **Critical KO** (`CRITICAL_KO`) | `Damage ≥ 1.28 × KOResistance` or `≥90%` Sweet-Spot Jawline Lever | `0.22×` super slow-motion freeze frame, macro palm-to-cheek zoom, 360° orbit replay, dual shockwave rings | Extreme `12%` window (`5.5 rad/s` needle). Restores `35% HP` + **Titan Overclock** (`+30%` SlapForce) |

---

### 🏛️ 4. The 10 Tech Titan Contenders & 3D Corporate HQ Arenas (`src/data/fighters.ts`)

| Ch. | Contender | Company | 3D Corporate HQ Arena | Signature Armor & Special Ability |
| :-: | :--- | :--- | :--- | :--- |
| **1** | **Mark Zuckerberg** | Meta | Menlo Park Metaverse Chamber (Portal Arches & Spatial Mesh) | Meta Haptic Mesh Suit • *Kinematic Frame Lock* |
| **2** | **Sam Altman** | OpenAI | San Francisco AI Lab (Rotating Violet Alignment Core) | AGI Obsidian Exo-Plate • *Q-Star Trajectory Lock* |
| **3** | **Elon Musk** | SpaceX | Hawthorne Rocket Hangar (Falcon 9 Booster & Plasma Gantries) | Starship Raptor Exosuit • *Raptor Stage-Zero Torque* |
| **4** | **Jensen Huang** | NVIDIA | Santa Clara GPU Cathedral (Neon-Green Tensor Blade Spires) | RTX Titanium Leather Armor • *DLSS Frame-Gen Overclock* |
| **5** | **Jeff Bezos** | Amazon | Seattle Geodesic Spheres (Biodome Arches & Prime Rings) | Prime Blue-Orange Heavy Rig • *Same-Day Kinetic Delivery* |
| **6** | **Larry Ellison** | Oracle | Austin Red-White Data Tower Arena | Autonomous Crimson Plate • *Exadata Lockout Brace* |
| **7** | **Dario Amodei** | Anthropic | SF Constitutional Safety Lab (Gold-White Harmonic Swirl Core) | Constitutional White-Gold Rig • *Harmonic Damping Shield* |
| **8** | **Sundar Pichai** | Google | Mountain View Quantum Campus (4-Color Prism Arches) | Quantum Blue-White Suit • *DeepMind AlphaSlap Vector* |
| **9** | **Satya Nadella** | Microsoft | Redmond Azure Cloud Arena (Crystalline Server Monoliths) | Azure Titanium Lattice • *Hyperscale Cloud Surge* |
| **10** | **Bill Gates** | Classic MS | Retro Windows Grid Chamber (Glowing 4-Pane Monolith) | Executive Light-Grid Armor • *Blue Screen Interrupt (0x21)* |

---

## 🗂️ Repository Architecture

```text
smack-daddy-championships-tech-titan-edition/
├── .github/workflows/
│   └── ci.yml                       # GitHub Actions CI (Typecheck & Production Build)
├── docs/
│   └── ENGINE_SPEC.md               # Deep-dive 3D Rig, Physics, Camera & HUD Specification
├── public/
│   └── assets/aistudio/             # 10 Custom Contender Textures (UV-mapped onto 3D Head/Torso)
├── src/
│   ├── components/
│   │   ├── FighterCodexModal.tsx    # Interactive 10-Contender Roster, Stats & Upgrade Progression
│   │   └── PhysicsSpecModal.tsx     # KO System Rules, Physics Formulas & Live KO Simulator
│   ├── data/
│   │   └── fighters.ts              # 10 Contender Profiles, KO Definitions & Story Armor Upgrades
│   ├── engine/
│   │   ├── ArenaScene3D.ts          # Three.js WebGL2 Engine: 3D Fighter Rigs, 5-Finger Hands, Arenas, Camera & FX
│   │   ├── slapPhysics.ts           # Deterministic Slap Physics & A2A Behavior Tree Engine
│   │   └── soundEffects.ts          # Procedural Web Audio API Sound Synthesizer (Zero external audio dependencies)
│   ├── App.tsx                      # Glass-Morph Championship HUD, 1P Tap Controls & Match State Machine
│   ├── index.css                    # Tailwind CSS v4 & Custom Championship Typography
│   └── main.tsx                     # React 19 Application Entry Point
├── index.html                       # SEO & OpenGraph Configured Entry HTML
├── metadata.json                    # Application Metadata
├── package.json                     # Dependencies & Build Scripts
├── tsconfig.json                    # Strict TypeScript Configuration
└── vite.config.ts                   # Vite 8 Bundler Configuration
```

---

## 🚀 Quick Start & Local Development

### Prerequisites
- **Node.js** `>= 20.0.0` (Node `22+` recommended)
- **npm** or **bun**

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/YOUR_USERNAME/smack-daddy-championships.git
cd smack-daddy-championships
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

### 3. Typecheck & Build for Production
```bash
npm run lint
npm run build
npm run preview
```

---

## 🌐 Pushing to Your New GitHub Repository

Run the following commands from the project root after creating an empty repository on GitHub:

```bash
git init
git add .
git commit -m "feat: initial release of Smack Daddy Championships: Tech Titan Edition"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

---

## 📄 License

Distributed under the **Apache License 2.0**. See [`LICENSE`](./LICENSE) for full details.
