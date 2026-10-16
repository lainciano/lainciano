import { describe, expect, it } from "vitest";
import { NICKNAME, foldNickname, validateNickname } from "@/lib/ranking/validate";

describe("NICKNAME (spec 8.5: 3–16, letras, números, _ e -)", () => {
  it("limites", () => {
    expect(NICKNAME.min).toBe(3);
    expect(NICKNAME.max).toBe(16);
  });
});

describe("validateNickname — formato", () => {
  it("aceita letras, números, _ e - de 3 a 16", () => {
    for (const ok of ["lain", "lain_42", "a-b", "ABC", "x".repeat(16)]) expect(validateNickname(ok)).toBe("ok");
  });
  it("recusa curto, longo, espaço, acento, emoji e HTML", () => {
    for (const bad of ["ab", "x".repeat(17), "com espaco", "ação", "lain🔥", "<b>oi</b>", ""]) {
      expect(validateNickname(bad)).toBe("invalid");
    }
  });
  it("ignora espaços nas pontas (o campo pode colar com espaço)", () => {
    expect(validateNickname("  lain  ")).toBe("ok");
  });
  it("recusa apelido sem letra nem número (só _ e -)", () => {
    for (const bad of ["---", "___", "-_-"]) expect(validateNickname(bad)).toBe("invalid");
  });
});

describe("foldNickname (comparação da lista de bloqueio)", () => {
  it("minúsculas, leetspeak desfeito, sem _ e -", () => {
    expect(foldNickname("C4r4_lh0")).toBe("caralho");
    expect(foldNickname("F-U-C-K")).toBe("fuck");
  });
});

describe("validateNickname — lista de bloqueio (D9)", () => {
  it("bloqueia termos longos em qualquer posição, caixa e disfarce", () => {
    for (const blocked of ["caralho", "CARALHO", "c4r4lh0", "xxcaralhoxx", "f_u_c_k", "shit123", "nazi88"]) {
      expect(validateNickname(blocked)).toBe("blocked");
    }
  });
  it("bloqueia 'cunt' em qualquer forma, e os novos termos longos", () => {
    for (const blocked of ["cunts", "mycunt", "cuntface", "asshole", "putinha", "viadinh"]) {
      expect(validateNickname(blocked)).toBe("blocked");
    }
  });
  it("bloqueia termos curtos só quando o apelido é exatamente o termo", () => {
    for (const blocked of ["puta", "PUTA", "viado", "v14do", "bicha"]) expect(validateNickname(blocked)).toBe("blocked");
  });
  it("não bloqueia palavras comuns que contêm um termo curto (Scunthorpe)", () => {
    for (const fine of ["computador", "enviado", "bichano", "scunthorpe", "Scunthorpe_42", "lain"]) {
      expect(validateNickname(fine)).toBe("ok");
    }
  });
  it("palavra inocente não esconde termo bloqueado que se sobrepõe a ela", () => {
    for (const blocked of ["scunthorpedofil", "scunthorpecunt", "cunt_scunthorpe", "xscunthorpedofil"]) {
      expect(validateNickname(blocked)).toBe("blocked");
    }
  });
  it("termo bloqueado inteiro dentro da palavra inocente segue inocente", () => {
    expect(validateNickname("cuscunthorpe")).toBe("ok");
  });
  it("reserva nomes do site", () => {
    for (const reserved of ["admin", "Lainciano", "root", "moderador"]) expect(validateNickname(reserved)).toBe("blocked");
  });
});

describe("reservados com dígitos (Fase 7)", () => {
  it("admin2, root_1, cripta9, Sistema-07 → blocked", () => {
    for (const bad of ["admin2", "root_1", "cripta9", "Sistema-07", "lainciano42", "moderator1"]) {
      expect(validateNickname(bad)).toBe("blocked");
    }
  });
  it("palavra que só contém o reservado continua livre", () => {
    for (const ok of ["rootbeer", "administrado", "criptas", "sistemas"]) expect(validateNickname(ok)).toBe("ok");
  });
});
