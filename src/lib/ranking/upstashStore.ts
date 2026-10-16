import { z } from "zod";
import type { RankingEntry, RankingStore, RecordResult } from "./store";

/**
 * Só o que a loja usa do cliente. `eval` aqui é o comando EVAL do Redis (Lua rodando no servidor,
 * atômico), não o eval() do JavaScript — nenhum código do site é avaliado.
 */
export interface LuaRedis {
  eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>;
}

export const KEY_PREFIX = "ranking:v1";

const uuid = z.uuid();

/** Membro do ZSET: createdAt com 13 dígitos + ":" + runId. Empate de tempo desempata pela ordem lexicográfica. */
const member = (createdAt: number, runId: string) => `${String(createdAt).padStart(13, "0")}:${runId}`;

/**
 * Scripts Lua. O gate (`SET NX`) sobrevive ao remove: é a lápide de D5 — o runId removido nunca volta ao livro.
 * Posição = ZRANK + 1 (mesma ordem de `compareEntries`: tempo, createdAt, runId).
 */
export const SCRIPTS = {
  // KEYS: zset, gate, hash · ARGV: membro, elapsedMs, apelido, createdAt → posição, ou -1 se o runId já foi gravado
  record: `
if redis.call('SET', KEYS[2], '1', 'NX') == false then return -1 end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1])
redis.call('HSET', KEYS[3], 'nickname', ARGV[3], 'elapsedMs', ARGV[2], 'createdAt', ARGV[4])
return redis.call('ZRANK', KEYS[1], ARGV[1]) + 1`,
  // KEYS: zset · ARGV: limite, prefixo dos hashes → runId, apelido, elapsedMs, createdAt (em sequência)
  top: `
local members = redis.call('ZRANGE', KEYS[1], 0, tonumber(ARGV[1]) - 1)
local out = {}
for _, m in ipairs(members) do
  local runId = string.sub(m, 15)
  local h = redis.call('HMGET', ARGV[2] .. runId, 'nickname', 'elapsedMs', 'createdAt')
  if h[1] then
    out[#out + 1] = runId
    out[#out + 1] = h[1]
    out[#out + 1] = h[2]
    out[#out + 1] = h[3]
  end
end
return out`,
  // KEYS: zset, hash · ARGV: runId → 1 se apagou a linha, 0 se não existia. O gate fica.
  remove: `
local created = redis.call('HGET', KEYS[2], 'createdAt')
if not created then return 0 end
redis.call('ZREM', KEYS[1], string.format('%013d', tonumber(created)) .. ':' .. ARGV[1])
redis.call('DEL', KEYS[2])
return 1`,
} as const;

/** Loja do livro no Upstash Redis. runId inválido nunca vira chave (as chaves levam o runId). */
export function createUpstashStore(redis: LuaRedis, prefix: string = KEY_PREFIX): RankingStore {
  const hashKey = (runId: string) => `${prefix}:${runId}`;
  return {
    async record(entry: RankingEntry): Promise<RecordResult> {
      if (!uuid.safeParse(entry.runId).success) return { ok: false, error: "duplicate" };
      const position = Number(
        await redis.eval(
          SCRIPTS.record,
          [prefix, `${prefix}:gate:${entry.runId}`, hashKey(entry.runId)],
          [member(entry.createdAt, entry.runId), entry.elapsedMs, entry.nickname, entry.createdAt],
        ),
      );
      return position < 0 ? { ok: false, error: "duplicate" } : { ok: true, position };
    },

    async top(limit) {
      const flat = (await redis.eval(SCRIPTS.top, [prefix], [limit, `${prefix}:`])) as unknown[];
      const entries: RankingEntry[] = [];
      for (let i = 0; i + 3 < flat.length; i += 4) {
        entries.push({
          runId: String(flat[i]),
          nickname: String(flat[i + 1]), // um apelido "1234" pode voltar como número
          elapsedMs: Number(flat[i + 2]),
          createdAt: Number(flat[i + 3]),
        });
      }
      return entries;
    },

    async remove(runId) {
      if (!uuid.safeParse(runId).success) return false;
      return Number(await redis.eval(SCRIPTS.remove, [prefix, hashKey(runId)], [runId])) === 1;
    },
  };
}
