import { describe, expect, it } from "vitest";
import {
	assertStructuredState,
	cloneStructuredState,
	structuredStateEqual,
} from "../stateValue";

describe("structured state values", () => {
	it("clones supported cyclic state without losing RegExp lastIndex", () => {
		const pattern = /hello/gi;
		pattern.lastIndex = 4;
		const source: {
			pattern: RegExp;
			map: Map<string, unknown>;
			set: Set<unknown>;
			self?: unknown;
		} = {
			pattern,
			map: new Map(),
			set: new Set(),
		};
		source.self = source;
		source.map.set("self", source);
		source.set.add(source);

		const clone = cloneStructuredState(source);

		expect(clone).not.toBe(source);
		expect(clone.self).toBe(clone);
		expect(clone.map.get("self")).toBe(clone);
		expect([...clone.set]).toEqual([clone]);
		expect(clone.pattern).not.toBe(pattern);
		expect(clone.pattern.source).toBe(pattern.source);
		expect(clone.pattern.flags).toBe(pattern.flags);
		expect(clone.pattern.lastIndex).toBe(4);
	});

	it("rejects state properties that structuredClone would silently discard", () => {
		const hidden = {};
		Object.defineProperty(hidden, "secret", {
			value: 1,
			enumerable: false,
		});
		expect(() => assertStructuredState(hidden)).toThrow(/non-enumerable/);

		const accessor = {
			get value() {
				return 1;
			},
		};
		expect(() => assertStructuredState(accessor)).toThrow(/accessor/);

		const symbolKey = Symbol("state");
		expect(() => assertStructuredState({ [symbolKey]: 1 })).toThrow(
			/symbol-keyed/,
		);

		const map = new Map<string, number>();
		Object.assign(map, { extra: true });
		expect(() => assertStructuredState(map)).toThrow(/unsupported property/);

		const nullPrototype = Object.create(null) as Record<string, unknown>;
		nullPrototype.value = 1;
		expect(() => assertStructuredState(nullPrototype)).toThrow(
			/unsupported custom prototype/,
		);
	});

	it("compares cyclic state structurally while preserving reference topology", () => {
		const sharedLeft = { value: 1 };
		const left = { first: sharedLeft, second: sharedLeft };
		const sharedRight = { value: 1 };
		const right = { first: sharedRight, second: sharedRight };
		expect(structuredStateEqual(left, right)).toBe(true);

		const splitRight = { first: { value: 1 }, second: { value: 1 } };
		expect(structuredStateEqual(left, splitRight)).toBe(false);

		const cycleLeft: { self?: unknown } = {};
		cycleLeft.self = cycleLeft;
		const cycleRight: { self?: unknown } = {};
		cycleRight.self = cycleRight;
		expect(structuredStateEqual(cycleLeft, cycleRight)).toBe(true);
	});

	it("compares built-in structured state types by their meaningful values", () => {
		const leftPattern = /x/gi;
		const rightPattern = /x/gi;
		leftPattern.lastIndex = 2;
		rightPattern.lastIndex = 2;

		expect(structuredStateEqual(new Date(42), new Date(42))).toBe(true);
		expect(structuredStateEqual(new Date(42), new Date(43))).toBe(false);
		expect(structuredStateEqual(leftPattern, rightPattern)).toBe(true);
		rightPattern.lastIndex = 3;
		expect(structuredStateEqual(leftPattern, rightPattern)).toBe(false);
		expect(
			structuredStateEqual(
				new Map([["value", { nested: 1 }]]),
				new Map([["value", { nested: 1 }]]),
			),
		).toBe(true);
		expect(structuredStateEqual(new Set([1, 2]), new Set([1, 2]))).toBe(true);
		expect(structuredStateEqual(new Set([1, 2]), new Set([2, 1]))).toBe(false);
	});
});
