/** @type {import('tailwindcss').Config} */
export default {
  content: ['./apps/web/index.html', './apps/web/src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          950: '#050807',
          900: '#0b1110',
          850: '#101815',
          800: '#17231f',
          700: '#24352f'
        },
        line: '#22332d',
        text: {
          primary: '#f4fff9',
          secondary: '#a9b8b0',
          muted: '#68776f'
        },
        accent: {
          green: '#34d399',
          greenSoft: '#123a2a'
        }
      },
      boxShadow: {
        panel: '0 18px 48px rgba(0, 0, 0, 0.34)',
        glow: '0 0 0 1px rgba(52, 211, 153, 0.22), 0 18px 44px rgba(34, 197, 94, 0.12)'
      },
      borderRadius: {
        panel: '8px'
      }
    }
  },
  plugins: []
};
