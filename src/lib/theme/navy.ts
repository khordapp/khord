import type { Theme } from './types';

// Dark theme using blue-950/900 as the base palette (deep navy)
const navy: Theme = {
	pageBg:      'bg-blue-950',
	surfaceBg:   'bg-blue-900',
	recessedBg:  'bg-blue-950',
	elevatedBg:  'bg-blue-800',
	strongBg:    'bg-blue-700',
	headerBg:    'bg-blue-950/95',

	borderBase:      'border-blue-800',
	borderStrong:    'border-blue-700',
	borderFaded:     'border-blue-800/60',
	borderHighlight: 'border-white',

	textPrimary:   'text-blue-50',
	textSecondary: 'text-blue-200',
	textMuted:     'text-blue-400',
	textFaint:     'text-blue-600',

	hoverBg:            'hover:bg-blue-800',
	hoverBgStrong:      'hover:bg-blue-700',
	hoverText:          'hover:text-blue-50',
	hoverTextSecondary: 'hover:text-blue-200',
	hoverBorderBase:    'hover:border-blue-700',
	hoverBorderStrong:  'hover:border-blue-500',
	focusRing:          'focus:ring-blue-500',

	btnPrimaryBg:    'bg-white',
	btnPrimaryText:  'text-blue-950',
	btnPrimaryHover: 'hover:bg-blue-100',

	accentText:        'text-sky-300',
	accentTextHover:   'hover:text-sky-200',
	accentBorder:      'border-sky-700',
	accentBorderHover: 'hover:border-sky-500',
	accentBg:          'bg-sky-900',

	linkText:        'text-cyan-300',
	linkTextHover:   'hover:text-cyan-200',
	linkBorder:      'border-cyan-700',
	linkBorderHover: 'hover:border-cyan-500',
};

export default navy;
