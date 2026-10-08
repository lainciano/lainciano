import { describe, expect, it } from "vitest";
import { AFTER_PORTAL_MS, autoCollapseAction } from "@/rooms/ruina/autoCollapse";

describe("autoCollapseAction (a arena não cai atrás do Portal)", () => {
  it("visível ≥ 60% e sem Portal: agenda a queda", () => {
    expect(autoCollapseAction({ ratio: 0.7, portalOpen: false })).toBe("schedule");
  });
  it("visível ≥ 60% com o Portal aberto: espera o Portal fechar", () => {
    expect(autoCollapseAction({ ratio: 1, portalOpen: true })).toBe("wait-portal");
  });
  it("menos de 60% visível: nada", () => {
    expect(autoCollapseAction({ ratio: 0.59, portalOpen: false })).toBe("none");
    expect(autoCollapseAction({ ratio: 0.59, portalOpen: true })).toBe("none");
  });
  it("depois do Portal, dá tempo de ver o nome (e o sino terminar o ataque) antes de cair", () => {
    expect(AFTER_PORTAL_MS).toBeGreaterThanOrEqual(1200);
  });
});
