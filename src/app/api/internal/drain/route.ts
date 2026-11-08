import { NextRequest, NextResponse } from "next/server";
import { drainOutbox } from "@/modules/inventory/service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-internal-secret");
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const result = await drainOutbox();
  return NextResponse.json(result);
}
