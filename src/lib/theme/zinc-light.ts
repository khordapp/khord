import type { Theme } from './types';

const zincLight: Theme = {
	pageBg:      'bg-zinc-100',
	surfaceBg:   'bg-white',
	recessedBg:  'bg-zinc-50',
	elevatedBg:  'bg-zinc-100',
	strongBg:    'bg-zinc-200',
	headerBg:    'bg-zinc-100/95',

	borderBase:      'border-zinc-200',
	borderStrong:    'border-zinc-300',
	borderFaded:     'border-zinc-200/60',
	borderHighlight: 'border-zinc-900',

	textPrimary:   'text-zinc-900',
	textSecondary: 'text-zinc-600',
	textMuted:     'text-zinc-400',
	textFaint:     'text-zinc-300',

	hoverBg:            'hover:bg-zinc-100',
	hoverBgStrong:      'hover:bg-zinc-200',
	hoverText:          'hover:text-zinc-900',
	hoverTextSecondary: 'hover:text-zinc-700',
	hoverBorderBase:    'hover:border-zinc-300',
	hoverBorderStrong:  'hover:border-zinc-400',
	focusRing:          'focus:ring-zinc-400',

	btnPrimaryBg:    'bg-zinc-900',
	btnPrimaryText:  'text-white',
	btnPrimaryHover: 'hover:bg-zinc-800',

	accentText:        'text-violet-600',
	accentTextHover:   'hover:text-violet-700',
	accentBorder:      'border-violet-300',
	accentBorderHover: 'hover:border-violet-500',
	accentBg:          'bg-violet-50',

	linkText:        'text-indigo-600',
	linkTextHover:   'hover:text-indigo-700',
	linkBorder:      'border-indigo-300',
	linkBorderHover: 'hover:border-indigo-500',
};

export default zincLight;
