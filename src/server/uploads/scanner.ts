import "server-only";
import net from "node:net";
import { env } from "@/server/env";

export type ScanResult = { status: "clean" | "infected" | "error"; details: string };

/**
 * Malware scanning integration point. With MALWARE_SCANNER=clamav the archive
 * is streamed to clamd (INSTREAM). With "none" there is no scanner, and the
 * upload policy restricts uploads to trusted developers / admins.
 */
export async function scanBuffer(buf: Buffer): Promise<ScanResult> {
  if (env.MALWARE_SCANNER !== "clamav") return { status: "error", details: "No malware scanner configured" };
  return new Promise((resolve) => {
    const socket = net.connect(env.CLAMAV_PORT, env.CLAMAV_HOST);
    let reply = "";
    const done = (r: ScanResult) => {
      socket.destroy();
      resolve(r);
    };
    socket.setTimeout(60_000, () => done({ status: "error", details: "clamd timeout" }));
    socket.on("error", (e) => done({ status: "error", details: `clamd unreachable: ${e.message}` }));
    socket.on("data", (d) => (reply += d.toString()));
    socket.on("end", () => {
      const text = reply.replace(/\0/g, "").trim();
      if (/: OK$/.test(text)) done({ status: "clean", details: text });
      else if (/FOUND$/.test(text)) done({ status: "infected", details: text });
      else done({ status: "error", details: text || "empty clamd reply" });
    });
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      const chunk = 64 * 1024;
      for (let i = 0; i < buf.length; i += chunk) {
        const part = buf.subarray(i, i + chunk);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(part.length);
        socket.write(len);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}
