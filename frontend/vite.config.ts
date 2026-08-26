import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const backendTarget = process.env.VITE_BACKEND_TARGET ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom", "react-router-dom"],
    alias: {
      "@admin": fileURLToPath(new URL("./src/admin", import.meta.url)),
      react: fileURLToPath(new URL("./node_modules/react", import.meta.url)),
      "react-dom": fileURLToPath(new URL("./node_modules/react-dom", import.meta.url)),
      "react-router-dom": fileURLToPath(new URL("./node_modules/react-router-dom", import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": backendTarget,
      "/health": backendTarget,
      "/ready": backendTarget
    }
  }
});

