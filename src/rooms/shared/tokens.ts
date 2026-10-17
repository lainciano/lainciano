import { hexToVec3 } from "./engravingShader";

/** Cor de um token de globals.css (ex.: "--osso") em 0–1, para uniforms de shader. */
export function tokenRgb(name: string): [number, number, number] {
  return hexToVec3(getComputedStyle(document.documentElement).getPropertyValue(name));
}
