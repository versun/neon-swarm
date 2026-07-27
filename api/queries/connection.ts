import { drizzle } from "drizzle-orm/mysql2";
import { env } from "../lib/env";
// 相对路径导入：@db 别名在 vite.config 直引 api 链路与 esbuild 打包时无法解析
import * as schema from "../../db/schema";
import * as relations from "../../db/relations";

const fullSchema = { ...schema, ...relations };

let instance: ReturnType<typeof drizzle<typeof fullSchema>>;

export function getDb() {
  if (!instance) {
    instance = drizzle(env.databaseUrl, {
      mode: "planetscale",
      schema: fullSchema,
    });
  }
  return instance;
}
