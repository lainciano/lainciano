import { describe, expect, it } from "vitest";
import {
  EMPTY_HISTORY,
  HISTORY_MAX,
  commonPrefix,
  complete,
  historyDown,
  historyUp,
  normalize,
  parseCommand,
  pushHistory,
} from "@/interaction/console/parse";

describe("normalize", () => {
  it("tira acentos, caixa e espaços repetidos", () => {
    expect(normalize("  Relíquias   AGORA ")).toBe("reliquias agora");
    expect(normalize("Câmara")).toBe("camara");
  });
});

describe("parseCommand", () => {
  it("separa comando, argumentos e o resto", () => {
    expect(parseCommand("Abrir  Braz Skate")).toEqual({ name: "abrir", args: ["braz", "skate"], rest: "braz skate" });
  });
  it("vazio ou só espaço = nada a rodar", () => {
    expect(parseCommand("")).toBeNull();
    expect(parseCommand("   ")).toBeNull();
  });
});

describe("commonPrefix", () => {
  it("maior prefixo comum", () => {
    expect(commonPrefix(["leitura", "ler"])).toBe("le");
    expect(commonPrefix(["ajuda"])).toBe("ajuda");
    expect(commonPrefix([])).toBe("");
  });
});

describe("complete (Tab)", () => {
  const commands = ["ajuda", "abrir", "leitura", "ler", "limpar", "ir"];
  const args = (command: string) => (command === "ir" ? ["home", "projetos", "blog", "sobre", "contato"] : []);

  it("uma opção: completa o comando e põe espaço", () => {
    expect(complete("aj", commands, args)).toEqual({ value: "ajuda ", options: [] });
  });
  it("várias opções: avança até o prefixo comum e lista", () => {
    expect(complete("le", commands, args)).toEqual({ value: "le", options: ["leitura", "ler"] });
    expect(complete("l", commands, args)).toEqual({ value: "l", options: ["leitura", "ler", "limpar"] });
  });
  it("completa o primeiro argumento", () => {
    expect(complete("ir p", commands, args)).toEqual({ value: "ir projetos ", options: [] });
    expect(complete("ir ", commands, args).options).toEqual(["home", "projetos", "blog", "sobre", "contato"]);
  });
  it("sem par, sem argumento previsto ou além do primeiro argumento: não mexe", () => {
    expect(complete("xyz", commands, args)).toEqual({ value: "xyz", options: [] });
    expect(complete("ajuda x", commands, args)).toEqual({ value: "ajuda x", options: [] });
    expect(complete("ir projetos x", commands, args)).toEqual({ value: "ir projetos x", options: [] });
    expect(complete("", commands, args)).toEqual({ value: "", options: [] });
  });
});

describe("histórico", () => {
  it("guarda sem vazio e sem repetição seguida, e põe o cursor no fim", () => {
    let h = pushHistory(EMPTY_HISTORY, "ajuda");
    h = pushHistory(h, "ajuda");
    h = pushHistory(h, "  ");
    h = pushHistory(h, "projetos");
    expect(h).toEqual({ entries: ["ajuda", "projetos"], cursor: 2 });
  });
  it("limita o tamanho", () => {
    let h = EMPTY_HISTORY;
    for (let i = 0; i < HISTORY_MAX + 5; i += 1) h = pushHistory(h, `c${i}`);
    expect(h.entries).toHaveLength(HISTORY_MAX);
    expect(h.entries[0]).toBe("c5");
  });
  it("↑ volta, ↓ avança e sai no vazio", () => {
    let h = pushHistory(pushHistory(EMPTY_HISTORY, "a"), "b");
    const up1 = historyUp(h);
    expect(up1.value).toBe("b");
    const up2 = historyUp(up1.history);
    expect(up2.value).toBe("a");
    const up3 = historyUp(up2.history);
    expect(up3.value).toBe("a"); // no topo, fica
    h = up3.history;
    const down1 = historyDown(h);
    expect(down1.value).toBe("b");
    const down2 = historyDown(down1.history);
    expect(down2.value).toBe("");
    expect(historyDown(down2.history).value).toBe("");
  });
  it("histórico vazio: ↑ não tem o que mostrar", () => {
    expect(historyUp(EMPTY_HISTORY).value).toBeNull();
  });
});
