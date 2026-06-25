/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#1a6b3c', light: '#22c55e', dark: '#14532d' },
      },
    },
  },
  plugins: [],
}

