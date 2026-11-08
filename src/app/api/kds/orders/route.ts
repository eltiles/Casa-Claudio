import { NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { listKitchenOrders } from "@/modules/orders/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, status } = await apiUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const orders = await listKitchenOrders(user.establishmentId);
  return NextResponse.json({ orders });
}
