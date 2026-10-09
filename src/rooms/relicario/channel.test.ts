import { describe, expect, it, vi } from "vitest";
import { createPreviewChannel } from "@/rooms/relicario/channel";

describe("createPreviewChannel", () => {
  it("guarda o slug ativo e avisa só quando muda", () => {
    const channel = createPreviewChannel();
    const listener = vi.fn();
    channel.subscribe(listener);
    channel.set("brazskate");
    channel.set("brazskate");
    channel.set(null);
    expect(listener.mock.calls).toEqual([["brazskate"], [null]]);
    expect(channel.get()).toBeNull();
  });
  it("cancelar a inscrição para de avisar", () => {
    const channel = createPreviewChannel();
    const listener = vi.fn();
    const off = channel.subscribe(listener);
    off();
    channel.set("coletiva");
    expect(listener).not.toHaveBeenCalled();
  });
});
