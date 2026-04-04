export interface Theme {
	// ── Backgrounds ──────────────────────────────────────────────────────────────
	/** Outermost page background */
	pageBg: string;
	/** Cards, modals, panels, dropdowns */
	surfaceBg: string;
	/** Inputs / textareas nested inside a surface (creates visual depth) */
	recessedBg: string;
	/** Items elevated above a surface: input fields, song rows */
	elevatedBg: string;
	/** Toggled / strongly active states */
	strongBg: string;
	/** Sticky header with opacity for backdrop blur */
	headerBg: string;

	// ── Borders ──────────────────────────────────────────────────────────────────
	/** Standard dividing borders */
	borderBase: string;
	/** Stronger borders: inputs, modal outlines, dropdown outlines */
	borderStrong: string;
	/** Faded border used with opacity (e.g. toolbar bottom) */
	borderFaded: string;
	/** Highest-contrast border for selected / active items */
	borderHighlight: string;

	// ── Text ─────────────────────────────────────────────────────────────────────
	/** Headings, main body copy */
	textPrimary: string;
	/** Supporting / secondary copy */
	textSecondary: string;
	/** Muted metadata, hint text, icons */
	textMuted: string;
	/** Very faint: placeholders, fill icons */
	textFaint: string;

	// ── Interactive states ────────────────────────────────────────────────────────
	/** Standard item hover background */
	hoverBg: string;
	/** Stronger hover (items already elevated) */
	hoverBgStrong: string;
	/** Text → primary on hover */
	hoverText: string;
	/** Text → secondary on hover */
	hoverTextSecondary: string;
	/** Subtle border reveal on hover */
	hoverBorderBase: string;
	/** Stronger border on hover (active controls) */
	hoverBorderStrong: string;
	/** focus:ring color */
	focusRing: string;

	// ── Primary CTA ───────────────────────────────────────────────────────────────
	/** FAB, submit buttons — background */
	btnPrimaryBg: string;
	/** FAB, submit buttons — text */
	btnPrimaryText: string;
	/** FAB, submit buttons — hover background */
	btnPrimaryHover: string;

	// ── Accent (setlist / secondary actions) ─────────────────────────────────────
	accentText: string;
	accentTextHover: string;
	accentBorder: string;
	accentBorderHover: string;
	accentBg: string;

	// ── Link (song.link) ─────────────────────────────────────────────────────────
	linkText: string;
	linkTextHover: string;
	linkBorder: string;
	linkBorderHover: string;
}
