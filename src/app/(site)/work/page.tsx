import type { Metadata } from "next";
import { RelicRow } from "@/components/work/RelicRow";
import { PageContent } from "@/components/ui/PageContent";
import { RoomDoor } from "@/components/ui/RoomDoor";
import { RoomTitle } from "@/components/ui/RoomTitle";
import { doors, pages, rooms } from "@/lib/content/copy";
import { getProjects } from "@/lib/content/projects";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: pages.work.heading,
  description: "Seleção de projetos de desenvolvimento web, mobile e segurança.",
  path: "/work",
});

// Projetos — Relicário (spec 7.4): índice de linhas-link; porta para o primeiro case.
export default function WorkPage() {
  const projects = getProjects();

  return (
    <PageContent>
      <section
        data-rail={rooms.work.title}
        id="relicario"
        aria-label={rooms.work.title}
        className="content-container py-section"
      >
        <RoomTitle title={rooms.work.title} role={rooms.work.role} className="mb-[var(--space-xl)]" />
        <ol className="relicario">
          {projects.map((project) => (
            <li key={project.slug}>
              <RelicRow project={project} />
            </li>
          ))}
        </ol>
      </section>
      {projects[0] && (
        <RoomDoor href={`/work/${projects[0].slug}`} room={doors.caseRoom} label={projects[0].title} />
      )}
    </PageContent>
  );
}
