import type { Metadata } from "next";
import { getImageProps } from "next/image";
import { RelicRow } from "@/components/work/RelicRow";
import { PageContent } from "@/components/ui/PageContent";
import { RoomDoor } from "@/components/ui/RoomDoor";
import { RoomTitle } from "@/components/ui/RoomTitle";
import { doors, pages, rooms } from "@/lib/content/copy";
import { getProjects } from "@/lib/content/projects";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { Relicario } from "@/rooms/relicario/Relicario";
import { PREVIEW } from "@/rooms/relicario/preview";

export const metadata: Metadata = buildPageMetadata({
  title: pages.work.heading,
  description: "Seleção de projetos de desenvolvimento web, mobile e segurança.",
  path: "/work",
});

// Projetos — Relicário (spec 7.4): índice de linhas-link; porta para o primeiro case.
export default function WorkPage() {
  const projects = getProjects();
  // URL otimizada (≈ 750 px para DPR 2) de cada captura: a textura da prévia não baixa o PNG original (D6).
  const previews = Object.fromEntries(
    projects.map((project) => [
      project.slug,
      getImageProps({ src: project.coverImage, alt: "", width: PREVIEW.width, height: PREVIEW.height }).props.src,
    ]),
  );

  return (
    <PageContent>
      <section
        data-rail={rooms.work.title}
        id="relicario"
        aria-label={rooms.work.title}
        className="content-container py-section"
      >
        <RoomTitle title={rooms.work.title} role={rooms.work.role} className="mb-[var(--space-xl)]" />
        <Relicario previews={previews}>
          <ol className="relicario">
            {projects.map((project) => (
              <li key={project.slug}>
                <RelicRow project={project} />
              </li>
            ))}
          </ol>
        </Relicario>
      </section>
      {projects[0] && (
        <RoomDoor href={`/work/${projects[0].slug}`} room={doors.caseRoom} label={projects[0].title} />
      )}
    </PageContent>
  );
}
