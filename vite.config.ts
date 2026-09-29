import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: { port: 5173 },
  // GitHub Pages project sites are served from /<repo-name>/, not the domain root.
  base: command === "build" ? "/mtg-player-local/" : "/",
}));
