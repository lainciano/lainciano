import type * as THREE from "three";
import type { InteractiveObject } from "../layers/types";

/**
 * Brilho pulsante do objeto mirado e ao alcance (protótipo 7, linha 2625): o `emissive` dos materiais do próprio
 * objeto sobe e desce com `sin(t · 5,5)`. Sem custo por quadro: os materiais do objeto são levantados UMA vez (na
 * 1ª vez que ele fica mirado), o emissivo de base é guardado e só ele é escrito (`setRGB`, sem alocar, sem
 * recriar material nem mudar de programa: o emissivo é um uniform). Material compartilhado com outro objeto fica
 * de fora (acenderia o vizinho). Movimento reduzido: realce fixo, sem pulso.
 */
export const GLOW = {
  /** Realce somado quando o pulso está no mínimo (RGB linear, como o protótipo). */
  base: [0.035, 0.022, 0.01],
  /** Quanto o pulso acrescenta no máximo. */
  pulse: [0.07, 0.05, 0.025],
  /** Rad/s do seno. */
  rate: 5.5,
} as const;

type WithEmissive = THREE.Material & { emissive: THREE.Color };
type Lit = { mat: WithEmissive; r: number; g: number; b: number };

const hasEmissive = (m: THREE.Material): m is WithEmissive => (m as Partial<WithEmissive>).emissive !== undefined && (m as WithEmissive).emissive.isColor === true;

export type Glow = {
  /** Objeto que brilha agora (null apaga). */
  set(id: string | null): void;
  update(t: number): void;
  readonly current: string | null;
  /** Quantos materiais o objeto acende (0 = só materiais sem emissivo ou compartilhados). */
  materialCount(id: string): number;
  dispose(): void;
};

export function createGlow(objects: readonly InteractiveObject[], reduced: () => boolean): Glow {
  const lit = new Map<string, Lit[]>();
  let shared: Set<THREE.Material> | null = null;

  /** Materiais usados por mais de um objeto (cálculo único, só quando alguém mira). */
  const sharedMaterials = (): Set<THREE.Material> => {
    if (shared) return shared;
    const owner = new Map<THREE.Material, string>();
    const out = new Set<THREE.Material>();
    for (const o of objects) {
      for (const root of o.roots) {
        root.traverse((n) => {
          const mesh = n as THREE.Mesh;
          if (!mesh.isMesh) return;
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            const prev = owner.get(m);
            if (prev !== undefined && prev !== o.id) out.add(m);
            else owner.set(m, o.id);
          }
        });
      }
    }
    return (shared = out);
  };

  const litOf = (id: string): Lit[] => {
    const cached = lit.get(id);
    if (cached) return cached;
    const list: Lit[] = [];
    const o = objects.find((x) => x.id === id);
    if (o) {
      const skip = sharedMaterials();
      const seen = new Set<THREE.Material>();
      for (const root of o.roots) {
        root.traverse((n) => {
          const mesh = n as THREE.Mesh;
          if (!mesh.isMesh) return;
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            if (seen.has(m) || skip.has(m) || !hasEmissive(m)) continue;
            seen.add(m);
            list.push({ mat: m, r: m.emissive.r, g: m.emissive.g, b: m.emissive.b });
          }
        });
      }
    }
    lit.set(id, list);
    return list;
  };

  const restore = (id: string) => {
    for (const l of litOf(id)) l.mat.emissive.setRGB(l.r, l.g, l.b);
  };

  let current: string | null = null;
  return {
    set(id) {
      if (id === current) return;
      if (current !== null) restore(current);
      current = id;
    },
    update(t) {
      if (current === null) return;
      const k = reduced() ? 0.5 : 0.5 + 0.5 * Math.sin(t * GLOW.rate);
      const dr = GLOW.base[0] + GLOW.pulse[0] * k;
      const dg = GLOW.base[1] + GLOW.pulse[1] * k;
      const db = GLOW.base[2] + GLOW.pulse[2] * k;
      for (const l of litOf(current)) l.mat.emissive.setRGB(l.r + dr, l.g + dg, l.b + db);
    },
    get current() {
      return current;
    },
    materialCount: (id) => litOf(id).length,
    dispose() {
      if (current !== null) restore(current);
      current = null;
      lit.clear();
    },
  };
}
