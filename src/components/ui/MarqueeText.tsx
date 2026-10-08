type MarqueeTextProps = {
  /** Texto repetido dentro da faixa (ex.: "lainciano "). */
  text: string;
  /** Direção do letreiro: header = esquerda→direita; footer = direita→esquerda. */
  direction: "ltr" | "rtl";
  className?: string;
  /** Repetições por metade da faixa (cada metade é idêntica para loop sem salto). */
  repeat?: number;
};

// Letreiro infinito via CSS transform (GPU). Duas metades idênticas no track:
// ao animar ±50%, a segunda metade ocupa o lugar da primeira — loop contínuo.
export function MarqueeText({
  text,
  direction,
  className = "",
  repeat = 4,
}: MarqueeTextProps) {
  const segment = `${text} `.repeat(repeat).trim();

  return (
    <div className={`marquee overflow-hidden ${className}`.trim()} aria-hidden="true">
      <div
        className={`marquee-track marquee-track--${direction} text-marquee whitespace-nowrap`}
      >
        <span className="marquee-segment">{segment}</span>
        <span className="marquee-segment">{segment}</span>
      </div>
    </div>
  );
}
