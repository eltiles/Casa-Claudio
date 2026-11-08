import { apiUser } from "@/lib/authz";
import { listKitchenOrders } from "@/modules/orders/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, status } = await apiUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
      status,
      headers: { "content-type": "application/json" },
    });
  }
  const encoder = new TextEncoder();
  let interval: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = async () => {
        try {
          const orders = await listKitchenOrders(user.establishmentId);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ at: new Date().toISOString(), orders })}\n\n`)
          );
        } catch {
          controller.enqueue(encoder.encode(`event: error\ndata: "db-unavailable"\n\n`));
        }
      };
      void push();
      interval = setInterval(() => {
        void push();
      }, 2000);
    },
    cancel() {
      if (interval) clearInterval(interval);
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
