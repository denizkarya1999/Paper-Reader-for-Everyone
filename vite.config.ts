import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({ base: "./", plugins: [react()], resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } }, build: { outDir: "dist", target: "es2022" }, server: { host: "127.0.0.1", port: 5173, strictPort: true } });
