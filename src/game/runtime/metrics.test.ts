import { describe, expect, it } from "vitest";
import { createFrameMetrics } from "./metrics";

describe("createFrameMetrics", () => {
  it("vazio dá 0", () => {
    const m = createFrameMetrics();
    expect(m.p50()).toBe(0);
    expect(m.p95()).toBe(0);
  });

  it("100 quadros de 16 ms e 5 de 50 ms: p50 16, p95 50", () => {
    const m = createFrameMetrics();
    for (let i = 0; i < 100; i++) m.push(16);
    for (let i = 0; i < 5; i++) m.push(50);
    expect(m.p50()).toBe(16);
    expect(m.p95()).toBe(50);
  });

  it("a ordem de chegada não importa", () => {
    const m = createFrameMetrics();
    for (let i = 0; i < 105; i++) m.push(i % 21 === 0 ? 50 : 16);
    expect(m.p50()).toBe(16);
    expect(m.p95()).toBe(50);
  });

  it("janela deslizante: só as últimas `size` amostras contam", () => {
    const m = createFrameMetrics(10);
    for (let i = 0; i < 10; i++) m.push(100);
    for (let i = 0; i < 10; i++) m.push(8);
    expect(m.p50()).toBe(8);
    expect(m.p95()).toBe(8);
  });

  it("ignora amostra negativa, zero ou não finita", () => {
    const m = createFrameMetrics();
    m.push(-5);
    m.push(0);
    m.push(Number.NaN);
    m.push(Number.POSITIVE_INFINITY);
    expect(m.p50()).toBe(0);
    m.push(16);
    expect(m.p50()).toBe(16);
  });
});
