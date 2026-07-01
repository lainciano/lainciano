"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";
import { createProjectCardsStagger } from "@/animations/projectCardsStagger";
import { ProjectCard } from "@/components/ui/ProjectCard";
import { Pill } from "@/components/ui/Pill";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { sections } from "@/lib/content/copy";
import type { ProjectMeta } from "@/types/content";

const SPANS = ["lg:col-span-7", "lg:col-span-5", "lg:col-span-12"];

type WorkSectionProps = {
  projects: ProjectMeta[];
};

// Grid de projetos com entrada staggered via ScrollTrigger.
export function WorkSection({ projects }: WorkSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const section = sectionRef.current;
      if (!section) return;

      const cards = gsap.utils.toArray<HTMLElement>("[data-project-card]", section);
      return createProjectCardsStagger(section, cards);
    },
    { scope: sectionRef },
  );

  return (
    <section
      ref={sectionRef}
      id="work"
      className="content-container py-section"
      aria-label="Projetos"
    >
      <div className="mb-12 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <SectionHeading className="text-large-heading max-w-2xl text-foreground">
          {sections.work.heading}
        </SectionHeading>
        <Pill href="/work">{sections.work.seeAll}</Pill>
      </div>

      <div className="grid grid-cols-1 gap-[var(--grid-gap)] md:grid-cols-2 lg:grid-cols-12">
        {projects.map((project, index) => (
          <ProjectCard
            key={project.slug}
            project={project}
            data-project-card
            className={`min-h-[20rem] ${SPANS[index] ?? "lg:col-span-6"}`}
          />
        ))}
      </div>
    </section>
  );
}
