// Theme selection — set PUBLIC_THEME in your .env to switch palettes.
// A rebuild (or dev server restart) is required when changing PUBLIC_THEME.
// Add new themes by creating a file in this directory and registering it below.

import { PUBLIC_THEME } from '$env/static/public';
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

export const theme: Theme = themes[PUBLIC_THEME ?? 'dark'] ?? zinc;
export type { Theme };
