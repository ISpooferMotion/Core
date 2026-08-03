import "vitest";

declare module "vitest" {
	interface Assertion<T> {
		readonly not: Assertion<T>;
	}
}
