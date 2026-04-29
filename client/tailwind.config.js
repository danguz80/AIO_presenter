/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          900: '#0f0f11',
          800: '#18181b',
          700: '#27272a',
          600: '#3f3f46',
        },
        accent: {
          DEFAULT: '#6366f1',
          hover:   '#4f46e5',
          light:   '#a5b4fc',
        },
      },
      fontFamily: {
        display: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
