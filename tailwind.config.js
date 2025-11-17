/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './lore.html',
    './*.{js,mjs}',
    './src/**/*.{js,ts,jsx,tsx,html}'
  ],
  theme: {
    extend: {
      colors: {
        yakuza: '#9e8ced',
        'yakuza-light': '#bfaeff'
      }
    },
  },
  plugins: [],
};

