# Contributing to Smack Daddy Championships: Pixel Edition

Thank you for your interest in contributing to **Smack Daddy Championships: Pixel Edition**!

## Development Workflow

1. **Fork & Clone the Repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/smack-daddy-championships.git
   cd smack-daddy-championships
   npm install --no-audit --no-fund --legacy-peer-deps
   ```

2. **Run the Development Server**
   ```bash
   npm run dev
   ```

3. **Adding or Modifying Contenders (`src/data/fighters.ts` & `src/engine/ArenaScene3D.ts`)**
   - Each contender profile defines `stats` (`power`, `chinDurability`, `precision`, `windUpSpeed`, `koResistance`), corporate colors (`primaryColor`, `secondaryColor`, `accentColor`), and A2A personality traits.
   - 16-bit coordinate-based pixel sprites and corporate chest logos for each contender are rendered in `drawFighter(ctx, characterId, state, x, y, facingRight)` inside `src/engine/ArenaScene3D.ts` and mirrored in the standalone APK-ready build at `public/smack-daddy-pixel-edition.html`.

4. **Verification Before Submitting a Pull Request**
   Ensure both TypeScript typechecking and the Vite production build pass with zero warnings:
   ```bash
   npm run lint
   npm run build
   ```
