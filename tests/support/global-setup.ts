import "dotenv/config";
import { rm } from "node:fs/promises";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Creates (if needed) and migrates the test database once per run, and resets test storage. */
export default async function setup() {
  const base = new URL(process.env.DATABASE_URL ?? "postgres://chronoblink:chronoblink@127.0.0.1:54329/chronoblink");
  const name = process.env.TEST_DATABASE_NAME ?? "chronoblink_test";
  if (!/^[a-z0-9_]+$/.test(name) || !name.includes("test")) throw new Error(`Refusing to use "${name}" as a test database`);
  const admin = postgres({ ...pgOpts(base), database: "postgres", max: 1, onnotice: () => {} });
  const exists = await admin`select 1 from pg_database where datname = ${name}`;
  if (exists.length === 0) await admin.unsafe(`create database "${name}"`);
  await admin.end();

  const sql = postgres({ ...pgOpts(base), database: name, max: 1, onnotice: () => {} });
  await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(drizzle(sql), { migrationsFolder: path.resolve("drizzle") });
  await sql.end();
  await rm(path.resolve(".data/test-storage"), { recursive: true, force: true });
}

function pgOpts(u: URL) {
  return { host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
}
