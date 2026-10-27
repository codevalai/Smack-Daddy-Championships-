# 🧠 Smack Daddy Championships: Pixel Edition — Engine Architecture & Technical Specification

This document details the internal architecture of the **Smack Daddy Championships: Pixel Edition** 60 FPS 2D 16-Bit Pixel-Art HTML5 Canvas engine, coordinate-addressed character sprite matrix (`drawFighter`), deterministic slap biomechanics, procedural Web Audio synthesis, and autonomous Agent-to-Agent (`A2A Auto`) simulation loop.

---

## 1. Coordinate-Based 16-Bit Sprite Matrix Architecture (`src/engine/ArenaScene3D.ts`)

### 1.1 `drawFighter(ctx, characterId, state, x, y, facingRight)`
Every contender is rendered procedurally in 2D Canvas space using a coordinate-addressed pixel-block matrix (`P = 2` virtual canvas pixels per texel) with zero external image dependencies:
- **Sub-Block 1 — Planted Stance & Boots**: Wide athletic stance, knee highlights, accented combat boots, and a golden championship utility belt.
- **Sub-Block 2 — Back Guard Arm**: Reaches forward to grip the central dark-iron slap podium rim.
- **Sub-Block 3 — Corporate Attire & Micro-Pixel Chest Logos**:
  - **Jeff Bezos (`bezos`)**: Deep blue Amazon polo (`#1E3A8A`) with button placket and yellow smile-arrow curve (`#FACC15` / `#FF9900`) across the chest.
  - **Larry Ellison (`ellison`)**: Red Oracle executive racing jacket (`#DC2626`) with white shoulder stripes (`#F8FAFC`) and micro-pixel chest badge.
  - **Mark Zuckerberg (`zuckerberg`)**: Dark grey Meta tee (`#334155`) with cyan infinity-loop pixel icon (`#38BDF8`).
  - **Elon Musk (`musk`)**: Futuristic black collar-up jacket (`#0F172A`) with cyan rocket-streak diagonal chest trim.
  - **Jensen Huang (`huang`)**: Pitch-black biker leather jacket (`#0A0A0A`) with silver zipper pixel lines (`#CBD5E1`), notched collar flaps, and neon-green CUDA accent (`#76B900`).
  - **Sam Altman (`altman`)**: Minimalist gray zip-up tech hoodie (`#64748B`) with drawstring pixels and violet OpenAI badge (`#A855F7`).
  - **Satya Nadella (`nadella`)**: Sharp navy-blue enterprise blazer (`#1E3A8A`) over light shirt collar with 4-color Windows pixel square.
  - **Tim Cook (`cook`)**: Dark titanium-blue polo (`#1E293B`) with silver Apple chest emblem (`#E2E8F0`).
  - **Sundar Pichai (`pichai`)**: Smart-casual executive layer with 4-color Google pixel stripe (`#EA4335`, `#FBBC05`, `#34A853`, `#4285F4`).
  - **Dario Amodei (`amodei`)**: Structured charcoal researcher vest (`#292524`) over a dark collar shirt (`#0C0A09`) with amber Anthropic spark badge (`#D97706`).
- **Sub-Block 4 — Cranium, Hair & Dynamic Facial Expressions (`IDLE`, `WIND_UP`, `STRIKE`, `HIT_RECOIL`)**:
  - **Idle Breathing**: Shifts torso and shoulders vertically by `1px` every 30 frames (`Math.floor(frameCount / 30) % 2`).
  - **Wind-Up Compression**: Cocks the striking arm back `5px` and compresses the body vertically (`scaleY = 0.94`).
  - **Impact Flash & Recoil**: Flashes the struck fighter pure white for `2` frames, renders reddened/bruised cheek pixels (`#EF4444`) and flying sweat droplets (`#38BDF8`), and triggers yellow/orange starburst hit-sparks on the central podium.

---

## 2. Deterministic Slap Physics & Biomechanics (`src/engine/slapPhysics.ts`)

1. **ArmSpeed**:
   $$\text{ArmSpeed} = \left(\frac{\text{WindUpSpeed}}{85}\right) \times (0.88 + 0.24 \times \text{EffectiveMeter}) \times \text{FatiguePenalty}$$
2. **Mass**:
   $$\text{Mass} = \left(\frac{\text{Power}}{85}\right) \times 4.4$$
3. **Rotational Torque**:
   $$\text{Torque} = \left(\frac{\text{Power}}{82}\right) \times \text{WindUpTorqueScale} \times 4.85$$
4. **SlapForce**:
   $$\text{SlapForce} = (\text{ArmSpeed} \times \text{Mass} \times \text{Torque}) \times \text{PrecisionMultiplier} \times 3.85$$
5. **Final Damage**:
   $$\text{Damage} = \text{SlapForce} \times (\text{ChinWeakness} \times \text{AngleModifier}) \times 0.74$$

---

## 3. Procedural Web Audio API Synthesizer (`src/engine/soundEffects.ts`)

- **Slap Impact**: Bandpass-filtered white-noise transient burst (`1200Hz–1650Hz`) + low-frequency sine sub-bass punch (`150Hz → 28Hz`).
- **Critical Hit Chime**: 4-note square-wave retro arcade arpeggio (`523.25Hz → 1046.5Hz`).
- **Round Bell**: Multi-partial harmonic bell synthesis at round start and KO resolution.
- **Crowd Roar**: Bandpass-modulated stadium noise envelope scaled by slap force and knockout state.
