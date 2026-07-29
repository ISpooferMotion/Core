# Contributing to ispoofermotion/core

Thank you for investing your time in contributing to our project!

## Code of Conduct

By participating in this project, you agree to maintain a respectful and professional environment.

## Development Workflow

1. Branch off `main` for your feature (`feature/your-feature`) or bugfix (`fix/your-fix`).
2. Run `bun install` to ensure all dependencies are resolved.
3. Use `bun run dev` to watch your changes locally.
4. Ensure all code passes `bun run typecheck` and `bun run lint`.
5. Run the test suite with `bun run test`, and `bun run build` to confirm the package still builds -- CI will run both, but catching a build break locally saves a round trip.

A `pre-commit` hook runs `lint-staged` (fast, staged-files-only formatting/linting) on every commit. A separate `pre-push` hook runs the full typecheck + test suite before code leaves your machine, so commits stay quick while pushes still get a full check.

## Commit Guidelines

We use Semantic Commit Messages.

- `feat:` for new features
- `fix:` for bug fixes
- `chore:` for maintenance (Dependabot uses `chore(deps)` for dependency bumps and `chore(ci)` for GitHub Actions bumps)
- `docs:` for documentation updates
- `test:` for test-only changes
