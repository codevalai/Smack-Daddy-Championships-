# 🧠 Smack Daddy Championships — Engine Architecture & Technical Specification

This document details the internal architecture of the **Smack Daddy Championships: Tech Titan Edition** 3D engine, skeletal rigging, deterministic slap biomechanics, procedural sound synthesis, and glass-morph HUD.

---

## 1. 3D Fighter Skeletal Rig & UV-Mapped Geometry (`src/engine/ArenaScene3D.ts`)

### 1.1 Biped Skeletal Hierarchy
Each contender is constructed as a hierarchical Three.js skeletal tree (`FullBodyFighterRig`):
- `root` (`THREE.Group`)
  - `hipsPivot` (`THREE.Group`) — Controls center-of-mass crouch, weight transfer, and knockdown fall curves.
    - `leftHip` → `leftKnee` (with faceted dodecahedron knee pad & neon LED) → `leftBoot` (pivoting combat boot).
    - `rightHip` → `rightKnee` → `rightBoot` (rear foot pivots up to `30°–45°` outward during `WIND_UP_TORQUE`).
    - `spine1` → `spine2` → `chestGroup` — 3-segment articulated spine for compounding rotational torque.
      - **3D UV-Mapped Armored Torso**: Maps front-hemisphere vertices to `u ∈ [0.30, 0.68], v ∈ [0.36, 0.56]` of the contender's texture to project their authentic corporate chest armor (`SPACEX`, `NVIDIA`, `Meta`, `OpenAI`, `Claude`, `amazon`, `ORACLE`, `G`, `Microsoft`) onto curved 3D geometry.
      - `neckPivot` → `headGroup`:
        - **3D UV-Mapped Sculpted Head**: Maps front/temporal hemisphere vertices to `u ∈ [0.28, 0.70], v ∈ [0.57, 0.915]` so the contender's face, eyes, glasses, and hair wrap seamlessly onto a 3D cranium with 3D sculpted ears and a holographic `cheekTargetRing`.
      - `leftClavicle` / `rightClavicle` → `Shoulder` (with faceted pauldron & LED) → `Elbow` → `ArticulatedHandRig`.

### 1.2 High-Poly 5-Finger Articulated Combat Gauntlet (`ArticulatedHandRig`)
Each hand consists of:
- Heavy wrist bracer cuff + armored metacarpal palm block + chalk-coated inner slap pad + glowing dorsal LED strip.
- **4 Articulated Finger Chains** (`index`, `middle`, `ring`, `pinky`), each with independent `proximal`, `middle`, and `distal` phalange groups and knuckle guards.
- **2-Joint Articulated Thumb** locked for open-palm slap stability.
- Dynamic pose states:
  - `HOVER_MEASURE`: Open palm hovering 1–2 inches from the defender's cheekbone during `CHEEK_ALIGNMENT`.
  - `SLAP_READY`: Fingers splayed with flexor tendon micro-twitches during `FLINCH_BAIT` and `WIND_UP_TORQUE`.
  - `BRAWLER_GUARD`: Curled fist guard when bracing on defense.

---

## 2. Deterministic Slap Physics & Biomechanics (`src/engine/slapPhysics.ts`)

### 2.1 Force & Damage Equations
1. **ArmSpeed**:
   $$\text{ArmSpeed} = \left(\frac{\text{WindUpSpeed}}{85}\right) \times (0.88 + 0.24 \times \text{PrecisionMeter}) \times \text{FatigueFactor}$$
2. **Mass**:
   $$\text{Mass} = \left(\frac{\text{Power}}{85}\right) \times 4.4$$
3. **Rotational Torque**:
   Scaled by cadence call (`"On 1"` = `0.88×`, `"On 2"` = `1.05×`, `"On 3"` = `1.24×`):
   $$\text{Torque} = \left(\frac{\text{Power}}{82}\right) \times \text{WindUpScale} \times 4.85$$
4. **SlapForce**:
   $$\text{SlapForce} = \text{ArmSpeed} \times \text{Mass} \times \text{Torque} \times \text{PrecisionMultiplier} \times 3.85$$
5. **ChinWeakness & Brace Absorption**:
   $$\text{ChinWeakness} = \max\left(0.32,\; \left(1.38 - \frac{\text{ChinDurability}}{105}\right) \times (1 - \text{BraceAbsorption}) + \text{CumulativeHitWear}\right)$$
6. **Final Damage**:
   $$\text{Damage} = \text{SlapForce} \times \text{ChinWeakness} \times \text{AngleModifier}$$

---

## 3. Camera & Slow-Motion KO Replay System

- **`BROADCAST_WIDE` (Default)**: Pulled-back wide framing (`z = 4.95` desktop / `6.2` portrait mobile) so both full-body 3D fighters and the central metallic podium remain 100% visible.
- **`PRE_SLAP_PUSH`**: Subtle dolly push-in during `CHEEK_ALIGNMENT` and `WIND_UP_TORQUE`.
- **`IMPACT_MACRO`**: High-energy snap zoom on heavy non-KO impacts (`recoilIntensity > 0.82`).
- **`KO_REPLAY_ORBIT` (7-Step Knockout Replay Sequence)**:
  1. `0.22s` freeze frame at the exact moment of palm-to-cheek contact.
  2. `0.22×` super slow-motion time dilation.
  3. Close-up orbital camera sweep around the fighters (`radius = 2.2m → 3.3m`).
  4. Dual shockwave ring expansion + slow-mo chalk and sweat particle drift.
  5. Automatic Glass-Morph HUD dimming (`opacity: 45%`) for unobstructed cinematic viewing.
  6. Smooth transition back to `BROADCAST_WIDE` for the 10-Count Recovery Mini-Game.

---

## 4. Procedural Web Audio Synthesizer (`src/engine/soundEffects.ts`)

Zero external MP3/WAV files are required. All sound effects are synthesized in real time using the browser's native `AudioContext`:
- **Cadence Count Beep**: Pitch-stepped triangle oscillator (`280Hz → 550Hz`).
- **Wind-Up Whoosh**: Bandpass-filtered white noise sweep (`180Hz → 920Hz`) scaled by wind-up count.
- **Palm-to-Cheek Smack**: Layered high-frequency transient crack (`1350Hz–1850Hz` peaking filter) + sub-bass kinetic thud (`150Hz → 34Hz` sine drop).
- **Crowd Roar & Gasp**: Amplitude-modulated bandpass noise swell.
- **KO Bass Drop & Bell**: Sawtooth sub-bass sweep (`110Hz → 24Hz`) paired with an `880Hz` metallic championship bell.
