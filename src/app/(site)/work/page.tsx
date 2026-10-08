import type { Metadata } from "next";
import { PageContent } from "@/components/ui/PageContent";
import { RoomDoor } from "@/components/ui/RoomDoor";
import { ProjectCard } from "@/components/ui/ProjectCard";
import { RoomTitle } from "@/components/ui/RoomTitle";
import { doors, pages, rooms } from "@/lib/content/copy";
import { getProjects } from "@/lib/content/projects";
import { buildPageMetadata } from "@/lib/seo/metadata";

// Ritmo assimétrico (como a home); cicla a cada 3 cards para qualquer quantidade.
const SPANS = ["lg:col-span-7", "lg:col-span-5", "lg:col-span-12"];

export const metadata: Metadata = buildPageMetadata({
  title: pages.work.heading,
  description: "Seleção de projetos de desenvolvimento web, mobile e segurança.",
  path: "/work",
});

export default function WorkPage() {
  const projects = getProjects();

  return (
    <PageContent>
      <section className="content-container py-section">
        <RoomTitle title={rooms.work.title} role={rooms.work.role} className="mb-[var(--space-xl)]" />

        <div className="grid grid-cols-1 gap-[var(--grid-gap)] md:grid-cols-2 lg:grid-cols-12">
          {projects.map((project, index) => (
            <ProjectCard
              key={project.slug}
              project={project}
              className={`min-h-[20rem] ${SPANS[index % SPANS.length]}`}
            />
          ))}
        </div>
      </section>
      {projects[0] && (
        <RoomDoor href={`/work/${projects[0].slug}`} room={doors.caseRoom} label={projects[0].title} />
      )}
    </PageContent>
  );
}
