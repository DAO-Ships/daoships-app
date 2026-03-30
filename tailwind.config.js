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
      colors: {
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        accent: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
          950: '#083344',
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
          'indigo-glow': '#6366f1',
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
        'indigo-glow': '0 0 20px rgba(99, 102, 241, var(--dao-glow-strength)), 0 0 40px rgba(99, 102, 241, calc(var(--dao-glow-strength) * 0.33))',
        'indigo-glow-lg': '0 0 40px rgba(99, 102, 241, calc(var(--dao-glow-strength) * 1.33)), 0 0 80px rgba(99, 102, 241, calc(var(--dao-glow-strength) * 0.67))',
        'cyan-glow': '0 0 20px rgba(6, 182, 212, var(--dao-glow-strength)), 0 0 40px rgba(6, 182, 212, calc(var(--dao-glow-strength) * 0.33))',
        'dao-card': '0 8px 16px rgba(0, 0, 0, var(--dao-shadow-strength)), 0 0 0 1px rgba(99, 102, 241, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        'dao-button': '0 4px 8px rgba(0, 0, 0, var(--dao-shadow-strength)), 0 0 0 1px rgba(99, 102, 241, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
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
      },
    },
  },
  plugins: [],
}
