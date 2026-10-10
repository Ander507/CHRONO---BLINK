import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/server/env";
import * as schema from "./schema";

declare global {
  var __cbSql: ReturnType<typeof postgres> | undefined;
}

// Reuse one pool across hot reloads in development.
const sql =
  globalThis.__cbSql ??
  postgres(env.DATABASE_URL, {
    max: env.NODE_ENV === "production" ? 10 : 5,
    idle_timeout: 30,
    onnotice: () => {},
  });
if (env.NODE_ENV !== "production") globalThis.__cbSql = sql;

export const db = drizzle(sql, { schema, casing: "snake_case" });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema, sql as rawSql };
