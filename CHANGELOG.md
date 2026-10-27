# Changelog

All notable changes to **Smack Daddy Championships: Pixel Edition** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-10-26

### Added
- **16-Bit Pixel-Art Coordinate Matrix Engine (`drawFighter`)**:
  - Replaced generic blocky shapes with coordinate-addressed 16-bit pixel-art character sprites (`drawFighter(ctx, characterId, state, x, y, facingRight)`) for all 10 Tech Titans (Jeff Bezos, Larry Ellison, Mark Zuckerberg, Elon Musk, Jensen Huang, Sam Altman, Satya Nadella, Tim Cook, Sundar Pichai, and Dario Amodei).
  - Implemented 1-pixel vertical idle breathing every 30 frames, 5-pixel wind-up arm cock-back with vertical squash-and-stretch, 2-frame pure white impact flash, bruised cheek pixels, flying sweat droplets, and corporate micro-pixel chest logos.
- **Self-Contained Single-File HTML5 Build (`public/smack-daddy-pixel-edition.html`)**:
  - Added a 100% self-contained single-file HTML5 build with zero external dependencies, downloadable directly from the `[DOWNLOAD 1-FILE HTML]` button in the top navigation bar for Capacitor / Android / Amazon Appstore packaging.
- **Official 16-Bit Pixel Edition Poster Integration**:
  - Updated `README.md`, `index.html` OpenGraph, Twitter Card, and Schema.org structured metadata to use `/assets/aistudio/image_1793066750455_5bb547f5.jpeg`.

## [2.0.0] - 2026-10-26

### Added
- 10-Contender Roster with unique signature abilities, Best-of-3 championship rounds, and autonomous Agent-to-Agent (`A2A Auto`) simulation loop.

## [1.0.0] - 2026-10-25

### Added
- Initial release featuring deterministic Power Slap physics engine (`slapPhysics.ts`), 4-tier Knockout & 10-Count Recovery system, and procedural Web Audio API sound synthesis (`soundEffects.ts`).
