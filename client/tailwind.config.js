/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    screens: {
      // Mobile-first breakpoints
      // fold  : teléfonos plegables en estado cerrado (~280-320 px)
      // xs    : teléfonos estándar (375-414 px)
      // sm+   : valores por defecto de Tailwind (640, 768, 1024, 1280, 1536)
      'fold': '320px',
      'xs':   '390px',
      'sm':   '640px',
      'md':   '768px',
      'lg':   '1024px',
      'xl':   '1280px',
      '2xl':  '1536px',
    },
    extend: {
      colors: {
        surface: {
          900: 'rgb(var(--surface-900) / <alpha-value>)',
          800: 'rgb(var(--surface-800) / <alpha-value>)',
          700: 'rgb(var(--surface-700) / <alpha-value>)',
          600: 'rgb(var(--surface-600) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          hover:   'rgb(var(--accent-hover) / <alpha-value>)',
          light:   'rgb(var(--accent-light) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
