import { databaseIsReady } from "@/db";
import { privateFileStoreIsReady } from "@/lib/files/local-store";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const healthy = databaseIsReady() && (await privateFileStoreIsReady());
  return Response.json(
    { status: healthy ? "ok" : "unhealthy" },
    {
      status: healthy ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
