import { rankingApi } from "@/lib/ranking/server";

// Moderação (Fase 7): lista o top com runId para o DELETE /api/ranking/<runId>. Authorization: Bearer <ADMIN_TOKEN>.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return rankingApi().listForModeration(request);
}
