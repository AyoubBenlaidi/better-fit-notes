/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      colors: {
        // Surface system — all CSS-var-driven for dark/light switching
        surface: {
          base:    'var(--color-background)',
          card:    'var(--color-surface-card)',
          raised:  'var(--color-surface-raised)',
          overlay: 'var(--color-surface-overlay)',
        },
        // Accent
        accent: {
          DEFAULT: '#4F7FFA',
          pressed: '#3A65D4',
          glow:    'rgba(79,127,250,0.2)',
        },
        // Text
        text: {
          primary:   'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted:     'var(--color-text-muted)',
        },
        // Border
        border: {
          DEFAULT: 'var(--color-border)',
          subtle:  'var(--color-border-subtle)',
        },
        // Semantic
        danger:  '#E05252',
        success: '#52B788',
        warning: '#F59E0B',
        // Legacy flat aliases (backward-compat with older component classes)
        background:       'var(--color-background)',
        surface:          'var(--color-surface-card)',   // bg-surface → card bg
        'surface-raised': 'var(--color-surface-raised)',
        'surface-card':   'var(--color-surface-card)',
        'surface-overlay':'var(--color-surface-overlay)',
        // Primary — switches between dark (blue) and light (black) modes
        primary:          'var(--color-primary)',
        'primary-pressed':'var(--color-primary-pressed)',
        'text-primary':   'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted':     'var(--color-text-muted)',
      },
      minHeight: { touch: '44px' },
      minWidth:  { touch: '44px' },
      transitionDuration: {
        fast:   '100ms',
        medium: '200ms',
        slow:   '350ms',
      },
      borderRadius: {
        'xl2': '1rem',
        'xl3': '1.5rem',
      },
      boxShadow: {
        'card':        '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        'card-lg':     '0 4px 16px rgba(0,0,0,0.5)',
        'accent-glow': '0 4px 20px rgba(79,127,250,0.25)',
        'inner-subtle':'inset 0 1px 0 rgba(255,255,255,0.04)',
      },
      animation: {
        'bounce-check':  'bounceCheck 180ms cubic-bezier(0.34,1.56,0.64,1)',
        'slide-up':      'slideUp 300ms cubic-bezier(0.32,0.72,0,1)',
        'fade-in':       'fadeIn 200ms ease-out',
        'scale-in':      'scaleIn 150ms cubic-bezier(0.34,1.56,0.64,1)',
        shimmer:         'shimmer 1.6s infinite',
      },
      keyframes: {
        bounceCheck: {
          '0%':   { transform: 'scale(1)' },
          '50%':  { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%':   { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
