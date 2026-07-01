import type { ComponentPropsWithoutRef } from "react";
import { TransitionLink } from "@/components/ui/TransitionLink";
import type { ProjectMeta } from "@/types/content";

type ProjectCardProps = {
  project: ProjectMeta;
  className?: string;
} & Omit<ComponentPropsWithoutRef<typeof TransitionLink>, "href" | "className" | "children">;

export function ProjectCard({ project, className = "", ...linkProps }: ProjectCardProps) {
  return (
    <TransitionLink
      href={`/work/${project.slug}`}
      transitionDirection="forward"
      {...linkProps}
      className={`group focus-ring relative flex flex-col justify-end overflow-hidden rounded-card shadow-lg shadow-transparent transition-[border-radius,box-shadow] duration-[var(--motion-slow)] ease-out-soft hover:rounded-card-hover hover:shadow-2xl hover:shadow-black/50 ${className}`}
      style={{ backgroundColor: project.accentColor ?? "var(--color-secondary)" }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-background/10 to-transparent transition-[background] duration-[var(--motion-base)] group-hover:from-background/80" />

      {/* Affordance de hover: seta que surge no canto (sem transform no root, p/ não brigar com o GSAP). */}
      <span
        aria-hidden="true"
        className="caps absolute right-5 top-5 z-10 translate-y-1 text-foreground/0 transition-all duration-[var(--motion-base)] ease-out-soft group-hover:translate-y-0 group-hover:text-foreground/90"
      >
        Ver ↗
      </span>

      <div className="relative z-10 flex flex-col gap-3 p-6">
        <h3 className="text-card-title text-foreground">{project.title}</h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="caps text-foreground/70">{project.year}</span>
          {project.tags.map((tag) => (
            <span key={tag} className="caps text-foreground/70">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </TransitionLink>
  );
}
