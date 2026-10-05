import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // Vite resolves the "@/*" alias from tsconfig.json natively (replaces the
  // former vite-tsconfig-paths plugin).
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    // Route TanStack Start's server entry through src/server.ts, which wraps
    // SSR responses with our own error page (see src/server.ts).
    tanstackStart({
      server: { entry: "server" },
    }),
    viteReact(),
    nitro({
      // Phase 19: daily cleanup of abandoned direct uploads. Written into
      // .vercel/output/config.json at build time, so no vercel.json is needed.
      // Daily is the most frequent schedule Vercel's Hobby plan allows. The
      // endpoint requires CRON_SECRET (see src/routes/api.cron.cleanup-uploads.ts).
      vercel: {
        config: {
          version: 3,
          crons: [{ path: "/api/cron/cleanup-uploads", schedule: "17 3 * * *" }],
        },
      },
      // Low-risk security headers on every response. Nitro writes these into
      // the node-server output and into Vercel's routing config alike.
      // Not set here on purpose: Content-Security-Policy (needs runtime testing
      // against hydration, R2-backed media and seed images — see DEPLOYMENT.md)
      // and Strict-Transport-Security (Vercel adds it on its own domains; set
      // it on your custom domain once HTTPS is confirmed).
      routeRules: {
        "/**": {
          headers: {
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "X-Frame-Options": "DENY",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
          },
        },
      },
    }),
  ],
});
