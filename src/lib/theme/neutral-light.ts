import type { Theme } from './types';

const neutralLight: Theme = {
	pageBg:      'bg-neutral-100',
	surfaceBg:   'bg-white',
	recessedBg:  'bg-neutral-50',
	elevatedBg:  'bg-neutral-100',
	strongBg:    'bg-neutral-200',
	headerBg:    'bg-neutral-100/95',

	borderBase:      'border-neutral-200',
	borderStrong:    'border-neutral-300',
	borderFaded:     'border-neutral-200/60',
	borderHighlight: 'border-neutral-900',

	textPrimary:   'text-neutral-900',
	textSecondary: 'text-neutral-600',
	textMuted:     'text-neutral-400',
	textFaint:     'text-neutral-300',

	hoverBg:            'hover:bg-neutral-100',
	hoverBgStrong:      'hover:bg-neutral-200',
	hoverText:          'hover:text-neutral-900',
	hoverTextSecondary: 'hover:text-neutral-700',
	hoverBorderBase:    'hover:border-neutral-300',
	hoverBorderStrong:  'hover:border-neutral-400',
	focusRing:          'focus:ring-neutral-400',

	btnPrimaryBg:    'bg-neutral-900',
	btnPrimaryText:  'text-white',
	btnPrimaryHover: 'hover:bg-neutral-800',

	accentText:        'text-amber-600',
	accentTextHover:   'hover:text-amber-700',
	accentBorder:      'border-amber-300',
	accentBorderHover: 'hover:border-amber-500',
	accentBg:          'bg-amber-50',

	linkText:        'text-orange-600',
	linkTextHover:   'hover:text-orange-700',
	linkBorder:      'border-orange-300',
	linkBorderHover: 'hover:border-orange-500',
};

export default neutralLight;
