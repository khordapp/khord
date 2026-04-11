import type { Theme } from './types';

const light: Theme = {
	// Backgrounds
	pageBg:      'bg-gray-100',
	surfaceBg:   'bg-white',
	recessedBg:  'bg-gray-50',
	elevatedBg:  'bg-gray-100',
	strongBg:    'bg-gray-200',
	headerBg:    'bg-gray-100/95',

	// Borders
	borderBase:      'border-gray-200',
	borderStrong:    'border-gray-300',
	borderFaded:     'border-gray-200/60',
	borderHighlight: 'border-gray-900',

	// Text
	textPrimary:   'text-gray-900',
	textSecondary: 'text-gray-600',
	textMuted:     'text-gray-500',
	textFaint:     'text-gray-400',

	// Interactive
	hoverBg:            'hover:bg-gray-100',
	hoverBgStrong:      'hover:bg-gray-200',
	hoverText:          'hover:text-gray-900',
	hoverTextSecondary: 'hover:text-gray-700',
	hoverBorderBase:    'hover:border-gray-300',
	hoverBorderStrong:  'hover:border-gray-400',
	focusRing:          'focus:ring-gray-400',

	// Primary CTA
	btnPrimaryBg:    'bg-gray-900',
	btnPrimaryText:  'text-white',
	btnPrimaryHover: 'hover:bg-gray-800',

	// Accent
	accentText:        'text-violet-600',
	accentTextHover:   'hover:text-violet-700',
	accentBorder:      'border-violet-300',
	accentBorderHover: 'hover:border-violet-500',
	accentBg:          'bg-violet-50',

	// Link
	linkText:        'text-indigo-600',
	linkTextHover:   'hover:text-indigo-700',
	linkBorder:      'border-indigo-300',
	linkBorderHover: 'hover:border-indigo-500',

	// Hero
	heroGradient: 'bg-gradient-to-br from-violet-100 via-gray-100 to-gray-100',
};

export default light;
