import Image from "next/image";
import { TransitionLink } from "@/components/ui/TransitionLink";
import { indexStack } from "@/lib/content/projects";
import type { ProjectMeta } from "@/types/content";

// Linha-link do Relicário (spec 7.4): ano, nome, tipo e stack. A miniatura cinza só aparece no
// mobile/toque (CSS); no desktop a prévia em gravura segue o cursor (ilha Relicario). data-verbo
// evita o ímã do cursor numa linha de largura total (D10).
// `first`: a miniatura da 1ª linha é o LCP no mobile, então não pode ser lazy (as demais continuam).
export function RelicRow({ project, first = false }: { project: ProjectMeta; first?: boolean }) {
  return (
    <TransitionLink
      href={`/work/${project.slug}`}
      data-slug={project.slug}
      data-verbo="abra"
      className="relicario-linha focus-ring"
    >
      <span className="relicario-linha__ano">{project.year}</span>
      <span className="relicario-linha__nome">{project.title}</span>
      <span className="relicario-linha__meta">
        {project.kind && <span>{project.kind}</span>}
        <span>{indexStack(project.tags)}</span>
      </span>
      <span aria-hidden="true" className="relicario-linha__seta">
        →
      </span>
      <span className="relicario-linha__miniatura">
        <Image
          src={project.coverImage}
          alt=""
          fill
          loading={first ? "eager" : "lazy"}
          fetchPriority={first ? "high" : undefined}
          sizes="(max-width: 47.99rem) calc(100vw - 2rem), 32rem"
          className="relicario-linha__foto"
        />
      </span>
    </TransitionLink>
  );
}
