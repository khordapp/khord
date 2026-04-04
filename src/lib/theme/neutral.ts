import type { Theme } from './types';

const neutral: Theme = {
	pageBg:      'bg-neutral-950',
	surfaceBg:   'bg-neutral-900',
	recessedBg:  'bg-neutral-950',
	elevatedBg:  'bg-neutral-800',
	strongBg:    'bg-neutral-700',
	headerBg:    'bg-neutral-950/95',

	borderBase:      'border-neutral-800',
	borderStrong:    'border-neutral-700',
	borderFaded:     'border-neutral-800/60',
	borderHighlight: 'border-white',

	textPrimary:   'text-neutral-100',
	textSecondary: 'text-neutral-300',
	textMuted:     'text-neutral-500',
	textFaint:     'text-neutral-600',

	hoverBg:            'hover:bg-neutral-800',
	hoverBgStrong:      'hover:bg-neutral-700',
	hoverText:          'hover:text-neutral-100',
	hoverTextSecondary: 'hover:text-neutral-300',
	hoverBorderBase:    'hover:border-neutral-700',
	hoverBorderStrong:  'hover:border-neutral-500',
	focusRing:          'focus:ring-neutral-500',

	btnPrimaryBg:    'bg-white',
	btnPrimaryText:  'text-black',
	btnPrimaryHover: 'hover:bg-neutral-200',

	accentText:        'text-amber-400',
	accentTextHover:   'hover:text-amber-300',
	accentBorder:      'border-amber-900',
	accentBorderHover: 'hover:border-amber-700',
	accentBg:          'bg-amber-950',

	linkText:        'text-orange-400',
	linkTextHover:   'hover:text-orange-300',
	linkBorder:      'border-orange-900',
	linkBorderHover: 'hover:border-orange-700',
};

export default neutral;
