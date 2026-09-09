import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true
      },
      "/socket.io": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        ws: true
      }
    }
  }
});
