import type { Theme } from './types';

const slateLight: Theme = {
	pageBg:      'bg-slate-100',
	surfaceBg:   'bg-white',
	recessedBg:  'bg-slate-50',
	elevatedBg:  'bg-slate-100',
	strongBg:    'bg-slate-200',
	headerBg:    'bg-slate-100/95',

	borderBase:      'border-slate-200',
	borderStrong:    'border-slate-300',
	borderFaded:     'border-slate-200/60',
	borderHighlight: 'border-slate-900',

	textPrimary:   'text-slate-900',
	textSecondary: 'text-slate-600',
	textMuted:     'text-slate-400',
	textFaint:     'text-slate-300',

	hoverBg:            'hover:bg-slate-100',
	hoverBgStrong:      'hover:bg-slate-200',
	hoverText:          'hover:text-slate-900',
	hoverTextSecondary: 'hover:text-slate-700',
	hoverBorderBase:    'hover:border-slate-300',
	hoverBorderStrong:  'hover:border-slate-400',
	focusRing:          'focus:ring-slate-400',

	btnPrimaryBg:    'bg-slate-900',
	btnPrimaryText:  'text-white',
	btnPrimaryHover: 'hover:bg-slate-800',

	accentText:        'text-sky-600',
	accentTextHover:   'hover:text-sky-700',
	accentBorder:      'border-sky-300',
	accentBorderHover: 'hover:border-sky-500',
	accentBg:          'bg-sky-50',

	linkText:        'text-blue-600',
	linkTextHover:   'hover:text-blue-700',
	linkBorder:      'border-blue-300',
	linkBorderHover: 'hover:border-blue-500',

	// Hero
	heroGradient: 'bg-gradient-to-br from-sky-100 via-slate-100 to-slate-100',
};

export default slateLight;
