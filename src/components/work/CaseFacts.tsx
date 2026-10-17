import { camara } from "@/lib/content/copy";
import { displayUrl, linkKind } from "@/lib/content/projects";
import type { ProjectMeta } from "@/types/content";

// Ficha do case (spec 7.5; D25): rótulos Mono, valores Geist. Papel só quando o MDX o declara.
export function CaseFacts({ project }: { project: ProjectMeta }) {
  const facts = camara.facts;
  return (
    <section className="fatos">
      <h2 className="sr-only">{camara.factsLabel}</h2>
      <dl className="fatos__lista">
        <dt>{facts.year}</dt>
        <dd>{project.year}</dd>
        {project.kind && (
          <>
            <dt>{facts.kind}</dt>
            <dd>{project.kind}</dd>
          </>
        )}
        {project.role && (
          <>
            <dt>{facts.role}</dt>
            <dd>{project.role}</dd>
          </>
        )}
        <dt>{facts.stack}</dt>
        <dd>{project.tags.join(", ")}</dd>
        {project.link && (
          <>
            <dt>{facts[linkKind(project.link)]}</dt>
            <dd>
              <a href={project.link} target="_blank" rel="noopener noreferrer" className="fatos__link focus-ring">
                {displayUrl(project.link)}
                <span aria-hidden="true"> ↗</span>
              </a>
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}
