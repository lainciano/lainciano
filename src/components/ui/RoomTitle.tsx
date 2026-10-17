import { RoomTitleText } from "./RoomTitleText";

type RoomTitleProps = {
  title: string;
  role?: string;
  /** "p" quando o h1 da página é outro elemento (Home: o wordmark na arena). */
  as?: "h1" | "h2" | "p";
  className?: string;
};

// Abertura de sala: título gótico + linha de papel (spec 6.3, 7.0).
export function RoomTitle({ title, role, as = "h1", className = "" }: RoomTitleProps) {
  return (
    <div
      className={`flex flex-wrap items-baseline justify-between gap-x-[var(--space-xl)] gap-y-[var(--space-sm)] ${className}`.trim()}
    >
      <RoomTitleText as={as}>{title}</RoomTitleText>
      {role && <p className="text-room-role">{role}</p>}
    </div>
  );
}
