/**
 * Onda no ponto do clique (feedback visual de todo clique). CSS puro (@keyframes), sem GSAP. Dentro de um
 * <dialog> modal (Portal, gaveta) a onda é anexada ao próprio diálogo, senão ficaria escondida atrás dele.
 */
export function spawnRipple(x: number, y: number, target: Element | null) {
  const host: Element = target?.closest("dialog[open]") ?? document.body;
  const ring = document.createElement("span");
  ring.className = "click-ripple";
  ring.setAttribute("aria-hidden", "true");
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  ring.addEventListener("animationend", () => ring.remove(), { once: true });
  host.appendChild(ring);
}
