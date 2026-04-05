import type { Theme } from './types';

// Dark theme using teal-950/900 as the base palette
const teal: Theme = {
	pageBg:      'bg-teal-950',
	surfaceBg:   'bg-teal-900',
	recessedBg:  'bg-teal-950',
	elevatedBg:  'bg-teal-800',
	strongBg:    'bg-teal-700',
	headerBg:    'bg-teal-950/95',

	borderBase:      'border-teal-800',
	borderStrong:    'border-teal-700',
	borderFaded:     'border-teal-800/60',
	borderHighlight: 'border-white',

	textPrimary:   'text-teal-50',
	textSecondary: 'text-teal-200',
	textMuted:     'text-teal-400',
	textFaint:     'text-teal-600',

	hoverBg:            'hover:bg-teal-800',
	hoverBgStrong:      'hover:bg-teal-700',
	hoverText:          'hover:text-teal-50',
	hoverTextSecondary: 'hover:text-teal-200',
	hoverBorderBase:    'hover:border-teal-700',
	hoverBorderStrong:  'hover:border-teal-500',
	focusRing:          'focus:ring-teal-500',

	btnPrimaryBg:    'bg-white',
	btnPrimaryText:  'text-teal-950',
	btnPrimaryHover: 'hover:bg-teal-100',

	accentText:        'text-cyan-300',
	accentTextHover:   'hover:text-cyan-200',
	accentBorder:      'border-cyan-700',
	accentBorderHover: 'hover:border-cyan-500',
	accentBg:          'bg-cyan-900',

	linkText:        'text-emerald-300',
	linkTextHover:   'hover:text-emerald-200',
	linkBorder:      'border-emerald-700',
	linkBorderHover: 'hover:border-emerald-500',

	// Hero
	heroGradient: 'bg-gradient-to-br from-cyan-800/30 via-teal-950 to-teal-950',
};

export default teal;
