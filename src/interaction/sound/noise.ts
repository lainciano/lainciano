/** Geradores puros de ruído (testáveis sem AudioContext). `random` devolve valores em [0, 1). */
type Random = () => number;

/** Ruído marrom (integrado do branco, com fuga): grave, "tom de sala". */
export function fillBrown(data: Float32Array, random: Random = Math.random) {
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    const white = random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = Math.max(-1, Math.min(1, last * 3.5));
  }
}

/** Ruído rosa (filtro de Paul Kellet): macio, sem o chiado do branco. */
export function fillPink(data: Float32Array, random: Random = Math.random) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < data.length; i += 1) {
    const white = random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
    data[i] = Math.max(-1, Math.min(1, pink));
  }
}
