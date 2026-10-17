import Image from "next/image";
import { TransitionLink } from "@/components/ui/TransitionLink";
import { camara } from "@/lib/content/copy";
import type { ProjectMeta } from "@/types/content";

// Link secundário "Próximo case" com wrap (spec 7.5; D13): nome em Geist 900 (spec 4.2) e mini
// captura estática em cinza (CSS — um 2º contexto WebGL na mesma página não vale a pena).
export function NextCase({ project }: { project: ProjectMeta }) {
  return (
    <nav aria-label={camara.nextCase} className="content-container">
      <TransitionLink href={`/work/${project.slug}`} data-verbo="abra" className="proximo-case focus-ring">
        <span className="proximo-case__rotulo text-verb">{camara.nextCase}</span>
        <span className="proximo-case__nome">{project.title}</span>
        <span className="proximo-case__miniatura" aria-hidden="true">
          <Image src={project.coverImage} alt="" fill loading="lazy" sizes="12rem" className="proximo-case__foto" />
        </span>
      </TransitionLink>
    </nav>
  );
}
