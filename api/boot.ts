import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  // 进程级兜底：单个请求/定时器回调的未知异常不应直接杀死游戏进程
  // （否则所有在线玩家同时掉线）。记录日志后继续运行。
  process.on("uncaughtException", (err) => {
    console.error("[boot] uncaughtException（进程继续运行）:", err);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[boot] unhandledRejection（进程继续运行）:", reason);
  });

  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  const server = serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
  const { attachGameServer } = await import("./game/server");
  attachGameServer(server);
}
