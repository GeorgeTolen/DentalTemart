/** @type {import('tailwindcss').Config} */
export default {
  // Тёмная тема включается классом dark на <html> (см. ThemeToggle).
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#2563EB",
          dark: "#1D4ED8",
          light: "#DBEAFE",
          bg: "#EFF6FF",
        },
        ink: "#0F172A",
        canvas: "#F8FAFC",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      borderRadius: {
        xl: "0.875rem",
      },
    },
  },
  plugins: [],
};
