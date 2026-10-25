import { getPaymentProvider } from "@/adapters";
import { getDb } from "@/db/client";
import { settlePayment } from "@/lib/payments";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const provider = getPaymentProvider();
  if (!provider.parseWebhook) return Response.json({ error: "not_supported" }, { status: 404 });
  let event;
  try {
    event = await provider.parseWebhook(req); // verifies the signature; throws if invalid
  } catch {
    return Response.json({ error: "invalid_signature" }, { status: 400 });
  }
  if (event) await settlePayment(await getDb(), event.paymentId, event.status, event.providerRef);
  return Response.json({ received: true });
}
