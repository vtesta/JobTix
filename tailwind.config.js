/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Neutral ramp (warm-tinted graphite, not pure black)
        ink: {
          950: '#0a0c0a',
          900: '#0f120f',
          850: '#141814',
          800: '#1a1f1a',
          700: '#242b24',
          600: '#323b32',
          500: '#465246',
          400: '#6b776b',
          300: '#9aa69a',
          200: '#c3ccc3',
          100: '#e2e8e2',
          50: '#f2f6f2',
        },
        // Primary green ramp
        green: {
          50: '#ecfdf3',
          100: '#d1fadf',
          200: '#a6f4c5',
          300: '#6ce9a6',
          400: '#32d583',
          500: '#12b76a',
          600: '#039855',
          700: '#027a48',
          800: '#05603a',
          900: '#054f31',
          950: '#032b17',
        },
        // Supporting semantic ramps
        success: {
          500: '#12b76a',
          600: '#039855',
        },
        warning: {
          400: '#fdb022',
          500: '#f79009',
          600: '#dc6803',
        },
        error: {
          400: '#f97066',
          500: '#f04438',
          600: '#d92d20',
        },
        info: {
          400: '#53b1fd',
          500: '#2e90fa',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)',
        pop: '0 12px 40px -8px rgba(0,0,0,0.7)',
        glow: '0 0 0 1px rgba(18,183,106,0.35), 0 0 24px -4px rgba(18,183,106,0.25)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.35s ease-out both',
        'fade-in': 'fade-in 0.25s ease-out both',
        'scale-in': 'scale-in 0.18s ease-out both',
        shimmer: 'shimmer 1.4s linear infinite',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
