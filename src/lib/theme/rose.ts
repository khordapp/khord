import type { Theme } from './types';

// Dark theme using rose-950/900 as the base palette (deep crimson)
const rose: Theme = {
	pageBg:      'bg-rose-950',
	surfaceBg:   'bg-rose-900',
	recessedBg:  'bg-rose-950',
	elevatedBg:  'bg-rose-800',
	strongBg:    'bg-rose-700',
	headerBg:    'bg-rose-950/95',

	borderBase:      'border-rose-800',
	borderStrong:    'border-rose-700',
	borderFaded:     'border-rose-800/60',
	borderHighlight: 'border-white',

	textPrimary:   'text-rose-50',
	textSecondary: 'text-rose-200',
	textMuted:     'text-rose-400',
	textFaint:     'text-rose-700',

	hoverBg:            'hover:bg-rose-800',
	hoverBgStrong:      'hover:bg-rose-700',
	hoverText:          'hover:text-rose-50',
	hoverTextSecondary: 'hover:text-rose-200',
	hoverBorderBase:    'hover:border-rose-700',
	hoverBorderStrong:  'hover:border-rose-500',
	focusRing:          'focus:ring-rose-500',

	btnPrimaryBg:    'bg-white',
	btnPrimaryText:  'text-rose-950',
	btnPrimaryHover: 'hover:bg-rose-100',

	accentText:        'text-pink-300',
	accentTextHover:   'hover:text-pink-200',
	accentBorder:      'border-pink-800',
	accentBorderHover: 'hover:border-pink-600',
	accentBg:          'bg-pink-950',

	linkText:        'text-fuchsia-300',
	linkTextHover:   'hover:text-fuchsia-200',
	linkBorder:      'border-fuchsia-800',
	linkBorderHover: 'hover:border-fuchsia-600',
};

export default rose;
