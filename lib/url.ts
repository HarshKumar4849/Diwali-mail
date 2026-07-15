import { NextRequest } from "next/server";

export function getAppUrl(req: NextRequest): string {
  const host = req.headers.get("host");
  if (host) {
    const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
    return `${protocol}://${host}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}
