type AvailabilitySealProps = { text: string; className?: string };

// Selo de disponibilidade: Mono + quadrado --sangue pulsando (spec 7.2, 7.3). Texto de content/site.json.
export function AvailabilitySeal({ text, className = "" }: AvailabilitySealProps) {
  return <p className={`selo-estado ${className}`.trim()}>{text}</p>;
}
