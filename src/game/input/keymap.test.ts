import { describe, expect, it } from "vitest";
import { isRelease, type InputMode } from "./actions";
import { isBrowserChord, keyToAction, TURN_KEYS } from "./keymap";

const PANELS: InputMode[] = ["read", "examine", "phone"];

describe("keyToAction · andar", () => {
  it("W anda para a frente (z −1) e soltar zera a contribuição da tecla", () => {
    expect(keyToAction("KeyW", true, "walk")).toEqual({ type: "move", x: 0, z: -1 });
    expect(keyToAction("KeyW", false, "walk")).toEqual({ type: "move", x: 0, z: 0 });
  });
  it("S, A, D e as setas de cima/baixo também são movimento", () => {
    expect(keyToAction("KeyS", true, "walk")).toEqual({ type: "move", x: 0, z: 1 });
    expect(keyToAction("KeyA", true, "walk")).toEqual({ type: "move", x: -1, z: 0 });
    expect(keyToAction("KeyD", true, "walk")).toEqual({ type: "move", x: 1, z: 0 });
    expect(keyToAction("ArrowUp", true, "walk")).toEqual({ type: "move", x: 0, z: -1 });
    expect(keyToAction("ArrowDown", true, "walk")).toEqual({ type: "move", x: 0, z: 1 });
  });
  it("E aperta e solta a interação (Enter também)", () => {
    expect(keyToAction("KeyE", true, "walk")).toEqual({ type: "interact", down: true });
    expect(keyToAction("KeyE", false, "walk")).toEqual({ type: "interact", down: false });
    expect(keyToAction("Enter", true, "walk")).toEqual({ type: "interact", down: true });
  });
  it("Tab abre o celular, L os lugares, Q troca o alvo, F a lanterna", () => {
    expect(keyToAction("Tab", true, "walk")).toEqual({ type: "phone" });
    expect(keyToAction("KeyL", true, "walk")).toEqual({ type: "places" });
    expect(keyToAction("KeyQ", true, "walk")).toEqual({ type: "cycle" });
    expect(keyToAction("KeyF", true, "walk")).toEqual({ type: "flash" });
    // Toques únicos: soltar não faz nada.
    for (const code of ["Tab", "KeyL", "KeyQ", "KeyF"]) expect(keyToAction(code, false, "walk")).toBeNull();
  });
  it("Z/X espiam enquanto seguradas; soltar volta ao centro", () => {
    expect(keyToAction("KeyZ", true, "walk")).toEqual({ type: "peek", dir: -1 });
    expect(keyToAction("KeyZ", false, "walk")).toEqual({ type: "peek", dir: 0 });
    expect(keyToAction("KeyX", true, "walk")).toEqual({ type: "peek", dir: 1 });
    expect(keyToAction("KeyX", false, "walk")).toEqual({ type: "peek", dir: 0 });
  });
  it("Shift corre e C agacha enquanto seguradas; Ctrl não é do jogo (Ctrl+W/L/F são do navegador)", () => {
    expect(keyToAction("ShiftLeft", true, "walk")).toEqual({ type: "run", on: true });
    expect(keyToAction("ShiftRight", false, "walk")).toEqual({ type: "run", on: false });
    expect(keyToAction("KeyC", true, "walk")).toEqual({ type: "crouch", on: true });
    expect(keyToAction("KeyC", false, "walk")).toEqual({ type: "crouch", on: false });
    expect(keyToAction("ControlLeft", true, "walk")).toBeNull();
    expect(keyToAction("ControlRight", false, "walk")).toBeNull();
  });
  it("atalhos com Ctrl, ⌘ ou Alt são do navegador; Shift sozinho é do jogo", () => {
    expect(isBrowserChord({ ctrlKey: true, metaKey: false, altKey: false })).toBe(true);
    expect(isBrowserChord({ ctrlKey: false, metaKey: true, altKey: false })).toBe(true);
    expect(isBrowserChord({ ctrlKey: false, metaKey: false, altKey: true })).toBe(true);
    expect(isBrowserChord({ ctrlKey: false, metaKey: false, altKey: false })).toBe(false);
  });
  it("Esc, ⌫ e R não fazem nada andando (o Esc é do navegador)", () => {
    expect(keyToAction("Escape", true, "walk")).toBeNull();
    expect(keyToAction("Backspace", true, "walk")).toBeNull();
    expect(keyToAction("KeyR", true, "walk")).toBeNull();
  });
  it("tecla desconhecida é null", () => {
    expect(keyToAction("KeyP", true, "walk")).toBeNull();
    expect(keyToAction("", true, "walk")).toBeNull();
  });
  it("setas laterais e PageUp/PageDown giram o olhar (fora do keyToAction)", () => {
    expect(keyToAction("ArrowLeft", true, "walk")).toBeNull();
    expect(TURN_KEYS.ArrowLeft).toEqual({ yaw: 1, pitch: 0 });
    expect(TURN_KEYS.ArrowRight).toEqual({ yaw: -1, pitch: 0 });
    expect(TURN_KEYS.PageUp).toEqual({ yaw: 0, pitch: 1 });
    expect(TURN_KEYS.PageDown).toEqual({ yaw: 0, pitch: -1 });
  });
});

describe("keyToAction · painéis (bíblia 12b.5: E, ⌫ ou botão direito fecham)", () => {
  for (const mode of PANELS) {
    it(`em ${mode}, E e ⌫ voltam (só ao apertar)`, () => {
      expect(keyToAction("KeyE", true, mode)).toEqual({ type: "back" });
      expect(keyToAction("Backspace", true, mode)).toEqual({ type: "back" });
      expect(keyToAction("KeyE", false, mode)).toBeNull();
      expect(keyToAction("Backspace", false, mode)).toBeNull();
    });
    it(`em ${mode}, Esc também volta (tolerância, sem rótulo na tela)`, () => {
      expect(keyToAction("Escape", true, mode)).toEqual({ type: "back" });
    });
    it(`em ${mode}, nada de andar`, () => {
      expect(keyToAction("KeyW", true, mode)).toBeNull();
      expect(keyToAction("KeyZ", true, mode)).toBeNull();
      expect(keyToAction("ShiftLeft", true, mode)).toBeNull();
    });
  }
  it("em read, R alterna o texto limpo e W é null", () => {
    expect(keyToAction("KeyR", true, "read")).toEqual({ type: "read" });
    expect(keyToAction("KeyR", false, "read")).toBeNull();
    expect(keyToAction("KeyW", true, "read")).toBeNull();
  });
  it("R só existe na leitura", () => {
    expect(keyToAction("KeyR", true, "examine")).toBeNull();
    expect(keyToAction("KeyR", true, "phone")).toBeNull();
  });
  it("no celular, Tab fecha como abriu", () => {
    expect(keyToAction("Tab", true, "phone")).toEqual({ type: "phone" });
  });
});

describe("keyToAction · menu (lista de lugares)", () => {
  it("L fecha como abriu; ⌫ e Esc voltam", () => {
    expect(keyToAction("KeyL", true, "menu")).toEqual({ type: "places" });
    expect(keyToAction("Backspace", true, "menu")).toEqual({ type: "back" });
    expect(keyToAction("Escape", true, "menu")).toEqual({ type: "back" });
  });
  it("Tab, Enter, setas e E ficam com a lista (foco e botões nativos)", () => {
    for (const code of ["Tab", "Enter", "ArrowDown", "ArrowUp", "KeyE", "KeyW", "Space"]) {
      expect(keyToAction(code, true, "menu"), code).toBeNull();
    }
  });
});

describe("isRelease · soltar chega ao jogador mesmo com painel aberto", () => {
  it("move zero, correr/agachar desligados, espiar no centro e soltar a interação são solturas", () => {
    expect(isRelease({ type: "move", x: 0, z: 0 })).toBe(true);
    expect(isRelease({ type: "run", on: false })).toBe(true);
    expect(isRelease({ type: "crouch", on: false })).toBe(true);
    expect(isRelease({ type: "peek", dir: 0 })).toBe(true);
    expect(isRelease({ type: "interact", down: false })).toBe(true);
  });
  it("o que liga ou age não é soltura", () => {
    expect(isRelease({ type: "move", x: 0, z: -1 })).toBe(false);
    expect(isRelease({ type: "run", on: true })).toBe(false);
    expect(isRelease({ type: "crouch", on: true })).toBe(false);
    expect(isRelease({ type: "peek", dir: 1 })).toBe(false);
    expect(isRelease({ type: "interact", down: true })).toBe(false);
    expect(isRelease({ type: "look", dx: 0, dy: 0 })).toBe(false);
    expect(isRelease({ type: "places" })).toBe(false);
  });
});
