import type { Theme } from './types';

// Dark theme using violet-950/900 as the base palette (deep purple)
const violet: Theme = {
	pageBg:      'bg-violet-950',
	surfaceBg:   'bg-violet-900',
	recessedBg:  'bg-violet-950',
	elevatedBg:  'bg-violet-800',
	strongBg:    'bg-violet-700',
	headerBg:    'bg-violet-950/95',

	borderBase:      'border-violet-800',
	borderStrong:    'border-violet-700',
	borderFaded:     'border-violet-800/60',
	borderHighlight: 'border-white',

	textPrimary:   'text-violet-50',
	textSecondary: 'text-violet-200',
	textMuted:     'text-violet-400',
	textFaint:     'text-violet-700',

	hoverBg:            'hover:bg-violet-800',
	hoverBgStrong:      'hover:bg-violet-700',
	hoverText:          'hover:text-violet-50',
	hoverTextSecondary: 'hover:text-violet-200',
	hoverBorderBase:    'hover:border-violet-700',
	hoverBorderStrong:  'hover:border-violet-500',
	focusRing:          'focus:ring-violet-500',

	btnPrimaryBg:    'bg-white',
	btnPrimaryText:  'text-violet-950',
	btnPrimaryHover: 'hover:bg-violet-100',

	accentText:        'text-purple-300',
	accentTextHover:   'hover:text-purple-200',
	accentBorder:      'border-purple-700',
	accentBorderHover: 'hover:border-purple-500',
	accentBg:          'bg-purple-950',

	linkText:        'text-indigo-300',
	linkTextHover:   'hover:text-indigo-200',
	linkBorder:      'border-indigo-700',
	linkBorderHover: 'hover:border-indigo-500',

	// Hero
	heroGradient: 'bg-gradient-to-br from-purple-800/30 via-violet-950 to-violet-950',
};

export default violet;
