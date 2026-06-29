import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During development, /api is proxied to the Go backend so the browser treats
// cookies as same-origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
