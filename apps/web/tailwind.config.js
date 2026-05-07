/** @type {import('tailwindcss').Config} */
export default {
  content: ['./apps/web/index.html', './apps/web/src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          950: '#050708',
          900: '#0b1012',
          850: '#101719',
          800: '#141d20',
          700: '#203034'
        },
        line: '#24353a',
        text: {
          primary: '#f2f7f4',
          secondary: '#9fb2ad',
          muted: '#657873'
        },
        accent: {
          green: '#34d399',
          greenSoft: '#12352d',
          cyan: '#3ddbd9',
          amber: '#f2b84b',
          violet: '#8b7cf6'
        }
      },
      boxShadow: {
        panel: '0 18px 60px rgba(0, 0, 0, 0.32)',
        glow: '0 0 0 1px rgba(52, 211, 153, 0.18), 0 18px 42px rgba(11, 16, 18, 0.55)'
      },
      borderRadius: {
        panel: '8px'
      }
    }
  },
  plugins: []
};
