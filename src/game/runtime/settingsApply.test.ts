import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../save/schema";
import { createSettingsApplier } from "./settingsApply";

function setup(initial = DEFAULT_SETTINGS) {
  const target = { fov: vi.fn(), quality: vi.fn(), player: vi.fn() };
  return { target, apply: createSettingsApplier(target, initial) };
}

describe("ajustes aplicados na hora (T11, revisão I1)", () => {
  it("alternar balanço, legendas ou sustos não mexe na qualidade nem no FOV (a descida do FpsGuard fica)", () => {
    const { target, apply } = setup();
    apply({ ...DEFAULT_SETTINGS, bob: false });
    apply({ ...DEFAULT_SETTINGS, bob: false, subtitles: false });
    apply({ ...DEFAULT_SETTINGS, bob: false, subtitles: false, scares: false });
    expect(target.quality).not.toHaveBeenCalled();
    expect(target.fov).not.toHaveBeenCalled();
    expect(target.player).toHaveBeenCalledTimes(3);
  });

  it("qualidade só quando muda; voltar a auto chama com auto", () => {
    const { target, apply } = setup();
    apply({ ...DEFAULT_SETTINGS, quality: 480 });
    apply({ ...DEFAULT_SETTINGS, quality: 480, fov: 70 });
    apply({ ...DEFAULT_SETTINGS, quality: "auto", fov: 70 });
    expect(target.quality.mock.calls).toEqual([[480], ["auto"]]);
    expect(target.fov.mock.calls).toEqual([[70]]);
  });
});
