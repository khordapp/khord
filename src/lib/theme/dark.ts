import type { Theme } from './types';

const dark: Theme = {
	// Backgrounds
	pageBg:      'bg-zinc-950',
	surfaceBg:   'bg-zinc-900',
	recessedBg:  'bg-zinc-950',
	elevatedBg:  'bg-zinc-800',
	strongBg:    'bg-zinc-700',
	headerBg:    'bg-zinc-950/95',

	// Borders
	borderBase:      'border-zinc-800',
	borderStrong:    'border-zinc-700',
	borderFaded:     'border-zinc-800/60',
	borderHighlight: 'border-white',

	// Text
	textPrimary:   'text-zinc-100',
	textSecondary: 'text-zinc-300',
	textMuted:     'text-zinc-500',
	textFaint:     'text-zinc-600',

	// Interactive
	hoverBg:           'hover:bg-zinc-800',
	hoverBgStrong:     'hover:bg-zinc-700',
	hoverText:         'hover:text-zinc-100',
	hoverTextSecondary:'hover:text-zinc-300',
	hoverBorderBase:   'hover:border-zinc-700',
	hoverBorderStrong: 'hover:border-zinc-500',
	focusRing:         'focus:ring-zinc-500',

	// Primary CTA
	btnPrimaryBg:    'bg-white',
	btnPrimaryText:  'text-black',
	btnPrimaryHover: 'hover:bg-zinc-200',

	// Accent
	accentText:        'text-violet-400',
	accentTextHover:   'hover:text-violet-300',
	accentBorder:      'border-violet-900',
	accentBorderHover: 'hover:border-violet-700',
	accentBg:          'bg-violet-950',

	// Link
	linkText:        'text-indigo-400',
	linkTextHover:   'hover:text-indigo-300',
	linkBorder:      'border-indigo-900',
	linkBorderHover: 'hover:border-indigo-700',
};

export default dark;
