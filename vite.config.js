import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Beim lokalen Entwickeln: /api an `vercel dev` weiterreichen
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
