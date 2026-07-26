# Stability Guarantee

**@ispoofermotion/core** provides a strict API stability guarantee for all exported functions, classes, and types from version `1.0.0` onwards.

## Public API Stability

The public API is defined as any symbol exported from the main package entrypoint (`@ispoofermotion/core`).

We adhere to the following rules to ensure backward compatibility:

1. **Additive Changes Only:** New behavior will only be introduced additively. We may add new functions, new exported types, or new *optional* parameters to existing functions.
2. **Signature Preservation:** Existing function signatures and method signatures will **never** be changed in a breaking way in minor or patch releases.
3. **Behavioral Consistency:** The core behavior and side effects of existing functions will remain consistent. If a fundamental behavioral shift is required, it will be introduced as a new function or heavily communicated as a major version bump.

## Deprecation Policy

When an API is slated for removal or replacement:

- It will be marked with the `@deprecated` JSDoc tag.
- It will continue to function exactly as before for the duration of the current major version.
- It will only be removed in the next major version release.

## Internal APIs

Any functions, variables, or types that are not exported from the main entrypoint (or are marked explicitly with `@internal`) are **not** covered by this guarantee. They may change structure or be removed entirely at any time, even in patch releases. Please do not rely on internal APIs.
