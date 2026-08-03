# API stability

The public API of `@ispoofermotion/core` is covered by this policy starting with version `3.2.0`.

## What counts as public

A function, class, constant, or type is public when it is exported from the main package entry point.

Files inside `src`, internal runtime methods, and symbols marked with `@internal` are not public API.

## Patch releases

Patch releases keep existing public runtime behavior and compatible function signatures. They may include bug fixes, documentation updates, performance work, and internal refactors.

## Minor releases

Minor releases may add exports, optional configuration, and other backward compatible behavior.

A minor release may also correct a public TypeScript type when runtime behavior does not change and the old type allowed invalid usage. Any correction like this must be explained in the changelog.

## Major releases

A change that intentionally breaks supported public usage requires a new major version.

## Deprecations

An API planned for removal will be marked with `@deprecated` and will keep working for the rest of the current major version. Removal happens in a later major version.

## Internal code

Internal code can change in any release. Do not import files from `src` or depend on undocumented runtime details.

## Release notes

The changelog records public changes and any compatibility details that need more explanation.
