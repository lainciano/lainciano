import type { Metadata } from "next";
import { PageContent } from "@/components/ui/PageContent";
import { ProjectCard } from "@/components/ui/ProjectCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { pages } from "@/lib/content/copy";
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
        <div className="mb-12 flex flex-col gap-4">
          <span className="caps block text-muted">{pages.work.eyebrow}</span>
          <SectionHeading className="text-large-heading max-w-3xl text-foreground">
            {pages.work.intro}
          </SectionHeading>
        </div>

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
    </PageContent>
  );
}
