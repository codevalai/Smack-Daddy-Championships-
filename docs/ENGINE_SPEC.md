# 🧠 Smack Daddy Championships — Engine Architecture & Technical Specification

This document details the internal architecture of the **Smack Daddy Championships: Tech Titan Edition** 3D WebGL2 engine, volumetric character rigging, deterministic slap biomechanics, procedural Web Audio synthesis, and broadcast esports HUD.

---

## 1. 100% Volumetric 3D Contender Rig (`src/engine/ArenaScene3D.ts`)

### 1.1 Hierarchical Skeletal Tree (`Contender3DRig`)
Every contender is constructed entirely from connected 3D geometry primitives (zero 2D planes or sideways sphere UV wraps):
- `root` (`THREE.Group`) — Positioned at `x = ±0.82m` facing the central slap barrel (`rotation.y = ±π/2`).
  - `pelvis` (`THREE.Group`) — Controls center-of-mass crouch, weight transfer, and knockdown fall curves.
    - **Segmented Tactical Utility Belt**: Cylindrical belt band surrounded by 8 radial metallic belt pouches (`BoxGeometry`) and an emissive championship buckle.
    - `leftHip` / `rightHip` → `Knee` (with ball joint, glowing knee pad, shin cylinder, and twin metallic shin straps) → `Boot` (with ankle joint sphere and armored toe-cap).
    - `torso` (`THREE.Group`) — Connected via a waist ball joint so spinal flexion never exposes a mesh gap.
      - `chestGroup`: V-tapered upper torso cylinder + sculpted left/right pectoral plates + tactical collar ring.
        - **3D Company Chest Emblem (`build3DCompanyChestEmblem`)**: Combines sculpted 3D company geometry (e.g., 4-pane 3D Windows tiles, 3D NVIDIA eye torus, 3D Amazon smile arch, 3D Oracle capsule ring, 3D SpaceX delta-X) with a high-anisotropy `SRGBColorSpace` embossed 3D wordmark plate (`amazon`, `ORACLE`, `SPACEX`, `NVIDIA`, `OpenAI`, `Meta`, `CLAUDE`, `Google`, `Microsoft`, `WIN 95`).
      - `neck` → `facial.headGroup` (`FacialFeaturesRig`):
        - Volumetric upper cranium, 3D cheekbones, 3D brow ridge, articulated 3D eyebrows, 3D eyeballs with irises and pupils, 3D nose bridge/tip, and 3D outer ears.
        - `jawGroup`: Hinged 3D lower jaw block, chiseled chin capsule, interior mouth cavity, teeth strip, and contender-specific 3D beard/goatee meshes.
        - `glassesMesh`: Detachable 3D eyeglasses (`BoxGeometry` rims, tinted lenses, nose bridge, and temple arms) that detach into world space with ballistic velocity and angular spin on critical slaps ($\ge 130\text{ N}$).
      - `leftShoulder` / `rightShoulder` (with connected deltoid sphere & glowing pauldron rib) → `Elbow` (with forearm cuff ring) → `ArticulatedHandRig`.

### 1.2 Articulated 5-Finger Slap Gauntlet (`ArticulatedHandRig`)
Each hand includes:
- Connected wrist ball socket, armored gauntlet cuff, broad metacarpal palm block, fingerless dorsal backplate, and knuckle spheres.
- **Magnesium Chalked Inner Palm Pad**: Emits white talcum dust particles on wind-up and cheek impact.
- **4 Articulated 3-Segment Finger Chains** (`proximal`, `middle`, `distal`) + **2-Segment Thumb** for realistic open-palm slap extension.

---

## 2. Stadium Arena, Fluted Barrel & Zero-GC Render Loop

### 2.1 Central Fluted Slap Barrel & Magnesium Chalk Basin
- Constructed from a dark-titanium fluted cylinder (`CylinderGeometry`), top/bottom beveled rings, a shock-absorbing top rim torus, and a recessed **magnesium chalk basin** containing a white talcum mound.
- Illuminated by an overhead 4-truss stadium lighting rig with 10 high-intensity floodlight housings and additive-blended volumetric light cones.

### 2.2 Dual Contender Company Signage Trusses
- `setArenaEnvironment(rightProfile, leftProfile)` dynamically builds two illuminated stadium signage trusses in the upper rafters behind the Left Corner (`x = -3.8m`) and Right Corner (`x = +3.8m`) contenders, displaying each contender's company brand in glowing typography.

### 2.3 Zero-Allocation Render Loop & Frame Pacing
- Module-scoped scratch vectors (`_dummyVecA`, `_dummyVecB`, `_dummyPos`, `_dummyQuat`, `_dummyScale`, `_dummyMatrix`, `_upAxis`, `_flashOffset`) eliminate `new THREE.Vector3()` garbage-collection pauses during `animate()`.
- `scheduleNextFrame()` uses `gl.fenceSync` (`afterDraw`) when running on software WebGL renderers (such as SwiftShader/headless environments) and native `requestAnimationFrame` on hardware GPUs.

---

## 3. Deterministic Slap Physics & Biomechanics (`src/engine/slapPhysics.ts`)

1. **ArmSpeed**:
   $$\text{ArmSpeed} = \left(\frac{\text{WindUpSpeed}}{85}\right) \times (0.88 + 0.24 \times \text{EffectiveMeter}) \times \text{FatiguePenalty}$$
2. **Mass**:
   $$\text{Mass} = \left(\frac{\text{Power}}{85}\right) \times 4.4$$
3. **Rotational Torque**:
   Scaled by cadence call (`"On 1"` = `0.88×`, `"On 2"` = `1.05×`, `"On 3"` = `1.24×`):
   $$\text{Torque} = \left(\frac{\text{Power}}{82}\right) \times \text{WindUpTorqueScale} \times 4.85$$
4. **SlapForce**:
   $$\text{SlapForce} = (\text{ArmSpeed} \times \text{Mass} \times \text{Torque}) \times \text{PrecisionMultiplier} \times 3.85$$
5. **ChinWeakness & Brace Absorption**:
   $$\text{ChinWeakness} = \max\left(0.42,\; \left(\frac{100}{\max(45, \text{ChinDurability})}\right) \times \text{CumulativeWear} \times (1 - \min(0.65, \text{BraceEfficiency}))\right)$$
6. **Final Damage**:
   $$\text{Damage} = \text{SlapForce} \times (\text{ChinWeakness} \times \text{AngleModifier}) \times 0.74$$

---

## 4. Procedural Web Audio & Speech Synthesis (`src/engine/soundEffects.ts`)

- **Sonic Boom Slap Crack**: High-passed white noise transient burst (`1300Hz–1900Hz`) + peaking filter (`1600Hz–2400Hz`) + kinetic sub-bass thud (`120Hz → 32Hz`) + metallic sawtooth shockwave tail on critical strikes ($>150\text{ N}$).
- **Magnesium Chalk Puff & Flinch Gasp**: Bandpass-filtered noise envelopes synced to `CHALK_PREP` and `FAKEOUT` animations.
- **Crowd Roar & Championship Horn Triad**: Amplitude-modulated stadium roar paired with an A-major triad horn chord and double boxing bell ding on knockouts.
- **CEO Trash-Talk Speech Synthesis**: Native `window.speechSynthesis` vocalizes contender-specific pre-slap taunts, fakeout jeers, and knockout victory lines.
