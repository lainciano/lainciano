import { describe, expect, it } from "vitest";
import { isActivePath } from "@/interaction/hud/nav-state";

describe("isActivePath", () => {
  it("raiz só é ativa na raiz", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/work", "/")).toBe(false);
  });
  it("seção ativa nela e nas filhas", () => {
    expect(isActivePath("/work", "/work")).toBe(true);
    expect(isActivePath("/work/coletiva", "/work")).toBe(true);
  });
  it("prefixo parecido não conta", () => expect(isActivePath("/workshop", "/work")).toBe(false));
});
