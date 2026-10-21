import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { LIMIAR_BOOT_SCRIPT, READING_BOOT_SCRIPT, STORAGE_KEYS } from "@/interaction/boot";

type Env = {
  stored?: Record<string, string>;
  storageThrows?: boolean;
  ua?: string;
  reduced?: boolean;
  webdriver?: boolean;
  noShowModal?: boolean;
  reading?: "on" | "off";
  setItemThrows?: boolean;
};

function run(script: string, env: Env) {
  const opened = { value: false };
  const html = { dataset: (env.reading ? { reading: env.reading } : {}) as Record<string, string> };
  const stored: Record<string, string> = { ...env.stored };
  const context = {
    localStorage: {
      getItem: (key: string) => {
        if (env.storageThrows) throw new Error("blocked");
        return stored[key] ?? null;
      },
      setItem: (key: string, value: string) => {
        if (env.setItemThrows) throw new Error("quota");
        stored[key] = value;
      },
    },
    navigator: { userAgent: env.ua ?? "Mozilla/5.0", webdriver: Boolean(env.webdriver) },
    matchMedia: () => ({ matches: Boolean(env.reduced) }),
    document: {
      documentElement: html,
      getElementById: () => (env.noShowModal ? {} : { showModal: () => (opened.value = true) }),
    },
  };
  vm.runInNewContext(script, context);
  return { opened: opened.value, reading: html.dataset.reading, limiar: html.dataset.limiar, stored };
}

describe("LIMIAR_BOOT_SCRIPT", () => {
  it("abre na primeira visita", () => expect(run(LIMIAR_BOOT_SCRIPT, {}).opened).toBe(true));
  it("não abre depois da escolha de som", () =>
    expect(run(LIMIAR_BOOT_SCRIPT, { stored: { [STORAGE_KEYS.sound]: "off" } }).opened).toBe(false));
  it("não abre para robôs", () => expect(run(LIMIAR_BOOT_SCRIPT, { ua: "Googlebot/2.1" }).opened).toBe(false));
  it("não abre para navegador automatizado", () =>
    expect(run(LIMIAR_BOOT_SCRIPT, { webdriver: true }).opened).toBe(false));
  it("não abre para HeadlessChrome nem inspetores", () => {
    expect(run(LIMIAR_BOOT_SCRIPT, { ua: "Mozilla/5.0 HeadlessChrome/120" }).opened).toBe(false);
    expect(run(LIMIAR_BOOT_SCRIPT, { ua: "Google-InspectionTool/1.0" }).opened).toBe(false);
    expect(run(LIMIAR_BOOT_SCRIPT, { ua: "facebookexternalhit/1.1" }).opened).toBe(false);
  });
  it("não quebra sem suporte a showModal", () => expect(() => run(LIMIAR_BOOT_SCRIPT, { noShowModal: true })).not.toThrow());
  it("não abre nem quebra com storage bloqueado", () =>
    expect(run(LIMIAR_BOOT_SCRIPT, { storageThrows: true }).opened).toBe(false));
  it("modo leitura não abre e grava som off", () => {
    const r = run(LIMIAR_BOOT_SCRIPT, { reading: "on" });
    expect(r.opened).toBe(false);
    expect(r.stored[STORAGE_KEYS.sound]).toBe("off");
  });
  it("marca data-limiar=open ao abrir", () => expect(run(LIMIAR_BOOT_SCRIPT, {}).limiar).toBe("open"));
  it("não marca data-limiar quando não abre", () =>
    expect(run(LIMIAR_BOOT_SCRIPT, { reading: "on" }).limiar).toBeUndefined());
  it("setItem que lança não quebra nem abre", () => {
    let r: ReturnType<typeof run> | undefined;
    expect(() => (r = run(LIMIAR_BOOT_SCRIPT, { reading: "on", setItemThrows: true }))).not.toThrow();
    expect(r?.opened).toBe(false);
  });
});

describe("READING_BOOT_SCRIPT", () => {
  it("reduced motion sem preferência liga", () => expect(run(READING_BOOT_SCRIPT, { reduced: true }).reading).toBe("on"));
  it("off explícito vence reduced motion", () =>
    expect(run(READING_BOOT_SCRIPT, { reduced: true, stored: { [STORAGE_KEYS.reading]: "off" } }).reading).toBe("off"));
  it("storage bloqueado cai para off", () => expect(run(READING_BOOT_SCRIPT, { storageThrows: true }).reading).toBe("off"));
});
