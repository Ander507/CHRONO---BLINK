/**
 * Local development Postgres.
 *
 * Runs a real PostgreSQL server (binaries shipped by the `embedded-postgres`
 * npm package) so contributors don't need Docker or a system install. If you
 * already run Postgres, skip this and point DATABASE_URL at it instead.
 *
 * Data lives in .data/postgres and survives restarts. Ctrl+C stops the server.
 */
import "dotenv/config";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";

const url = new URL(process.env.DATABASE_URL ?? "postgres://chronoblink:chronoblink@127.0.0.1:54329/chronoblink");
const port = Number(url.port || 5432);
const user = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);
const databases = [url.pathname.slice(1), process.env.TEST_DATABASE_NAME ?? "chronoblink_test"];

const dataDir = path.resolve(".data/postgres");
const fresh = !existsSync(path.join(dataDir, "PG_VERSION"));
mkdirSync(path.dirname(dataDir), { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  port,
  user,
  password,
  persistent: true,
  onLog: () => {},
  onError: (e) => console.error("[postgres]", e),
});

async function alreadyRunning() {
  const probe = postgres({ host: "127.0.0.1", port, user, password, database: "postgres", max: 1, connect_timeout: 2, onnotice: () => {} });
  try {
    await probe`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.end({ timeout: 1 }).catch(() => {});
  }
}

const external = await alreadyRunning();
if (external) {
  console.log(`[db] a PostgreSQL server is already listening on ${port}; reusing it`);
} else {
  if (fresh) {
    console.log(`[db] initialising new cluster in ${dataDir}`);
    await pg.initialise();
  }
  try {
    await pg.start();
  } catch (e) {
    console.error("[db] failed to start PostgreSQL. If a stale server is running, stop it (or delete .data/postgres/postmaster.pid after making sure no postgres process is alive).");
    console.error(e);
    process.exit(1);
  }
}

const admin = postgres({ host: "127.0.0.1", port, user, password, database: "postgres", max: 1, onnotice: () => {} });
for (const name of databases) {
  const rows = await admin`select 1 from pg_database where datname = ${name}`;
  if (rows.length === 0) {
    await admin.unsafe(`create database "${name.replace(/"/g, "")}"`);
    console.log(`[db] created database ${name}`);
  }
}
await admin.end();

console.log(`[db] PostgreSQL ready on 127.0.0.1:${port} (databases: ${databases.join(", ")})`);
console.log("[db] press Ctrl+C to stop");

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log("\n[db] stopping…");
  if (!external) await pg.stop();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
// Keep the process alive.
setInterval(() => {}, 1 << 30);
