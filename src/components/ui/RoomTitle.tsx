type RoomTitleProps = {
  title: string;
  role?: string;
  as?: "h1" | "h2";
  className?: string;
};

// Abertura de sala: título gótico + linha de papel (spec 6.3, 7.0).
export function RoomTitle({ title, role, as: Tag = "h1", className = "" }: RoomTitleProps) {
  return (
    <div
      className={`flex flex-wrap items-baseline justify-between gap-x-[var(--space-xl)] gap-y-[var(--space-sm)] ${className}`.trim()}
    >
      <Tag className="text-room-title">{title}</Tag>
      {role && <p className="text-room-role">{role}</p>}
    </div>
  );
}
