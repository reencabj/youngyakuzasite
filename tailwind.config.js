/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./lore.html"],
  theme: {
    extend: {
      colors: {
        yakuza: {
          DEFAULT: "#9e8ced",  // tu lila principal
          light: "#b3a6f1",    // hover más claro
          dark:  "#7f6ac1"     // versión más oscura para bordes
        }
      }
    }
  },
  safelist: [
    // Clases que agregás desde JS dinámicamente (MultiKick, grids, etc.)
    "md:grid-cols-1","md:grid-cols-2","md:grid-cols-3","md:grid-cols-4","xl:grid-cols-2",
    // (agregá aquí cualquier clase que generes en tiempo de ejecución)
  ],
};
