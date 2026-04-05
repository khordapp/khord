import type { Theme } from './types';

// Dark theme using emerald-950/900 as the base palette (deep forest green)
const emerald: Theme = {
	pageBg:      'bg-emerald-950',
	surfaceBg:   'bg-emerald-900',
	recessedBg:  'bg-emerald-950',
	elevatedBg:  'bg-emerald-800',
	strongBg:    'bg-emerald-700',
	headerBg:    'bg-emerald-950/95',

	borderBase:      'border-emerald-800',
	borderStrong:    'border-emerald-700',
	borderFaded:     'border-emerald-800/60',
	borderHighlight: 'border-white',

	textPrimary:   'text-emerald-50',
	textSecondary: 'text-emerald-200',
	textMuted:     'text-emerald-400',
	textFaint:     'text-emerald-700',

	hoverBg:            'hover:bg-emerald-800',
	hoverBgStrong:      'hover:bg-emerald-700',
	hoverText:          'hover:text-emerald-50',
	hoverTextSecondary: 'hover:text-emerald-200',
	hoverBorderBase:    'hover:border-emerald-700',
	hoverBorderStrong:  'hover:border-emerald-500',
	focusRing:          'focus:ring-emerald-500',

	btnPrimaryBg:    'bg-white',
	btnPrimaryText:  'text-emerald-950',
	btnPrimaryHover: 'hover:bg-emerald-100',

	accentText:        'text-lime-300',
	accentTextHover:   'hover:text-lime-200',
	accentBorder:      'border-lime-800',
	accentBorderHover: 'hover:border-lime-600',
	accentBg:          'bg-lime-950',

	linkText:        'text-teal-300',
	linkTextHover:   'hover:text-teal-200',
	linkBorder:      'border-teal-700',
	linkBorderHover: 'hover:border-teal-500',

	// Hero
	heroGradient: 'bg-gradient-to-br from-lime-900/30 via-emerald-950 to-emerald-950',
};

export default emerald;
