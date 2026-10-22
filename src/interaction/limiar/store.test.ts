import { beforeEach, describe, expect, it, vi } from "vitest";
import { limiarStore } from "@/interaction/limiar/store";

describe("limiarStore", () => {
  beforeEach(() => {
    limiarStore.close("skip");
  });

  it("começa fechado e sem origem", () => {
    expect(limiarStore.isOpen()).toBe(false);
    expect(limiarStore.getSource()).toBeNull();
  });

  it("open guarda a origem e recusa o segundo open", () => {
    expect(limiarStore.open("boot")).toBe(true);
    expect(limiarStore.isOpen()).toBe(true);
    expect(limiarStore.getSource()).toBe("boot");
    expect(limiarStore.open("console")).toBe(false);
    expect(limiarStore.getSource()).toBe("boot");
  });

  it("close é idempotente e onClose dispara uma vez", () => {
    const onClose = vi.fn();
    const off = limiarStore.onClose(onClose);
    limiarStore.open("console");
    expect(limiarStore.close("skip")).toBe(true);
    expect(limiarStore.close("skip")).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("skip");
    expect(limiarStore.isOpen()).toBe(false);
    expect(limiarStore.getSource()).toBeNull();
    off();
  });

  it("subscribe é notificado em open e em close, e para após cancelar", () => {
    const listener = vi.fn();
    const off = limiarStore.subscribe(listener);
    limiarStore.open("boot");
    expect(listener).toHaveBeenCalledTimes(1);
    limiarStore.close("complete");
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    limiarStore.open("boot");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
