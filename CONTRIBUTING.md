# Contributing to @ispoofermotion/core

Thanks for taking the time to help with the project. Keep changes focused, explain anything that is not obvious, and avoid mixing unrelated cleanup into the same pull request.

## Setup

1. Fork or clone the repository.
2. Install dependencies with `bun install`.
3. Create a branch from `main`.
4. Make your changes.
5. Run the checks before opening a pull request.

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

Use `bun run dev` while working when you want the package to rebuild after source changes.

## Tests

Add or update tests when behavior changes. A bug fix should normally include a test that fails before the fix and passes after it.

Tests live in `src/__tests__` and run through Vitest.

```bash
bun run test
```

Use coverage when you are changing a larger part of the runtime.

```bash
bun run test:coverage
```

## Code style

Biome handles formatting and linting. Match the existing TypeScript style and keep comments focused on why something exists, not what the next line already says.

A commit hook runs Biome on staged source files. A push hook runs the full typecheck and test suite.

## Commit messages

Use a clear semantic prefix.

1. `feat:` for a new feature
2. `fix:` for a bug fix
3. `docs:` for documentation
4. `test:` for test changes
5. `chore:` for maintenance

Dependency updates use `chore(deps)`. Workflow updates use `chore(ci)`.

## Pull requests

Explain what changed, why it changed, and how you tested it. Mention any public API impact and link the related issue when one exists.

Keep generated files in sync when the source change affects them. Run `bun run build` for `dist` and `bun run docs` for the TypeDoc output.

## Respectful collaboration

Be direct without being rude. Review the code, not the person, and give enough context for someone else to understand your suggestion.
