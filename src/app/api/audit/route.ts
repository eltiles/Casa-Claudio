import { NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { user, status } = await apiUser(["ADMIN", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 200);
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 500),
    include: { actor: true },
  });
  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      createdAt: l.createdAt.toISOString(),
      actor: l.actor ? `${l.actor.name} (${l.actor.email})` : "sistema",
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      after: l.after,
    })),
  });
}
