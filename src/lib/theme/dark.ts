import type { Theme } from './types';

const dark: Theme = {
	// Backgrounds
	pageBg:     'bg-stone-950',
	surfaceBg:  'bg-stone-900',
	recessedBg: 'bg-stone-950',
	elevatedBg: 'bg-stone-800',
	strongBg:   'bg-stone-700',
	headerBg:   'bg-stone-950/95',

	// Borders
	borderBase:      'border-stone-800',
	borderStrong:    'border-stone-700',
	borderFaded:     'border-stone-800/60',
	borderHighlight: 'border-white',

	// Text
	textPrimary:   'text-stone-100',
	textSecondary: 'text-stone-300',
	textMuted:     'text-stone-500',
	textFaint:     'text-stone-600',

	// Interactive
	hoverBg:            'hover:bg-stone-800',
	hoverBgStrong:      'hover:bg-stone-700',
	hoverText:          'hover:text-stone-100',
	hoverTextSecondary: 'hover:text-stone-300',
	hoverBorderBase:    'hover:border-stone-700',
	hoverBorderStrong:  'hover:border-stone-500',
	focusRing:          'focus:ring-blue-600',

	// Primary CTA
	btnPrimaryBg:    'bg-blue-700',
	btnPrimaryText:  'text-white',
	btnPrimaryHover: 'hover:bg-blue-600',

	// Accent
	accentText:        'text-blue-400',
	accentTextHover:   'hover:text-blue-300',
	accentBorder:      'border-blue-900',
	accentBorderHover: 'hover:border-blue-700',
	accentBg:          'bg-blue-950',

	// Link
	linkText:        'text-sky-400',
	linkTextHover:   'hover:text-sky-300',
	linkBorder:      'border-sky-900',
	linkBorderHover: 'hover:border-sky-700',

	// Hero
	heroGradient: 'bg-gradient-to-b from-amber-900/20 to-stone-950',
};

export default dark;
