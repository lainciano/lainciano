/** Linha do livro. Só o apelido, o tempo e a data ficam públicos (spec 8.5); o runId é interno. */
export type RankingEntry = { runId: string; nickname: string; elapsedMs: number; createdAt: number };
export type RecordResult = { ok: true; position: number } | { ok: false; error: "duplicate" };

/**
 * Loja do livro. Fase 6: memória. Fase 7: Upstash (ZADD ranking:v1 elapsedMs "<createdAt 13 díg.>:<runId>" — D5).
 * Contrato (a Fase 7 deve manter): `record` recusa um runId já gravado alguma vez; `remove` apaga só a linha
 * e mantém o runId queimado (tombstone), para o mesmo envio assinado não voltar ao livro após a moderação.
 */
export interface RankingStore {
  record(entry: RankingEntry): Promise<RecordResult>;
  top(limit: number): Promise<RankingEntry[]>;
  remove(runId: string): Promise<boolean>;
}

/** Ordem do livro: menor tempo; empate, envio mais antigo; depois runId (estável). */
export function compareEntries(a: RankingEntry, b: RankingEntry): number {
  return a.elapsedMs - b.elapsedMs || a.createdAt - b.createdAt || (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0);
}

export function createMemoryStore(): RankingStore {
  const entries = new Map<string, RankingEntry>();
  const recorded = new Set<string>(); // tombstone: sobrevive ao remove
  const sorted = () => [...entries.values()].sort(compareEntries);
  return {
    async record(entry) {
      if (recorded.has(entry.runId)) return { ok: false, error: "duplicate" };
      recorded.add(entry.runId);
      entries.set(entry.runId, entry);
      return { ok: true, position: sorted().findIndex((candidate) => candidate.runId === entry.runId) + 1 };
    },
    async top(limit) {
      return sorted().slice(0, limit);
    },
    async remove(runId) {
      return entries.delete(runId);
    },
  };
}
