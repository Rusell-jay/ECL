/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefaf6',
          100: '#d5f3e8',
          200: '#aee6d3',
          300: '#79d2b8',
          400: '#43b699',
          500: '#229b80',
          600: '#157d67',
          700: '#126454',
          800: '#125045',
          900: '#10423a',
          950: '#062521',
        },
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d5dae2',
          300: '#b0bac9',
          400: '#8494a9',
          500: '#64778f',
          600: '#4f6076',
          700: '#414e60',
          800: '#384351',
          900: '#323a45',
          950: '#1f242c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.08)',
      },
    },
  },
  plugins: [],
}
