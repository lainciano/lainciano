import { describe, expect, it } from "vitest";
import {
  COMMANDS,
  argOptions,
  findByPrefix,
  runCommand,
  searchKey,
  type ConsoleData,
  type ConsoleState,
} from "@/interaction/console/commands";
import { about, terminal } from "@/lib/content/copy";

const data: ConsoleData = {
  projects: [
    { slug: "brazskate", title: "Braz Skate", year: 2026, kind: "evento" },
    { slug: "coletiva", title: "Coletiva", year: 2026, kind: "escrita" },
    { slug: "crinaapp", title: "CrinaApp", year: 2026, kind: "marketplace" },
    { slug: "vermolinux", title: "Vermolin.ux", year: 2025 },
  ],
  posts: [
    { slug: "checklist-seguranca-deploy", title: "Checklist de segurança para deploy", createdAt: "2026-09-20" },
    { slug: "checklist-performance-deploy", title: "Checklist de performance para deploy", createdAt: "2026-09-10" },
  ],
  email: "lainciano@gmail.com",
  availability: "Disponível para contato.",
};
const state: ConsoleState = { won: [], sound: false, reading: false, platinum: false };
const run = (raw: string, s: ConsoleState = state) => runCommand(raw, data, s)!;
const texts = (raw: string, s?: ConsoleState) => run(raw, s).lines.map((line) => line.text);

describe("tabela da spec 8.6", () => {
  it("todos os comandos da spec existem", () => {
    for (const name of ["ajuda", "ir", "projetos", "abrir", "blog", "ler", "sobre", "contato", "reliquias", "som", "leitura", "arremessar", "girar", "revelar", "cripta", "ranking", "limpar", "sudo"]) {
      expect(COMMANDS).toContain(name);
    }
  });
  it("entrada vazia não roda nada", () => {
    expect(runCommand("   ", data, state)).toBeNull();
  });
  it("desconhecido: erro com o nome digitado, sem efeitos", () => {
    const result = run("xyz");
    expect(result.status).toBe("error");
    expect(result.lines).toEqual([{ kind: "err", text: terminal.notFound("xyz") }]);
    expect(result.effects).toEqual([]);
  });
});

describe("ajuda e aliases", () => {
  it("ajuda lista os comandos; aceita caixa alta, acento e help", () => {
    expect(texts("ajuda")).toEqual(terminal.help);
    expect(texts("AJUDA")).toEqual(terminal.help);
    expect(texts("help")).toEqual(terminal.help);
    expect(run("ajuda").status).toBe("ok");
  });
});

describe("ir", () => {
  it("navega pela sala, inteira ou por prefixo", () => {
    expect(run("ir projetos").effects).toEqual([{ type: "navigate", href: "/work" }]);
    expect(run("ir proj").effects).toEqual([{ type: "navigate", href: "/work" }]);
    expect(run("ir home").effects).toEqual([{ type: "navigate", href: "/" }]);
    expect(run("ir Sobre").effects).toEqual([{ type: "navigate", href: "/about" }]);
  });
  it("sem sala ou sala desconhecida: erro, sem navegar", () => {
    expect(run("ir")).toMatchObject({ status: "error", effects: [] });
    expect(texts("ir lua")).toEqual([terminal.goUnknown("lua")]);
  });
});

describe("projetos e abrir", () => {
  it("lista ano, nome em caixa alta e tipo", () => {
    const lines = texts("projetos");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^2026 {2}BRAZ SKATE +evento$/);
    expect(lines[3]).toMatch(/^2025 {2}VERMOLIN\.UX$/);
  });
  it("abrir por prefixo do slug ou do nome, ignorando pontuação", () => {
    expect(run("abrir braz").effects).toEqual([{ type: "navigate", href: "/work/brazskate" }]);
    expect(run("abrir braz skate").effects).toEqual([{ type: "navigate", href: "/work/brazskate" }]);
    expect(run("abrir Vermolin.ux").effects).toEqual([{ type: "navigate", href: "/work/vermolinux" }]);
    expect(texts("abrir braz")).toEqual([terminal.opening("Braz Skate")]);
  });
  it("ambíguo, inexistente ou vazio: erro", () => {
    expect(texts("abrir c")).toEqual([terminal.ambiguous(["coletiva", "crinaapp"])]);
    expect(texts("abrir xyz")).toEqual([terminal.projectNotFound("xyz")]);
    expect(texts("abrir")).toEqual([terminal.openUsage]);
    expect(run("abrir c").status).toBe("error");
  });
  it("abrir não dá a relíquia case (D8)", () => {
    expect(run("abrir braz").effects.some((effect) => effect.type === "unlock")).toBe(false);
  });
});

describe("blog e ler", () => {
  it("lista data e título", () => {
    expect(texts("blog")).toEqual([
      "2026-09-20  Checklist de segurança para deploy",
      "2026-09-10  Checklist de performance para deploy",
    ]);
  });
  it("ler por prefixo; ambíguo vira erro", () => {
    expect(run("ler checklist-s").effects).toEqual([{ type: "navigate", href: "/blog/checklist-seguranca-deploy" }]);
    expect(run("ler checklist").status).toBe("error");
    expect(texts("ler")).toEqual([terminal.readUsage]);
  });
  it("sem posts: avisa", () => {
    expect(runCommand("blog", { ...data, posts: [] }, state)!.lines[0]!.text).toBe(terminal.noPosts);
  });
});

describe("sobre e contato", () => {
  it("sobre resume o Sobre", () => {
    expect(texts("sobre")).toEqual([about.paragraphs[0], terminal.aboutMore]);
  });
  it("contato mostra e copia o e-mail", () => {
    const result = run("contato");
    expect(result.lines.map((line) => line.text)).toEqual([data.email, data.availability]);
    expect(result.effects).toEqual([{ type: "copy", text: data.email }]);
  });
});

describe("reliquias", () => {
  it("mostra sigilo das ganhas, ??? das outras e o total", () => {
    const lines = texts("reliquias", { ...state, won: ["sangue"] });
    expect(lines[0]).toBe("✠ sangue");
    expect(lines[1]).toBe(`· ${terminal.locked}`);
    expect(lines).toHaveLength(11);
    expect(lines[10]).toBe(terminal.relicsSummary(1, 10));
  });
  it("aceita acento", () => {
    expect(run("relíquias").status).toBe("ok");
  });
});

describe("som e leitura", () => {
  it("liga e desliga", () => {
    expect(run("som on").effects).toEqual([{ type: "sound", on: true }]);
    expect(run("leitura off").effects).toEqual([{ type: "reading", on: false }]);
  });
  it("sem argumento mostra o estado; argumento inválido é erro", () => {
    expect(texts("som", { ...state, sound: true })).toEqual([terminal.soundState(true)]);
    expect(texts("leitura")).toEqual([terminal.readingState(false)]);
    expect(texts("som talvez")).toEqual([terminal.soundUsage]);
    expect(run("leitura talvez").status).toBe("error");
  });
});

describe("alternativas acessíveis de relíquia (D7)", () => {
  it("arremessar e girar desbloqueiam direto", () => {
    expect(run("arremessar").effects).toEqual([{ type: "unlock", id: "arremesso" }]);
    expect(run("girar").effects).toEqual([{ type: "unlock", id: "orbita" }]);
  });
  it("revelar exige um projeto que existe", () => {
    expect(run("revelar braz").effects).toEqual([{ type: "unlock", id: "lente" }]);
    expect(texts("revelar braz")).toEqual([terminal.revealDone("Braz Skate")]);
    expect(texts("revelar")).toEqual([terminal.revealUsage]);
    expect(run("revelar xyz")).toMatchObject({ status: "error", effects: [] });
  });
});

describe("cripta, ranking, limpar, sudo", () => {
  it("cripta sem platina conta o que falta; com platina, livro em encadernação (D6)", () => {
    expect(texts("cripta", { ...state, won: ["sangue", "case"] })).toEqual([terminal.cryptLocked(2, 10)]);
    expect(texts("cripta", { ...state, platinum: true })).toEqual([terminal.cryptSoon]);
  });
  it("ranking responde que o livro ainda não abriu", () => {
    expect(texts("ranking")).toEqual([terminal.rankingSoon]);
  });
  it("limpar e clear limpam", () => {
    expect(run("limpar")).toEqual({ status: "ok", lines: [], effects: [{ type: "clear" }] });
    expect(run("clear").effects).toEqual([{ type: "clear" }]);
  });
  it("sudo é negado, anotado e dá a relíquia", () => {
    for (const raw of ["sudo", "sudo rm -rf /"]) {
      const result = run(raw);
      expect(result.status).toBe("denied");
      expect(result.lines).toEqual([{ kind: "err", text: terminal.sudo }]);
      expect(result.effects).toEqual([{ type: "unlock", id: "sudo" }]);
    }
  });
});

describe("busca e opções de Tab", () => {
  it("searchKey fica só com letras e dígitos", () => {
    expect(searchKey("Vermolin.ux")).toBe("vermolinux");
    expect(searchKey("Braz Skate")).toBe("brazskate");
  });
  it("findByPrefix prefere igualdade a prefixo", () => {
    const items = [
      { slug: "ab", title: "Ab" },
      { slug: "abc", title: "Abc" },
    ];
    expect(findByPrefix(items, "ab").map((item) => item.slug)).toEqual(["ab"]);
    expect(findByPrefix(items, "a").map((item) => item.slug)).toEqual(["ab", "abc"]);
    expect(findByPrefix(items, "")).toEqual([]);
  });
  it("opções do primeiro argumento por comando", () => {
    expect(argOptions("ir", data)).toEqual(["home", "projetos", "blog", "sobre", "contato"]);
    expect(argOptions("abrir", data)).toEqual(["brazskate", "coletiva", "crinaapp", "vermolinux"]);
    expect(argOptions("revelar", data)).toEqual(argOptions("abrir", data));
    expect(argOptions("ler", data)).toEqual(["checklist-seguranca-deploy", "checklist-performance-deploy"]);
    expect(argOptions("som", data)).toEqual(["on", "off"]);
    expect(argOptions("ajuda", data)).toEqual([]);
  });
});

describe("aliases", () => {
  it("resolve help/clear e ignoram nomes herdados do Object", () => {
    expect(texts("help")).toEqual(texts("ajuda"));
    expect(run("clear").effects).toEqual([{ type: "clear" }]);
    for (const name of ["constructor", "__proto__", "toString"]) {
      expect(run(name).status).toBe("error");
      expect(argOptions(name, data)).toEqual([]);
    }
  });
});
