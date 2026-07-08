/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      minHeight: {
        'screen': '100dvh', // biar di HP tidak kelebihan scroll
      }
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: ["light"], // tema terang biar jelas di lihat lansia
  },
}