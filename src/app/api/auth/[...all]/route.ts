import { auth } from "@/adapters";

export const dynamic = "force-dynamic";

export const GET = (req: Request) => auth.handler(req);
export const POST = (req: Request) => auth.handler(req);
