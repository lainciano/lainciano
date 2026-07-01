import { TransitionLink } from "@/components/ui/TransitionLink";
import type { TransitionDirection } from "@/lib/navigation";

type PillProps = {
  children: React.ReactNode;
  href?: string;
  variant?: "outline" | "solid";
  className?: string;
  transitionDirection?: TransitionDirection;
};

const base =
  "caps focus-ring inline-flex items-center justify-center rounded-full px-4 py-2 transition-colors duration-[var(--motion-base)] ease-out-soft";

const variants = {
  outline: "border border-accent text-foreground hover:bg-accent",
  solid: "bg-accent text-foreground hover:bg-hover",
} as const;

export function Pill({
  children,
  href,
  variant = "outline",
  className = "",
  transitionDirection = "forward",
}: PillProps) {
  const classes = `${base} ${variants[variant]} ${className}`.trim();

  if (href) {
    return (
      <TransitionLink href={href} className={classes} transitionDirection={transitionDirection}>
        {children}
      </TransitionLink>
    );
  }

  return <span className={classes}>{children}</span>;
}

type TagProps = {
  children: React.ReactNode;
};

export function Tag({ children }: TagProps) {
  return (
    <span className="caps inline-flex items-center rounded-full border border-secondary px-3 py-1 text-muted">
      {children}
    </span>
  );
}
