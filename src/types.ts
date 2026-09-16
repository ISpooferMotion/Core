import type { AriaRole, CSSProperties, ReactNode } from "react";

export interface StorageAdapter {
	has(key: string): boolean;
	get(key: string): unknown;
	set(key: string, value: unknown): void;
	delete(key: string): void;
	keys(): Iterable<string>;
}

export type StorageOperation =
	| "has"
	| "get"
	| "set"
	| "delete"
	| "keys"
	| "serialize"
	| "deserialize"
	| "migrate"
	| "validate";

export interface StorageFailure {
	operation: StorageOperation;
	key?: string;
	error: unknown;
}

export interface PersistentStateOptions<S> {
	storageVersion?: number;
	validateStoredState?: (value: unknown) => value is S;
	migrateStoredState?: (
		value: unknown,
		fromVersion: number,
		toVersion: number,
	) => S;
	serialize?: (state: S) => unknown;
	deserialize?: (value: unknown) => unknown;
}

export interface ResolvedPersistenceOptions {
	storageVersion: number;
	validateStoredState?: (value: unknown) => boolean;
	migrateStoredState?: (
		value: unknown,
		fromVersion: number,
		toVersion: number,
	) => unknown;
	serialize?: (state: unknown) => unknown;
	deserialize?: (value: unknown) => unknown;
}

export interface WidgetProps {
	"data-ism-widget": string;
	"data-ism-id": string;
	className: string;
	style?: CSSProperties;
	role?: AriaRole;
	"aria-label"?: string;
	"aria-describedby"?: string;
}

export interface WidgetA11y<A extends unknown[] = unknown[]> {
	role?: AriaRole;
	label?: string | ((args: A) => string);
	description?: string;
}

export interface FrameRenderProps {
	id: string;
	state: unknown;
	runtimeId: string;
	setState: (updater: unknown) => void;
	args: unknown[];
	children: ReactNode | null;
	widgetProps: WidgetProps;
}

export interface WidgetRenderProps<S, A extends unknown[] = unknown[]> {
	id: string;
	state: S;
	runtimeId?: string;
	setState: (updater: S | ((prev: S) => S)) => void;
	args: A;
	children: ReactNode | null;
	widgetProps: WidgetProps;
}

export interface WidgetConfig<S, A extends unknown[] = unknown[], R = void>
	extends PersistentStateOptions<S> {
	name: string;

	defaultState: S;

	persistent?: boolean;

	scoped?: boolean;

	getLabel?: (...args: A) => string | undefined;

	render: (props: WidgetRenderProps<S, A>) => ReactNode;

	getReturnValue: (state: S, ...args: A) => R;

	consumeState?: (state: S) => S;

	a11y?: WidgetA11y<A>;
}

export interface FrameEntry {
	id: string;
	widgetName: string;
	args: unknown[];
	children: FrameEntry[];
	renderState: unknown;
	persistence: ResolvedPersistenceOptions | null;
	widgetProps: WidgetProps;
	renderFn: (props: FrameRenderProps) => ReactNode;
	a11yDescription?: string;
}
