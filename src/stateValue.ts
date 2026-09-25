function isAllowedObjectPrototype(proto: unknown): boolean {
	if (!proto || typeof proto !== "object") return false;
	return (
		proto === Object.prototype ||
		proto === Array.prototype ||
		proto === Date.prototype ||
		proto === Map.prototype ||
		proto === Set.prototype ||
		proto === RegExp.prototype ||
		(typeof globalThis !== "undefined" &&
			(proto === globalThis.Object?.prototype ||
				proto === globalThis.Array?.prototype ||
				proto === globalThis.Date?.prototype ||
				proto === globalThis.Map?.prototype ||
				proto === globalThis.Set?.prototype ||
				proto === globalThis.RegExp?.prototype))
	);
}

const isDate = (val: unknown): val is Date =>
	val instanceof Date ||
	Object.prototype.toString.call(val) === "[object Date]";
const isMap = (val: unknown): val is Map<unknown, unknown> =>
	val instanceof Map || Object.prototype.toString.call(val) === "[object Map]";
const isSet = (val: unknown): val is Set<unknown> =>
	val instanceof Set || Object.prototype.toString.call(val) === "[object Set]";
const isRegExp = (val: unknown): val is RegExp =>
	val instanceof RegExp ||
	Object.prototype.toString.call(val) === "[object RegExp]";

function assertNoCustomOwnProperties(
	value: object,
	path: string,
	allowedKeys: ReadonlySet<PropertyKey> = new Set(),
): void {
	for (const key of Reflect.ownKeys(value)) {
		if (allowedKeys.has(key)) continue;
		if (key === "constructor") continue;
		throw new Error(`${path} contains unsupported property ${String(key)}.`);
	}
}

export function assertStructuredState(
	value: unknown,
	path = "state",
	seen = new WeakSet<object>(),
): void {
	if (typeof value === "function") {
		throw new Error(`${path} contains a function.`);
	}
	if (typeof value === "symbol") {
		throw new Error(`${path} contains a Symbol.`);
	}
	if (value === null || typeof value !== "object") return;
	if (seen.has(value)) return;
	seen.add(value);

	const proto = Object.getPrototypeOf(value);
	if (!isAllowedObjectPrototype(proto)) {
		throw new Error(`${path} uses an unsupported custom prototype.`);
	}

	if (isMap(value)) {
		assertNoCustomOwnProperties(value, path);
		let index = 0;
		for (const [key, entry] of value) {
			assertStructuredState(key, `${path}.<map-key:${index}>`, seen);
			assertStructuredState(entry, `${path}.<map-value:${index}>`, seen);
			index++;
		}
		return;
	}

	if (isSet(value)) {
		assertNoCustomOwnProperties(value, path);
		let index = 0;
		for (const entry of value) {
			assertStructuredState(entry, `${path}.<set-value:${index}>`, seen);
			index++;
		}
		return;
	}

	if (isDate(value)) {
		assertNoCustomOwnProperties(value, path);
		return;
	}

	if (isRegExp(value)) {
		assertNoCustomOwnProperties(value, path, new Set(["lastIndex"]));
		return;
	}

	for (const key of Reflect.ownKeys(value)) {
		if (typeof key === "symbol") {
			throw new Error(`${path} contains a symbol-keyed property.`);
		}
		if (Array.isArray(value) && key === "length") continue;

		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor || !("value" in descriptor)) {
			throw new Error(`${path}.${key} uses an accessor property.`);
		}
		if (!descriptor.enumerable) {
			throw new Error(
				`${path}.${key} is non-enumerable and would be lost when cloned.`,
			);
		}
		assertStructuredState(descriptor.value, `${path}.${key}`, seen);
	}
}

function restoreCloneMetadata(
	source: unknown,
	clone: unknown,
	seen = new WeakMap<object, WeakSet<object>>(),
): void {
	if (
		source === null ||
		clone === null ||
		typeof source !== "object" ||
		typeof clone !== "object"
	) {
		return;
	}
	if (markSeenPair(source, clone, seen)) return;

	if (isRegExp(source) && isRegExp(clone)) {
		clone.lastIndex = source.lastIndex;
		return;
	}
	if (isDate(source) && isDate(clone)) return;
	if (isMap(source) && isMap(clone)) {
		const sourceEntries = source.entries();
		const cloneEntries = clone.entries();
		while (true) {
			const sourceNext = sourceEntries.next();
			const cloneNext = cloneEntries.next();
			if (sourceNext.done || cloneNext.done) return;
			restoreCloneMetadata(sourceNext.value[0], cloneNext.value[0], seen);
			restoreCloneMetadata(sourceNext.value[1], cloneNext.value[1], seen);
		}
	}
	if (isSet(source) && isSet(clone)) {
		const sourceValues = source.values();
		const cloneValues = clone.values();
		while (true) {
			const sourceNext = sourceValues.next();
			const cloneNext = cloneValues.next();
			if (sourceNext.done || cloneNext.done) return;
			restoreCloneMetadata(sourceNext.value, cloneNext.value, seen);
		}
	}

	for (const key of Object.keys(source)) {
		restoreCloneMetadata(
			(source as Record<string, unknown>)[key],
			(clone as Record<string, unknown>)[key],
			seen,
		);
	}
}

export function cloneStructuredState<T>(value: T, path = "state"): T {
	assertStructuredState(value, path);
	const clone = structuredClone(value);
	restoreCloneMetadata(value, clone);
	return clone;
}

function markSeenPair(
	left: object,
	right: object,
	seen: WeakMap<object, WeakSet<object>>,
): boolean {
	let rightSet = seen.get(left);
	if (!rightSet) {
		rightSet = new WeakSet<object>();
		seen.set(left, rightSet);
	}
	if (rightSet.has(right)) return true;
	rightSet.add(right);
	return false;
}

interface EqualityState {
	leftToRight: WeakMap<object, object>;
	rightToLeft: WeakMap<object, object>;
}

export function structuredStateEqual(
	left: unknown,
	right: unknown,
	seen: EqualityState = {
		leftToRight: new WeakMap<object, object>(),
		rightToLeft: new WeakMap<object, object>(),
	},
): boolean {
	if (Object.is(left, right)) return true;
	if (
		left === null ||
		right === null ||
		typeof left !== "object" ||
		typeof right !== "object"
	) {
		return false;
	}

	if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right))
		return false;
	const mappedRight = seen.leftToRight.get(left);
	const mappedLeft = seen.rightToLeft.get(right);
	if (mappedRight !== undefined || mappedLeft !== undefined) {
		return mappedRight === right && mappedLeft === left;
	}
	seen.leftToRight.set(left, right);
	seen.rightToLeft.set(right, left);

	if (isDate(left) && isDate(right)) {
		return Object.is(left.getTime(), right.getTime());
	}

	if (isRegExp(left) && isRegExp(right)) {
		return (
			left.source === right.source &&
			left.flags === right.flags &&
			left.lastIndex === right.lastIndex
		);
	}

	if (isMap(left) && isMap(right)) {
		if (left.size !== right.size) return false;
		const leftEntries = left.entries();
		const rightEntries = right.entries();
		while (true) {
			const leftNext = leftEntries.next();
			const rightNext = rightEntries.next();
			if (leftNext.done || rightNext.done)
				return leftNext.done === rightNext.done;
			if (
				!structuredStateEqual(leftNext.value[0], rightNext.value[0], seen) ||
				!structuredStateEqual(leftNext.value[1], rightNext.value[1], seen)
			) {
				return false;
			}
		}
	}

	if (isSet(left) && isSet(right)) {
		if (left.size !== right.size) return false;
		const leftValues = left.values();
		const rightValues = right.values();
		while (true) {
			const leftNext = leftValues.next();
			const rightNext = rightValues.next();
			if (leftNext.done || rightNext.done)
				return leftNext.done === rightNext.done;
			if (!structuredStateEqual(leftNext.value, rightNext.value, seen))
				return false;
		}
	}

	if (
		Array.isArray(left) &&
		Array.isArray(right) &&
		left.length !== right.length
	) {
		return false;
	}

	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) return false;
	for (const key of leftKeys) {
		if (!Object.hasOwn(right, key)) return false;
		if (
			!structuredStateEqual(
				(left as Record<string, unknown>)[key],
				(right as Record<string, unknown>)[key],
				seen,
			)
		) {
			return false;
		}
	}
	return true;
}
