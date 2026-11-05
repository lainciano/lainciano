import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { MaterialKit } from "../render/materials";
import type { HandsPose } from "./handsAnim";
import { createPhoneModel, PHONE } from "./phone";
import { createPhoneHold, createThumbSolver, GRIP_CURL, HOLD, LTHUMB, PHONE_FRAC_MAX, type HoldPose } from "./phoneHold";

// three real em Node (kit falso sem canvas), como no `hands.test.ts`. O contador de `new` envolve os construtores
// de vetor, matriz, quatérnio e euler que o código do repositório pede ao `T`: o que passa por ele conta.

function fakeKit(): MaterialKit {
  return {
    phong: (o) => new THREE.MeshPhongMaterial(o),
    basic: (o) => new THREE.MeshBasicMaterial(o),
    baked: (m: THREE.Material) => m,
    texture: () => new THREE.CanvasTexture(undefined as unknown as HTMLCanvasElement),
    dispose: () => {},
  };
}

function counted() {
  const count = { n: 0 };
  const wrap = <C extends new (...a: never[]) => object>(Base: C) =>
    class extends (Base as unknown as new (...a: unknown[]) => object) {
      constructor(...a: unknown[]) {
        super(...a);
        count.n += 1;
      }
    } as unknown as C;
  const T = { ...THREE, Vector3: wrap(THREE.Vector3), Matrix4: wrap(THREE.Matrix4), Quaternion: wrap(THREE.Quaternion), Euler: wrap(THREE.Euler) } as typeof THREE;
  return { T, count };
}

function rig(T: typeof THREE = THREE) {
  const camera = new T.PerspectiveCamera(62, 1.6, 0.02, 60);
  const mount = new T.Group();
  mount.visible = true;
  const model = createPhoneModel(T, fakeKit());
  mount.add(model.root);
  const poses: HoldPose[] = [];
  const hold = createPhoneHold(T, camera, mount, () => model, (p) => poses.push(p));
  return { camera, mount, model, hold, poses };
}

describe("createPhoneHold · pegada do celular", () => {
  it("sem aparelho (guardado) o encaixe não faz nada; com ele, o 1º encaixe entrega a pose direto no alvo", () => {
    const camera = new THREE.PerspectiveCamera(62, 1.6, 0.02, 60);
    const calls: HoldPose[] = [];
    const none = createPhoneHold(THREE, camera, new THREE.Group(), () => null, (p) => calls.push(p));
    none.fit();
    expect(calls).toHaveLength(0);

    const { hold, poses } = rig();
    hold.fit();
    expect(poses).toHaveLength(1);
    expect(poses[0].curl).toBe(GRIP_CURL);
    // a tela cai a `d` do olho, na direção de HOLD (fração da meia-altura e da meia-largura)
    const tanH = Math.tan((62 * Math.PI) / 360);
    const d = PHONE.screen.h / (2 * tanH * HOLD.frac);
    expect(hold.center.z).toBeCloseTo(-d, 6);
    expect(hold.center.y).toBeCloseTo(HOLD.y * tanH * d, 6);
    expect(hold.dir.length()).toBeCloseTo(1, 6);
  });

  it("FOV novo: a pose mostrada corre até o alvo (sem teleporte) e a mesma pose é reaproveitada", () => {
    const { camera, hold, poses } = rig();
    hold.fit();
    const first = poses[0];
    const x0 = hold.pos.x;
    const z0 = hold.pos.z;
    camera.fov = 80;
    camera.updateProjectionMatrix();
    hold.fit();
    const afterFit = hold.pos.distanceTo(new THREE.Vector3(x0, hold.pos.y, z0));
    expect(afterFit).toBeLessThan(1e-9); // o encaixe só refaz o alvo; a pose não pulou
    hold.step(1 / 60);
    const mid = hold.pos.z;
    expect(mid).not.toBe(z0);
    for (let i = 0; i < 600; i++) hold.step(1 / 60);
    expect(hold.pos.z).not.toBe(mid);
    // convergiu: parado no alvo, `step` não entrega mais nada
    const n = poses.length;
    hold.step(1 / 60);
    expect(poses).toHaveLength(n);
    for (const p of poses) expect(p).toBe(first);
  });

  it("com o celular guardado (montagem invisível) a pose encaixa direto no alvo", () => {
    const { camera, mount, hold } = rig();
    hold.fit();
    mount.visible = false;
    camera.fov = 55;
    camera.updateProjectionMatrix();
    hold.fit();
    hold.step(0);
    const snapped = hold.pos.clone();
    hold.step(1 / 60);
    expect(hold.pos.distanceTo(snapped)).toBeLessThan(1e-12);
  });

  it("setFrac limita a fração (0,27 a 0,42) e ignora o que não é número", () => {
    const { hold } = rig();
    hold.fit();
    const d = (f: number) => {
      hold.setFrac(f);
      return -hold.center.z;
    };
    const base = d(HOLD.frac);
    expect(d(0.9)).toBeCloseTo(base * (HOLD.frac / PHONE_FRAC_MAX), 6);
    expect(d(0.01)).toBeCloseTo(base, 6);
    expect(d(Number.NaN)).toBeCloseTo(base, 6);
  });

  it("zero alocação: FOV, aspecto, fração e quadros no caminho da pegada não criam vetor, matriz, quatérnio nem euler", () => {
    const { T, count } = counted();
    const { camera, hold, mount } = rig(T);
    hold.fit();
    for (let i = 0; i < 5; i++) hold.step(1 / 60);
    const before = count.n;
    expect(before).toBeGreaterThan(0); // o contador enxerga as construções do próprio rig
    for (let i = 0; i < 300; i++) {
      camera.fov = 55 + (i % 26);
      camera.aspect = 1.2 + (i % 7) * 0.2;
      mount.visible = i % 11 !== 0;
      hold.setFrac(0.27 + (i % 16) * 0.01);
      hold.fit();
      hold.step(1 / 60);
    }
    expect(count.n).toBe(before);
  });
});

describe("createThumbSolver · ponta do polegar", () => {
  it("as duas falanges mantêm o comprimento e a junta dobra para o lado da dica", () => {
    const s = createThumbSolver(THREE);
    const base = new THREE.Vector3(0, 0, 0);
    s.solve(base, new THREE.Vector3(0, 0, -0.04), new THREE.Vector3(0, 1, 0));
    expect(s.mid.distanceTo(base)).toBeCloseTo(LTHUMB.proximal, 6);
    expect(s.tip.distanceTo(s.mid)).toBeCloseTo(LTHUMB.distal, 6);
    expect(s.mid.y).toBeGreaterThan(0);
    s.solve(base, new THREE.Vector3(0, 0, -0.04), new THREE.Vector3(0, -1, 0));
    expect(s.mid.y).toBeLessThan(0);
  });

  it("alvo fora do alcance estica sem passar do comprimento; nenhuma alocação por chamada", () => {
    const { T, count } = counted();
    const s = createThumbSolver(T);
    const base = new T.Vector3();
    const goal = new T.Vector3(0, 0, -1);
    const hint = new T.Vector3(0, 1, 0);
    s.solve(base, goal, hint);
    expect(s.tip.length()).toBeLessThan(LTHUMB.proximal + LTHUMB.distal);
    const model = createPhoneModel(T, fakeKit());
    const out = new T.Vector3();
    const pose = { phone: { lid: 1, raise: 1, flick: 0, aim: "5", presses: [0, 1, 2, 3].map(() => ({ key: "", depth: 0 })) } } as unknown as HandsPose;
    const before = count.n;
    for (let i = 0; i < 200; i++) {
      pose.phone.lid = i % 3 === 0 ? 0 : 1;
      pose.phone.raise = i % 5 === 0 ? 0.5 : 1;
      pose.phone.flick = i % 7 === 0 ? 0.6 : 0;
      pose.phone.aim = i % 2 ? "5" : "";
      s.target(pose, model, out);
      s.solve(base, out, hint);
    }
    expect(count.n).toBe(before);
  });
});
