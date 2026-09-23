import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    // Route TanStack Start's server entry through src/server.ts, which wraps
    // SSR responses with our own error page (see src/server.ts).
    tanstackStart({
      server: { entry: "server" },
    }),
    viteReact(),
    nitro(),
  ],
});
