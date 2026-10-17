import { rankingApi } from "@/lib/ranking/server";

// Bilhete da run (spec 8.5): chamado pelo navegador no início da run.
export async function POST(request: Request) {
  return rankingApi().createRun(request);
}
