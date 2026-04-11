import type { Theme } from './types';

const stoneLight: Theme = {
	pageBg:      'bg-stone-100',
	surfaceBg:   'bg-white',
	recessedBg:  'bg-stone-50',
	elevatedBg:  'bg-stone-100',
	strongBg:    'bg-stone-200',
	headerBg:    'bg-stone-100/95',

	borderBase:      'border-stone-200',
	borderStrong:    'border-stone-300',
	borderFaded:     'border-stone-200/60',
	borderHighlight: 'border-stone-900',

	textPrimary:   'text-stone-900',
	textSecondary: 'text-stone-600',
	textMuted:     'text-stone-500',
	textFaint:     'text-stone-400',

	hoverBg:            'hover:bg-stone-100',
	hoverBgStrong:      'hover:bg-stone-200',
	hoverText:          'hover:text-stone-900',
	hoverTextSecondary: 'hover:text-stone-700',
	hoverBorderBase:    'hover:border-stone-300',
	hoverBorderStrong:  'hover:border-stone-400',
	focusRing:          'focus:ring-stone-400',

	btnPrimaryBg:    'bg-stone-900',
	btnPrimaryText:  'text-white',
	btnPrimaryHover: 'hover:bg-stone-800',

	accentText:        'text-amber-600',
	accentTextHover:   'hover:text-amber-700',
	accentBorder:      'border-amber-300',
	accentBorderHover: 'hover:border-amber-500',
	accentBg:          'bg-amber-50',

	linkText:        'text-orange-600',
	linkTextHover:   'hover:text-orange-700',
	linkBorder:      'border-orange-300',
	linkBorderHover: 'hover:border-orange-500',

	// Hero
	heroGradient: 'bg-gradient-to-br from-amber-100 via-stone-100 to-stone-100',
};

export default stoneLight;
