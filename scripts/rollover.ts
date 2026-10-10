/** Triggers the daily maintenance job on a running app (challenge generation, retention). */
import "dotenv/config";

const url = `${process.env.APP_URL ?? "http://localhost:3000"}/api/cron/daily`;
const res = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` } });
console.log(res.status, await res.text());
if (!res.ok) process.exitCode = 1;
