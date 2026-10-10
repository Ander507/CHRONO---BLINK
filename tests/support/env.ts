/**
 * Integration tests run against a real PostgreSQL database named
 * TEST_DATABASE_NAME (default chronoblink_test) on the DATABASE_URL server,
 * and an isolated local storage root. Never point this at production.
 */
import "dotenv/config";
import path from "node:path";

const base = new URL(process.env.DATABASE_URL ?? "postgres://chronoblink:chronoblink@127.0.0.1:54329/chronoblink");
base.pathname = `/${process.env.TEST_DATABASE_NAME ?? "chronoblink_test"}`;
process.env.DATABASE_URL = base.toString();
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_ROOT = path.resolve(".data/test-storage");
process.env.EMAIL_PROVIDER = "console";
process.env.MALWARE_SCANNER = "none";
process.env.E2E_DISABLE_RATE_LIMITS = "";
process.env.CRON_SECRET = "test-cron-secret";
Object.assign(process.env, { NODE_ENV: "test" });
