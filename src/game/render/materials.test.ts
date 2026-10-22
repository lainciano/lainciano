import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createMaterialKit, PHONG_DEFAULTS, protoColor } from "./materials";
import { createPsxUniforms } from "./psx";

const kit = () => createMaterialKit(THREE, createPsxUniforms(THREE));
const rgb = (c: THREE.Color) => [c.r, c.g, c.b];

describe("convenção de cor do protótipo (hex e texto lidos como lineares)", () => {
  it("protoColor lê número e texto CSS iguais, sem conversão sRGB", () => {
    expect(rgb(protoColor(THREE, 0x8a867d))).toEqual([0x8a / 255, 0x86 / 255, 0x7d / 255]);
    expect(rgb(protoColor(THREE, "#8a867d"))).toEqual(rgb(protoColor(THREE, 0x8a867d)));
    expect(rgb(protoColor(THREE, "rgb(138, 134, 125)"))).toEqual(rgb(protoColor(THREE, 0x8a867d)));
  });

  it("phong e basic tratam color/emissive/specular em número e em texto da mesma forma", () => {
    const k = kit();
    const a = k.phong({ color: 0xb5a788, emissive: 0x101010, specular: 0x222222 });
    const b = k.phong({ color: "#b5a788", emissive: "#101010", specular: "#222222" });
    expect(rgb(b.color)).toEqual(rgb(a.color));
    expect(rgb(b.emissive)).toEqual(rgb(a.emissive));
    expect(rgb(b.specular)).toEqual(rgb(a.specular));
    expect(rgb(a.color)).toEqual(rgb(protoColor(THREE, 0xb5a788)));
    // O construtor do three, sozinho, converteria de sRGB (mais escuro): o kit não deixa isso passar.
    expect(new THREE.MeshPhongMaterial({ color: "#b5a788" }).color.r).toBeLessThan(a.color.r);
    expect(rgb(k.basic({ color: "#ffd8a0" }).color)).toEqual(rgb(protoColor(THREE, 0xffd8a0)));
  });

  it("o especular padrão do protótipo também é linear; uma THREE.Color pronta passa como está", () => {
    const k = kit();
    expect(rgb(k.phong({}).specular)).toEqual(rgb(protoColor(THREE, PHONG_DEFAULTS.specular)));
    const ready = new THREE.Color(0.25, 0.5, 0.75);
    expect(rgb(k.phong({ color: ready }).color)).toEqual([0.25, 0.5, 0.75]);
  });

  it("o PSX vem ligado e dispose libera os materiais", () => {
    const k = kit();
    const m = k.phong({ color: 0x111111 });
    expect(m.customProgramCacheKey()).toBe("psx");
    let disposed = 0;
    m.addEventListener("dispose", () => {
      disposed += 1;
    });
    k.dispose();
    expect(disposed).toBe(1);
  });
});
