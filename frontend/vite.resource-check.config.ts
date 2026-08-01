import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * 临时校验用配置：端口和后端目标都与默认的 vite.config.ts 错开，
 * 这样本机已经跑着的 5173 + 8000 那一套开发服务不用停。
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5199,
    proxy: {
      "/api": "http://127.0.0.1:8011",
      "/health": "http://127.0.0.1:8011",
      "/ready": "http://127.0.0.1:8011"
    }
  }
});
