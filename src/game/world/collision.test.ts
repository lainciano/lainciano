import { describe, expect, it } from "vitest";
import { moveWithCollision, segmentClear, type Box2 } from "./collision";

const R = 0.22;
const room: Box2 = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
// Caixa de 1 m por 1 m centrada em (2, 0).
const crate: Box2 = { minX: 1.5, maxX: 2.5, minZ: -0.5, maxZ: 0.5 };

describe("moveWithCollision", () => {
  it("anda livre quando nada atrapalha", () => {
    const p = moveWithCollision({ x: 0, z: 0 }, { x: 0.5, z: 0.3 }, R, [crate], room);
    expect(p.x).toBeCloseTo(0.5);
    expect(p.z).toBeCloseTo(0.3);
  });

  it("para contra a caixa e desliza no eixo livre", () => {
    const p = moveWithCollision({ x: 1.2, z: 0 }, { x: 0.5, z: 0.4 }, R, [crate], room);
    expect(p.x).toBeLessThanOrEqual(crate.minX - R + 1e-9);
    expect(p.x).toBeGreaterThan(1.2 - 1e-9);
    expect(p.z).toBeCloseTo(0.4);
  });

  it("desliza no X quando o Z está bloqueado", () => {
    const p = moveWithCollision({ x: 1.6, z: -0.8 }, { x: 0.2, z: 0.5 }, R, [crate], room);
    expect(p.x).toBeCloseTo(1.8);
    expect(p.z).toBeLessThanOrEqual(crate.minZ - R + 1e-9);
    expect(p.z).toBeGreaterThan(-0.8 - 1e-9);
  });

  it("bounds segura o jogador dentro da sala, respeitando o raio", () => {
    const p = moveWithCollision({ x: 4.7, z: 4.7 }, { x: 3, z: 3 }, R, [], room);
    expect(p.x).toBeCloseTo(room.maxX - R);
    expect(p.z).toBeCloseTo(room.maxZ - R);
    const q = moveWithCollision({ x: -4.7, z: 0 }, { x: -3, z: 0 }, R, [], room);
    expect(q.x).toBeCloseTo(room.minX + R);
  });

  it("respeita o raio na quina (distância ao canto menor que R bloqueia)", () => {
    // Canto (1.5, -0.5). Ponto (1.5 - 0.17, -0.5 - 0.17) está a ~0,24 do canto: livre.
    const free = moveWithCollision({ x: 1.0, z: -1.0 }, { x: 0.33, z: 0.33 }, R, [crate], room);
    expect(free.x).toBeCloseTo(1.33);
    expect(free.z).toBeCloseTo(-0.67);
    // Ponto a ~0,14 do canto: colide, então não pode ficar ali.
    const blocked = moveWithCollision({ x: 1.0, z: -1.0 }, { x: 0.4, z: 0.4 }, R, [crate], room);
    const dx = Math.max(crate.minX - blocked.x, 0, blocked.x - crate.maxX);
    const dz = Math.max(crate.minZ - blocked.z, 0, blocked.z - crate.maxZ);
    expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(R - 1e-9);
  });

  it("não atravessa a caixa com um passo grande", () => {
    const p = moveWithCollision({ x: 0, z: 0 }, { x: 4, z: 0 }, R, [crate], room);
    expect(p.x).toBeLessThanOrEqual(crate.minX - R + 1e-9);
  });
});

describe("segmentClear", () => {
  it("livre em campo aberto", () => {
    expect(segmentClear({ x: 0, z: -2 }, { x: 4, z: -2 }, R, [crate], room)).toBe(true);
  });
  it("bloqueado atravessando a caixa", () => {
    expect(segmentClear({ x: 0, z: 0 }, { x: 4, z: 0 }, R, [crate], room)).toBe(false);
  });
  it("bloqueado quando raspa na caixa dentro do raio", () => {
    expect(segmentClear({ x: 0, z: 0.6 }, { x: 4, z: 0.6 }, R, [crate], room)).toBe(false);
  });
  it("bloqueado se sai da sala", () => {
    expect(segmentClear({ x: 0, z: 0 }, { x: 9, z: 0 }, R, [], room)).toBe(false);
  });
});
