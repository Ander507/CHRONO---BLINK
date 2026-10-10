import "server-only";
import { headers } from "next/headers";
import { db, type Tx } from "@/server/db";
import { auditLogs } from "@/server/db/schema";
import { clientIp } from "@/server/http";

export async function audit(
  actorId: string | null,
  action: string,
  targetType: string,
  targetId: string | number | null,
  details: Record<string, unknown> = {},
  tx?: Tx,
) {
  let ip: string | null = null;
  try {
    ip = clientIp(await headers());
  } catch {
    /* outside a request (scripts) */
  }
  await (tx ?? db).insert(auditLogs).values({
    actorId,
    action,
    targetType,
    targetId: targetId == null ? null : String(targetId),
    details,
    ip,
  });
}
