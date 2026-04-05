import type { Theme } from './types';

const gray: Theme = {
	pageBg:      'bg-gray-950',
	surfaceBg:   'bg-gray-900',
	recessedBg:  'bg-gray-950',
	elevatedBg:  'bg-gray-800',
	strongBg:    'bg-gray-700',
	headerBg:    'bg-gray-950/95',

	borderBase:      'border-gray-800',
	borderStrong:    'border-gray-700',
	borderFaded:     'border-gray-800/60',
	borderHighlight: 'border-white',

	textPrimary:   'text-gray-100',
	textSecondary: 'text-gray-300',
	textMuted:     'text-gray-500',
	textFaint:     'text-gray-600',

	hoverBg:            'hover:bg-gray-800',
	hoverBgStrong:      'hover:bg-gray-700',
	hoverText:          'hover:text-gray-100',
	hoverTextSecondary: 'hover:text-gray-300',
	hoverBorderBase:    'hover:border-gray-700',
	hoverBorderStrong:  'hover:border-gray-500',
	focusRing:          'focus:ring-gray-500',

	btnPrimaryBg:    'bg-white',
	btnPrimaryText:  'text-black',
	btnPrimaryHover: 'hover:bg-gray-200',

	accentText:        'text-violet-400',
	accentTextHover:   'hover:text-violet-300',
	accentBorder:      'border-violet-900',
	accentBorderHover: 'hover:border-violet-700',
	accentBg:          'bg-violet-950',

	linkText:        'text-indigo-400',
	linkTextHover:   'hover:text-indigo-300',
	linkBorder:      'border-indigo-900',
	linkBorderHover: 'hover:border-indigo-700',

	// Hero
	heroGradient: 'bg-gradient-to-br from-violet-950/70 via-gray-950 to-gray-950',
};

export default gray;
