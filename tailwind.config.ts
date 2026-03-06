import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#F7931A',
          dim: '#D97B0E',
        },
        surface: {
          DEFAULT: '#080B12',
          card: '#0E1320',
          elevated: '#141B2E',
          border: '#1A2236',
          bright: '#24304A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.35s ease-out',
        'opnet-glow': 'opnetGlow 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        opnetGlow: {
          '0%, 100%': {
            opacity: '0.5',
            filter: 'drop-shadow(0 0 4px rgba(254,121,1,0.3))',
          },
          '50%': {
            opacity: '1',
            filter: 'drop-shadow(0 0 12px rgba(254,121,1,0.6)) drop-shadow(0 0 24px rgba(254,121,1,0.25))',
          },
        },
      },
    },
  },
  plugins: [],
};

export default config;
