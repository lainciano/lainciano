import type { Service } from "@/types/content";

type ServiceCardProps = {
  service: Service;
};

export function ServiceCard({ service }: ServiceCardProps) {
  return (
    // data-service-card: alvo da animação de empilhamento (Services).
    // Rotação de repouso vem do CSS (md:) e serve de fallback quando o GSAP não roda
    // (mobile / prefers-reduced-motion). Quando roda, o GSAP controla o transform.
    // hover usa cor (não transform) para não conflitar com o scrub do GSAP.
    <article
      data-service-card
      className="relative flex min-h-[22rem] flex-col rounded-card bg-accent p-8 text-foreground transition-colors duration-300 will-change-transform hover:bg-hover md:[transform:rotate(var(--rotate))]"
      style={{ "--rotate": `${service.rotation}deg` } as React.CSSProperties}
    >
      <h3 className="text-card-title -skew-y-1">{service.title}</h3>
      <p className="text-small-body mt-4 text-foreground/90">{service.description}</p>
      <div className="mt-auto flex flex-wrap gap-2 pt-8">
        {service.tags.map((tag) => (
          <span
            key={tag}
            className="caps inline-flex items-center rounded-full border border-foreground/60 px-3 py-1 text-foreground"
          >
            {tag}
          </span>
        ))}
      </div>
    </article>
  );
}
