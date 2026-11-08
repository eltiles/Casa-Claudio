import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

export function middleware(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (req.nextUrl.pathname.startsWith("/api/auth") && !rateLimit(`auth:${ip}`, 10, 60_000)) {
    return new NextResponse("Too Many Requests", { status: 429 });
  }
  if (req.nextUrl.pathname === "/api/sales" && req.method === "POST" && !rateLimit(`sales:${ip}`, 30, 60_000)) {
    return new NextResponse("Too Many Requests", { status: 429 });
  }
  if (req.nextUrl.pathname.startsWith("/api/internal/") && req.method === "POST" && !rateLimit(`internal:${ip}`, 6, 60_000)) {
    return new NextResponse("Too Many Requests", { status: 429 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/auth/:path*", "/api/sales", "/api/internal/:path*"],
};
