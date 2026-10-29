import { describe, expect, it } from "vitest";
import type { Line } from "../layers/types";
import { createLineQueue, tierOf } from "./lineQueue";

const story = (text: string): Line => ({ text, kind: "speech" });
const hint = (text: string): Line => ({ text, kind: "speech", hint: true });
const sys = (text: string): Line => ({ text, kind: "system" });
/** Toda fala dura 4 s nos testes. */
const q = () => createLineQueue(() => 4);

describe("fila de falas com prioridade", () => {
  it("tiers: história (fala e som) > dica > sistema", () => {
    expect(tierOf(story("a"))).toBeGreaterThan(tierOf(hint("b")));
    expect(tierOf({ text: "som", kind: "sound" })).toBe(tierOf(story("a")));
    expect(tierOf(hint("b"))).toBeGreaterThan(tierOf(sys("c")));
  });

  it("sem fala na tela, qualquer uma aparece na hora", () => {
    const f = q();
    expect(f.offer(sys("nada ao alcance"), 0)).toEqual(sys("nada ao alcance"));
    expect(f.current()).toEqual(sys("nada ao alcance"));
  });

  it("dica de sistema não corta fala de história: espera e aparece quando a fala acaba (se ainda for recente)", () => {
    const f = q();
    f.offer(story("trancada."), 0);
    expect(f.offer(sys("segure E para forçar a porta."), 2)).toBeNull();
    expect(f.current()).toEqual(story("trancada."));
    expect(f.expire(4)).toEqual(sys("segure E para forçar a porta."));
  });

  it("aviso de sistema velho cai: se a fala demorou, o aviso não aparece fora de hora", () => {
    const f = q();
    f.offer(story("longa"), 0);
    f.offer(sys("nada ao alcance"), 0.5);
    expect(f.expire(9)).toBeNull();
  });

  it("pista não corta fala de história: entra na fila e aparece inteira depois", () => {
    const f = q();
    f.offer(story("a chave gira."), 0);
    expect(f.offer(hint("o bilhete fala de um armário."), 2)).toBeNull();
    expect(f.expire(4)).toEqual(hint("o bilhete fala de um armário."));
    // pista na fila não envelhece como o aviso de sistema
    const g = q();
    g.offer(story("longa"), 0);
    g.offer(hint("pista"), 0.5);
    expect(g.expire(30)).toEqual(hint("pista"));
  });

  it("fala de história corta a pista (o jogador agiu), e a pista volta para a fila se mal tinha começado", () => {
    const f = q();
    f.offer(hint("pista 1"), 0);
    expect(f.offer(story("cabides e naftalina."), 1)).toEqual(story("cabides e naftalina."));
    expect(f.expire(5)).toEqual(hint("pista 1"));
    // cortada já perto do fim: não repete
    const g = q();
    g.offer(hint("pista 1"), 0);
    g.offer(story("fala"), 3.5);
    expect(g.expire(7.5)).toBeNull();
  });

  it("história corta história; pista corta pista; sistema corta sistema (a mais nova vale)", () => {
    const f = q();
    f.offer(story("a"), 0);
    expect(f.offer(story("b"), 1)).toEqual(story("b"));
    f.clear();
    f.offer(hint("p1"), 0);
    expect(f.offer(hint("p2"), 1)).toEqual(hint("p2"));
    f.clear();
    f.offer(sys("s1"), 0);
    expect(f.offer(sys("s2"), 1)).toEqual(sys("s2"));
  });

  it("depois do tempo da fala, a próxima entra direto (sem fila)", () => {
    const f = q();
    f.offer(story("a"), 0);
    expect(f.offer(sys("s"), 4.01)).toEqual(sys("s"));
  });

  it("fila curta: no máximo 3 pistas e 1 aviso de sistema esperando; na saída, pista antes de sistema", () => {
    const f = q();
    f.offer(story("fala"), 0);
    for (const n of [1, 2, 3, 4]) f.offer(hint(`p${n}`), 0.1 * n);
    f.offer(sys("s1"), 0.5);
    f.offer(sys("s2"), 0.6);
    const out: (string | undefined)[] = [];
    let t = 4;
    for (let i = 0; i < 6; i++) {
      out.push(f.expire(t)?.text);
      t += 4;
    }
    // a pista mais velha caiu (fila de 3); o aviso de sistema mais recente substitui o anterior e já envelheceu
    expect(out).toEqual(["p2", "p3", "p4", undefined, undefined, undefined]);
  });

  it("expire antes da hora não troca a fala (temporizador atrasado ou duplicado)", () => {
    const f = q();
    f.offer(story("a"), 0);
    f.offer(hint("p"), 1);
    expect(f.expire(2)).toEqual(story("a"));
    expect(f.current()).toEqual(story("a"));
  });

  it("clear esvazia tudo", () => {
    const f = q();
    f.offer(story("a"), 0);
    f.offer(hint("p"), 1);
    f.clear();
    expect(f.current()).toBeNull();
    expect(f.expire(10)).toBeNull();
  });
});
