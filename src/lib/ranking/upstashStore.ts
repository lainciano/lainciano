import { z } from "zod";
import { NICKNAME } from "./validate";
import type { RankingEntry, RankingStore, RecordResult } from "./store";

/**
 * Só o que a loja usa do cliente. `eval` aqui é o comando EVAL do Redis (Lua rodando no servidor,
 * atômico), não o eval() do JavaScript — nenhum código do site é avaliado.
 */
export interface RankingRedis {
  eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>;
  zrange(key: string, start: number, stop: number, options: { withScores: true }): Promise<unknown[]>;
}

export const KEY_PREFIX = "ranking:v1";

const uuid = z.uuid();

/**
 * Membro do ZSET: "<createdAt 13 dígitos>:<runId>:<apelido>"; a pontuação é o elapsedMs. O apelido dentro do membro
 * faz o `top` custar UM comando (ZRANGE WITHSCORES) em vez de um EVAL com N leituras. O runId é único, então o apelido
 * nunca decide a ordem, que continua a de `compareEntries` (tempo, createdAt, runId).
 */
const member = (entry: RankingEntry) => `${String(entry.createdAt).padStart(13, "0")}:${entry.runId}:${entry.nickname}`;
const MEMBER = /^(\d{13}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([A-Za-z0-9_-]+)$/i;

/**
 * Scripts Lua. O gate vive em uma chave própria e sobrevive ao remove: é a lápide de D5 (o runId removido nunca
 * volta ao livro). O gate é gravado por último, para uma falha no meio do script não queimar a run sem linha.
 * Posição = ZRANK + 1.
 */
export const SCRIPTS = {
  // KEYS: zset, gate, holder · ARGV: membro, elapsedMs → posição, ou -1 se o runId já foi gravado
  record: `
if redis.call('EXISTS', KEYS[2]) == 1 then return -1 end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1])
redis.call('SET', KEYS[3], ARGV[1])
redis.call('SET', KEYS[2], '1')
return redis.call('ZRANK', KEYS[1], ARGV[1]) + 1`,
  // KEYS: zset, holder → 1 se apagou a linha (pelo membro guardado), 0 se não existia. O gate fica.
  remove: `
local m = redis.call('GET', KEYS[2])
if not m then return 0 end
redis.call('ZREM', KEYS[1], m)
redis.call('DEL', KEYS[2])
return 1`,
} as const;

/** Resposta do `record`: -1 (duplicado) ou posição inteira ≥ 1. Qualquer outra coisa é falha, nunca sucesso. */
function parsePosition(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw === 0 || raw < -1) throw new Error("resposta inválida do Redis");
  return raw;
}

/** Loja do livro no Upstash Redis. runId inválido nunca vira chave (as chaves levam o runId). */
export function createUpstashStore(redis: RankingRedis, prefix: string = KEY_PREFIX): RankingStore {
  return {
    async record(entry: RankingEntry): Promise<RecordResult> {
      if (!uuid.safeParse(entry.runId).success) return { ok: false, error: "duplicate" };
      if (!NICKNAME.pattern.test(entry.nickname) || !Number.isInteger(entry.elapsedMs) || !Number.isInteger(entry.createdAt)) {
        throw new Error("entrada inválida");
      }
      const position = parsePosition(
        await redis.eval(
          SCRIPTS.record,
          [prefix, `${prefix}:gate:${entry.runId}`, `${prefix}:${entry.runId}`],
          [member(entry), entry.elapsedMs],
        ),
      );
      return position < 0 ? { ok: false, error: "duplicate" } : { ok: true, position };
    },

    async top(limit) {
      if (!Number.isInteger(limit) || limit < 1) return []; // ZRANGE 0 -1 devolveria o ZSET inteiro
      const flat = await redis.zrange(prefix, 0, limit - 1, { withScores: true });
      const entries: RankingEntry[] = [];
      for (let i = 0; i + 1 < flat.length; i += 2) {
        const parts = MEMBER.exec(String(flat[i]));
        if (!parts) continue; // membro estranho não derruba o livro
        entries.push({
          runId: parts[2],
          nickname: parts[3],
          elapsedMs: Number(flat[i + 1]),
          createdAt: Number(parts[1]),
        });
      }
      return entries;
    },

    async remove(runId) {
      if (!uuid.safeParse(runId).success) return false;
      return Number(await redis.eval(SCRIPTS.remove, [prefix, `${prefix}:${runId}`], [])) === 1;
    },
  };
}
