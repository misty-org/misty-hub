import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@website": path.resolve(__dirname, "vendor/misty-website/src"),
      "@docs": path.resolve(__dirname, "vendor/misty-docs/src"),
      react: path.resolve(__dirname, "node_modules/react"),
      "react/jsx-runtime": path.resolve(__dirname, "node_modules/react/jsx-runtime.js"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom"],
  },
  plugins: [react(), tailwindcss()],
});
