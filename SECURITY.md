# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| 1.0.x   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability within **Smack Daddy Championships: Tech Titan Edition**, please report it responsibly by opening a private security advisory on GitHub or contacting the repository maintainer directly.

- **Zero Client-Side Secrets**: This application runs entirely in the browser using WebGL2 (`Three.js`) and the Web Audio API without requiring external API keys or credentials for core gameplay.
- **Dependency Audits**: Automated dependency checks are configured via GitHub Dependabot (`.github/dependabot.yml`).
