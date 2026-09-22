import path from "path";
const __dirname = import.meta.dirname;
import react from "@vitejs/plugin-react";
import { defineConfig, type PluginOption } from "vite";
import { inspectAttr } from "plugin-inspect-react-code";

// https://vite.dev/config/
export default defineConfig(async ({ command }) => {
  const isDev = command === "serve";

  const plugins: PluginOption[] = [inspectAttr(), react()];

  if (isDev) {
    const { default: devServer } = await import("@hono/vite-dev-server");
    plugins.unshift(
      devServer({ entry: "api/boot.ts", exclude: [/^\/(?!api\/).*$/] }),
      {
        name: "neon-swarm-game-ws",
        async configureServer(server) {
          if (server.httpServer) {
            const { attachGameServer } = await import("./api/game/server");
            attachGameServer(server.httpServer);
          }
        },
      }
    );
  }

  return {
    base: "/",
    plugins,
    server: {
      port: 3000,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@contracts": path.resolve(__dirname, "./contracts"),
        "@db": path.resolve(__dirname, "./db"),
        db: path.resolve(__dirname, "./db"),
      },
    },
    envDir: path.resolve(__dirname),
    build: {
      outDir: path.resolve(__dirname, "dist/public"),
      emptyOutDir: true,
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules")) {
              if (id.includes("framer-motion") || id.includes("gsap") || id.includes("lenis")) {
                return "vendor-animation";
              }
              if (id.includes("@radix-ui") || id.includes("lucide-react") || id.includes("cmdk")) {
                return "vendor-ui";
              }
              if (id.includes("@tanstack") || id.includes("@trpc")) {
                return "vendor-trpc";
              }
            }
          },
        },
      },
    },
  };
});
