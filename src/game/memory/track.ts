import type { MemoryV1 } from "./schema";

/** Funções puras que derivam eventos da memória (nada aqui toca storage, DOM ou relógio). */

/** Parado olhando um objeto por mais que isto é uma hesitação. */
export const HESITATE_MS = 8000;
/** Parado há tanto tempo (sem nenhum evento), voltar a mexer conta como outra visita. */
export const VISIT_GAP_MS = 30 * 60_000;

/**
 * Visita nova = reabrir depois de fechar a aba (sem a marca da sessão) OU voltar depois de ≥ 30 min parado.
 * Recarregar a página NÃO conta: a marca de sessão sobrevive ao reload. Memória vazia (nenhuma visita) é sempre nova.
 */
export function isNewVisit(mem: MemoryV1, now: number, sessionFlag: boolean): boolean {
  if (mem.visits === 0) return true;
  if (!sessionFlag) return true;
  return now - mem.lastAt >= VISIT_GAP_MS;
}

/** "HH:MM" na hora local. Só isto sai da data: nunca o fuso nem o timestamp em texto. */
export function formatArrival(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(date.getHours())}:${p(date.getMinutes())}`;
}

/** Madrugada: de 00:00 até antes das 05:00, hora local. */
export const isNight = (date: Date): boolean => date.getHours() < 5;

/** Soma `ms` a `id`, limitando o mapa a `max` chaves (id novo além do teto é ignorado). */
export function addToMap(map: Record<string, number>, id: string, ms: number, max: number): Record<string, number> {
  if (!(id in map) && Object.keys(map).length >= max) return map;
  return { ...map, [id]: (map[id] ?? 0) + ms };
}

/** Acrescenta sem repetir, mantendo as `max` primeiras. */
export function addUnique(list: string[], id: string, max: number): string[] {
  return list.includes(id) || list.length >= max ? list : [...list, id];
}

/** Acrescenta no fim e mantém as `max` últimas. */
export function pushLast<T>(list: T[], item: T, max: number): T[] {
  const next = [...list, item];
  return next.length > max ? next.slice(next.length - max) : next;
}

export type Hesitation = { id: string; ms: number };

/**
 * Hesitação: parado (mesma posição) mirando o mesmo objeto por mais de `HESITATE_MS`. Alimentado por quadro; devolve a
 * hesitação quando a espera TERMINA (mudou o alvo, andou, ou `active` caiu: painel aberto, pausado, fechando).
 * Esperas de até 8 s não geram nada.
 */
export type HesitationTracker = {
  update(dtMs: number, target: string | null, pos: { x: number; z: number }, active: boolean): Hesitation | null;
  /** Fecha a espera em curso (fim da sessão). */
  flush(): Hesitation | null;
};

const STILL_EPS = 0.05; // metros: balanço de câmera e micro-ajuste não são "andar"

export function createHesitationTracker(thresholdMs: number = HESITATE_MS): HesitationTracker {
  let id: string | null = null;
  let ms = 0;
  let at = { x: 0, z: 0 };

  const finish = (): Hesitation | null => {
    const out = id !== null && ms > thresholdMs ? { id, ms: Math.round(ms) } : null;
    id = null;
    ms = 0;
    return out;
  };

  return {
    update(dtMs, target, pos, active) {
      if (!active || target === null) {
        const out = finish();
        return out;
      }
      const moved = Math.hypot(pos.x - at.x, pos.z - at.z) > STILL_EPS;
      if (target !== id || moved) {
        const out = finish();
        id = target;
        at = { x: pos.x, z: pos.z };
        ms = 0;
        return out;
      }
      ms += Math.max(0, dtMs);
      return null;
    },
    flush: finish,
  };
}

/** Acumula tempo por lugar e o entrega em blocos (poucas gravações): ao mudar de lugar ou a cada `chunkMs`. */
export type PlaceClock = {
  tick(dtMs: number, place: string | null): { id: string; ms: number } | null;
  flush(): { id: string; ms: number } | null;
};

export function createPlaceClock(chunkMs = 15_000): PlaceClock {
  let id: string | null = null;
  let ms = 0;
  const take = (): { id: string; ms: number } | null => {
    const out = id !== null && ms >= 1000 ? { id, ms: Math.round(ms) } : null;
    ms = 0;
    return out;
  };
  return {
    tick(dtMs, place) {
      let out: { id: string; ms: number } | null = null;
      if (place !== id) {
        out = take();
        id = place;
      }
      if (id !== null) ms += Math.max(0, dtMs);
      return out ?? (ms >= chunkMs ? take() : null);
    },
    flush: take,
  };
}
