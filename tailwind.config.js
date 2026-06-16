/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        'display': ['Space Grotesk', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', 'monospace'],
        'sans': ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        // Smallest label size — replaces scattered arbitrary text-[10px]/[11px].
        '2xs': ['0.6875rem', { lineHeight: '0.875rem' }],
      },
      colors: {
        // primary/accent are CSS-variable-driven so a DAO's posted `theme` can
        // recolor the whole UI at runtime (see useDaoTheme + index.css :root for
        // the default ramps). `<alpha-value>` keeps Tailwind opacity modifiers
        // (e.g. bg-primary-500/20) working. Default ramp = the DAOShips helm
        // violet (300/500/700 = #afa9ec/#7f77dd/#534ab7; white on 600 = 5.64:1).
        primary: {
          50: 'rgb(var(--primary-50) / <alpha-value>)',
          100: 'rgb(var(--primary-100) / <alpha-value>)',
          200: 'rgb(var(--primary-200) / <alpha-value>)',
          300: 'rgb(var(--primary-300) / <alpha-value>)',
          400: 'rgb(var(--primary-400) / <alpha-value>)',
          500: 'rgb(var(--primary-500) / <alpha-value>)',
          600: 'rgb(var(--primary-600) / <alpha-value>)',
          700: 'rgb(var(--primary-700) / <alpha-value>)',
          800: 'rgb(var(--primary-800) / <alpha-value>)',
          900: 'rgb(var(--primary-900) / <alpha-value>)',
          950: 'rgb(var(--primary-950) / <alpha-value>)',
        },
        accent: {
          50: 'rgb(var(--accent-50) / <alpha-value>)',
          100: 'rgb(var(--accent-100) / <alpha-value>)',
          200: 'rgb(var(--accent-200) / <alpha-value>)',
          300: 'rgb(var(--accent-300) / <alpha-value>)',
          400: 'rgb(var(--accent-400) / <alpha-value>)',
          500: 'rgb(var(--accent-500) / <alpha-value>)',
          600: 'rgb(var(--accent-600) / <alpha-value>)',
          700: 'rgb(var(--accent-700) / <alpha-value>)',
          800: 'rgb(var(--accent-800) / <alpha-value>)',
          900: 'rgb(var(--accent-900) / <alpha-value>)',
          950: 'rgb(var(--accent-950) / <alpha-value>)',
        },
        dao: {
          black: '#000000',
          'dark-1': 'var(--dao-bg-1)',
          'dark-2': 'var(--dao-bg-2)',
          'dark-3': 'var(--dao-bg-3)',
          'dark-4': 'var(--dao-bg-4)',
          'surface': 'var(--dao-surface)',
          'border': 'var(--dao-border)',
          'text': 'var(--dao-text)',
          'text-secondary': 'var(--dao-text-secondary)',
          'text-muted': 'var(--dao-text-muted)',
          'text-hint': 'var(--dao-text-hint)',
          'indigo-glow': '#7f77dd',
          'cyan-glow': '#06b6d4',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-dark': 'linear-gradient(135deg, var(--dao-bg-1) 0%, var(--dao-bg-2) 100%)',
        'gradient-dao': 'linear-gradient(135deg, var(--dao-bg-1) 0%, var(--dao-bg-2) 25%, var(--dao-bg-3) 50%, var(--dao-bg-2) 75%, var(--dao-bg-1) 100%)',
        'gradient-dao-radial': 'radial-gradient(ellipse at center, var(--dao-bg-3) 0%, var(--dao-bg-1) 100%)',
      },
      boxShadow: {
        'indigo-glow': '0 0 20px rgb(var(--primary-500) / var(--dao-glow-strength)), 0 0 40px rgb(var(--primary-500) / calc(var(--dao-glow-strength) * 0.33))',
        'indigo-glow-lg': '0 0 40px rgb(var(--primary-500) / calc(var(--dao-glow-strength) * 1.33)), 0 0 80px rgb(var(--primary-500) / calc(var(--dao-glow-strength) * 0.67))',
        'cyan-glow': '0 0 20px rgba(6, 182, 212, var(--dao-glow-strength)), 0 0 40px rgba(6, 182, 212, calc(var(--dao-glow-strength) * 0.33))',
        'dao-card': '0 8px 16px rgba(0, 0, 0, var(--dao-shadow-strength)), 0 0 0 1px rgb(var(--primary-500) / 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        'dao-button': '0 4px 8px rgba(0, 0, 0, var(--dao-shadow-strength)), 0 0 0 1px rgb(var(--primary-500) / 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-in': 'slide-in 0.3s ease-out',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { opacity: '0.5', filter: 'brightness(1)' },
          '50%': { opacity: '1', filter: 'brightness(1.2)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}
