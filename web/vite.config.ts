import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("@stellar")) return "stellar-sdk";
            if (id.includes("stellar-wallets-kit") || id.includes("@creit")) return "wallet-kit";
            if (id.includes("react")) return "react";
            return "vendor";
          }
        },
      },
    },
  },
});
