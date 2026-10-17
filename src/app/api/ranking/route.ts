import { rankingApi } from "@/lib/ranking/server";

// Livro da platina (spec 8.5): top 20 público; gravação com bilhete.
export const dynamic = "force-dynamic";

export async function GET() {
  return rankingApi().listTop();
}

export async function POST(request: Request) {
  return rankingApi().submit(request);
}
