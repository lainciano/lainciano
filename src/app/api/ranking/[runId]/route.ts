import { rankingApi } from "@/lib/ranking/server";

// Moderação manual (spec 8.5): Authorization: Bearer <ADMIN_TOKEN>.
export async function DELETE(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return rankingApi().remove(request, runId);
}
