# Contributing to Smack Daddy Championships: Tech Titan Edition

Thank you for your interest in contributing to **Smack Daddy Championships: Tech Titan Edition**!

## Development Workflow

1. **Fork & Clone the Repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/smack-daddy-championships.git
   cd smack-daddy-championships
   npm install
   ```

2. **Run the Development Server**
   ```bash
   npm run dev
   ```

3. **Adding or Modifying Contenders (`src/data/fighters.ts`)**
   - Each contender profile defines `stats` (`power`, `chinDurability`, `precision`, `windUpSpeed`, `koResistance`), corporate colors (`primaryColor`, `secondaryColor`, `accentColor`), and A2A personality traits.
   - 3D arena environments for each contender are constructed in `ArenaSceneController.buildHQEnvironment()` inside `src/engine/ArenaScene3D.ts`.

4. **Verification Before Submitting a Pull Request**
   Ensure both TypeScript typechecking and the Vite production build pass with zero warnings:
   ```bash
   npm run lint
   npm run build
   ```
