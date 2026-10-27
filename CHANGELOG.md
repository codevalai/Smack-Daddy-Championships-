# Changelog

All notable changes to **Smack Daddy Championships: Tech Titan Edition** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-10-26

### Added
- **100% Volumetric 3D Contender Rigs (`Contender3DRig`)**:
  - Sculpted 3D craniums, cheekbones, brow ridges, 3D eyeballs with colored irises/pupils, 3D noses, 3D ears, and hinged 3D lower jaws with teeth and mouth interiors.
  - Contender-specific 3D hair locks/curls/crests, 3D beards/goatees, and detachable 3D eyeglasses that launch into world space with gravity and angular velocity on critical slaps ($\ge 130\text{ N}$).
  - Embossed 3D chest brand wordmark plates (`amazon`, `ORACLE`, `SPACEX`, `NVIDIA`, `OpenAI`, `Meta`, `CLAUDE`, `Google`, `Microsoft`, `WIN 95`) paired with 3D geometric company chest emblems.
  - Segmented 8-pouch tactical utility belts, deltoid pauldron ribs, forearm cuff rings, twin metallic shin-guard straps, and armored boot toe-caps matching the official championship poster.
- **Championship Stadium & Fluted Slap Barrel**:
  - Central fluted dark-metallic slap barrel with recessed magnesium chalk basin and talcum mound.
  - Dual illuminated Left & Right Contender Company Signage Trusses in the upper stadium rafters (`createCompanyStadiumSignage`).
  - Overhead 4-truss stadium lighting rig with 10 lamp housings and additive volumetric light cones.
- **Interactive 3D Camera Orbit & Cinema Mode**:
  - Pointer-drag 3D camera orbit directly on the WebGL viewport with smooth exponential damping return.
  - Collapsible Cinema / Zen Mode bottom dock toggle (`H` shortcut) and keyboard bindings (`Space`, `T`, `F`, `C`, `H`).
  - Full custom P1 (Left Corner) and P2 (Right Corner) matchup selection in `FighterCodexModal` and direct arena challenge across all 10 corporate HQ arenas in `PhysicsSpecModal`.
- **Engine Performance & SEO**:
  - Zero per-frame vector allocations in `ArenaScene3D.ts` render loop and `gl.fenceSync` (`afterDraw`) frame pacing for software and hardware WebGL environments.
  - Full `Schema.org` `VideoGame` JSON-LD structured data, OpenGraph, and Twitter social cards in `index.html`.

## [1.0.0] - 2026-10-25

### Added
- Initial release featuring 10 Tech Titan contenders, deterministic Power Slap physics engine (`slapPhysics.ts`), 4-tier Knockout & 10-Count Recovery system, 10-chapter Single-Player Story Mode, A2A Autonomous AI Mode, and procedural Web Audio API sound synthesis (`soundEffects.ts`).
