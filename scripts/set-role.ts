/**
 * Grants a role to an existing user (e.g. the first administrator).
 *   pnpm user:role you@example.com admin
 * Roles: user | developer | moderator | admin. Writes an audit log entry.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ROLES, auditLogs, user, type Role } from "../src/server/db/schema";

const [email, role] = process.argv.slice(2);
if (!email || !role || !(ROLES as readonly string[]).includes(role)) {
  console.error(`usage: pnpm user:role <email> <${ROLES.join("|")}>`);
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const db = drizzle(sql);
const [u] = await db.update(user).set({ role: role as Role }).where(eq(user.email, email.toLowerCase())).returning({ id: user.id });
if (!u) {
  console.error(`No user with email ${email}. Register first.`);
  process.exitCode = 1;
} else {
  await db.insert(auditLogs).values({ actorId: null, action: "user.role", targetType: "user", targetId: u.id, details: { role, via: "cli" } });
  console.log(`[role] ${email} is now ${role}`);
}
await sql.end();
