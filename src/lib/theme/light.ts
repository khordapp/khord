import type { Theme } from './types';

const light: Theme = {
	// Backgrounds
	pageBg:     'bg-stone-100',
	surfaceBg:  'bg-white',
	recessedBg: 'bg-stone-100',
	elevatedBg: 'bg-stone-200',
	strongBg:   'bg-stone-300',
	headerBg:   'bg-stone-100/95',

	// Borders
	borderBase:      'border-stone-200',
	borderStrong:    'border-stone-300',
	borderFaded:     'border-stone-200/60',
	borderHighlight: 'border-stone-900',

	// Text
	textPrimary:   'text-stone-900',
	textSecondary: 'text-stone-600',
	textMuted:     'text-stone-500',
	textFaint:     'text-stone-400',

	// Interactive
	hoverBg:            'hover:bg-stone-100',
	hoverBgStrong:      'hover:bg-stone-200',
	hoverText:          'hover:text-stone-900',
	hoverTextSecondary: 'hover:text-stone-700',
	hoverBorderBase:    'hover:border-stone-300',
	hoverBorderStrong:  'hover:border-stone-400',
	focusRing:          'focus:ring-blue-500',

	// Primary CTA
	btnPrimaryBg:    'bg-blue-700',
	btnPrimaryText:  'text-white',
	btnPrimaryHover: 'hover:bg-blue-600',

	// Accent
	accentText:        'text-blue-700',
	accentTextHover:   'hover:text-blue-800',
	accentBorder:      'border-blue-200',
	accentBorderHover: 'hover:border-blue-400',
	accentBg:          'bg-blue-50',

	// Link
	linkText:        'text-sky-700',
	linkTextHover:   'hover:text-sky-800',
	linkBorder:      'border-sky-200',
	linkBorderHover: 'hover:border-sky-400',

	// Hero
	heroGradient: 'bg-gradient-to-b from-amber-50 to-stone-100',
};

export default light;
