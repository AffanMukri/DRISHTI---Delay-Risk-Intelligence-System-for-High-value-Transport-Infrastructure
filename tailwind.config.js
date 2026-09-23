/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50:  '#eef8f7',
          100: '#d9eeec',
          200: '#b4dcda',
          300: '#7cc1c0',
          400: '#48a0a3',
          500: '#287f86',
          600: '#1a6670',
          700: '#164f5a',
          800: '#173f49',
          900: '#142f38',
          950: '#091d24',
        },
        gov: {
          blue:    '#176b78',
          navy:    '#163946',
          teal:    '#128277',
          gold:    '#c68c35',
        },
        risk: {
          healthy:  '#16a34a',
          watch:    '#d97706',
          high:     '#ea580c',
          critical: '#dc2626',
        },
      },
      fontFamily: {
        sans: ['Aptos', 'Segoe UI Variable', 'Segoe UI', 'Arial', 'system-ui', 'sans-serif'],
        display: ['Charter', 'Bitstream Charter', 'Iowan Old Style', 'Georgia', 'serif'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(15,42,78,0.08), 0 1px 2px -1px rgba(15,42,78,0.06)',
        'card-md': '0 4px 6px -1px rgba(15,42,78,0.08), 0 2px 4px -2px rgba(15,42,78,0.06)',
      },
    },
  },
  plugins: [],
}
