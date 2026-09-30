import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // /api/* (account sign-in/sync, bug reports) only exists in the Cloudflare Worker, not
    // this dev server. Run `npm run dev:worker` alongside `npm run dev` to get real behavior
    // here instead of 404s, while still keeping Vite's hot reload for everything else.
    // "127.0.0.1", not "localhost" — Node resolves "localhost" to the IPv6 ::1 first on some
    // systems, but `wrangler dev` only listens on IPv4, which surfaces as ECONNREFUSED.
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});
