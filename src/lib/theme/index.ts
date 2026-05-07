// Theme selection — set PUBLIC_THEME in your .env to pick the instance default.
// Users can toggle between the dark and light counterpart via settings.
// Preference is stored in localStorage under 'khord_theme'.

import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import type { Theme } from './types';

// ── Neutral dark themes ───────────────────────────────────────────────────────
import zinc from './dark';         // default
import slate from './slate';
import gray from './gray';
import neutral from './neutral';
import stone from './stone';

// ── Neutral light themes ──────────────────────────────────────────────────────
import light from './light';       // gray-based (alias: gray-light)
import slateLight from './slate-light';
import zincLight from './zinc-light';
import neutralLight from './neutral-light';
import stoneLight from './stone-light';

// ── Chromatic dark themes ─────────────────────────────────────────────────────
import navy from './navy';
import tealTheme from './teal';
import emerald from './emerald';
import rose from './rose';
import violetTheme from './violet';

const themes: Record<string, Theme> = {
	// Neutral dark
	dark: zinc,
	zinc,
	slate,
	gray,
	neutral,
	stone,

	// Neutral light
	light,
	'gray-light': light,
	'slate-light': slateLight,
	'zinc-light': zincLight,
	'neutral-light': neutralLight,
	'stone-light': stoneLight,

	// Chromatic dark
	navy,
	teal: tealTheme,
	emerald,
	rose,
	violet: violetTheme,
};

// Dark ↔ light counterpart pairs. Chromatic themes have no pairing.
const pairs: Record<string, string> = {
	'dark':          'zinc-light',
	'zinc':          'zinc-light',
	'zinc-light':    'dark',
	'slate':         'slate-light',
	'slate-light':   'slate',
	'gray':          'light',
	'light':         'gray',
	'gray-light':    'gray',
	'neutral':       'neutral-light',
	'neutral-light': 'neutral',
	'stone':         'stone-light',
	'stone-light':   'stone',
};

const STORAGE_KEY = 'khord_theme';
const instanceDefault = env.PUBLIC_THEME ?? 'dark';

function resolveTheme(name: string): Theme {
	return themes[name] ?? themes[instanceDefault] ?? zinc;
}

function loadInitialName(): string {
	if (browser) {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored && themes[stored]) return stored;
	}
	return instanceDefault;
}

function createThemeStore() {
	let currentName = loadInitialName();
	const { subscribe, set } = writable<Theme>(resolveTheme(currentName));

	return {
		subscribe,

		/** Returns the name of the counterpart theme, or null for chromatic themes. */
		counterpart(): string | null {
			return pairs[currentName] ?? null;
		},

		/** True if this theme has a dark/light counterpart. */
		hasPair(): boolean {
			return currentName in pairs;
		},

		/** True if the current theme is a light variant. */
		isLight(): boolean {
			return currentName.endsWith('-light') || currentName === 'light';
		},

		toggle() {
			const next = pairs[currentName];
			if (!next) return;
			currentName = next;
			if (browser) localStorage.setItem(STORAGE_KEY, currentName);
			set(resolveTheme(currentName));
		},

		setTheme(name: string) {
			if (!themes[name]) return;
			currentName = name;
			if (browser) localStorage.setItem(STORAGE_KEY, currentName);
			set(resolveTheme(currentName));
		},
	};
}

export const theme = createThemeStore();
export type { Theme };
