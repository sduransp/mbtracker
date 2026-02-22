# Contributing to MBTracker

Thanks for your interest! This is a small, focused project intended for local use. Contributions that keep it simple, robust, and well-documented are welcome.

## Principles
- Keep the scope tight: local tracking of cash flows and P&L.
- Prefer clarity over complexity.
- Avoid frameworks unless they add clear value.

## How to Contribute
1. Fork the repo.
2. Create a feature branch.
3. Run the app locally and add tests or examples if applicable.
4. Submit a PR with:
   - A concise description
   - Screenshots/gifs for UI changes
   - Notes on any migration or data impact

## Coding Guidelines
- Node 18+, ES modules not required; current code uses CommonJS.
- Use 2 spaces, LF line endings (see .editorconfig).
- Keep API responses small and predictable.

## Commit Style
- Use clear, imperative messages: "Add summary endpoint", "Fix house update validation".
- Group related changes into single commits.

## Security & Privacy
- The app is local-only by default; do not add external telemetry.
- If adding remote features, gate them behind config and document risks.
