import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MdxContent } from "@/components/content/MdxContent";
import { LitCaption } from "@/components/ui/LitCaption";
import { RoomDoor } from "@/components/ui/RoomDoor";
import { TransitionLink } from "@/components/ui/TransitionLink";
import { CaseFacts } from "@/components/work/CaseFacts";
import { NextCase } from "@/components/work/NextCase";
import { camara, doors, pages, rooms } from "@/lib/content/copy";
import { coverAltFor, getAdjacentProjects, getProjectBySlug, getProjects, linkKind } from "@/lib/content/projects";
import { navLabel } from "@/lib/nav";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { LensCapture } from "@/rooms/camara/LensCapture";

type Params = { slug: string };

export function generateStaticParams() {
  return getProjects().map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) return { title: "Projeto não encontrado" };

  return buildPageMetadata({
    title: project.title,
    description: project.summary,
    path: `/work/${project.slug}`,
    ogImage: project.coverImage,
    type: "article",
  });
}

// Case — Câmara (spec 7.5): nome gigante, captura com lente, fatos, resumo que acende, corpo em 66ch,
// "Visitar o site", próximo case (wrap) e a porta da jornada para o Sobre (D13).
export default async function ProjectPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) notFound();
  const { next } = getAdjacentProjects(project.slug);

  return (
    <>
      <article data-rail={doors.caseRoom} id="camara" className="content-container camara py-section">
        <header className="camara__cabeca">
          <TransitionLink href="/work" transitionDirection="back" className="link-mono focus-ring">
            {pages.work.back}
          </TransitionLink>
          <p className="text-room-role">{camara.role}</p>
          <h1 className="camara__titulo">{project.title}</h1>
        </header>

        <div className="camara__grade">
          <LensCapture src={project.coverImage} alt={coverAltFor(project)} title={project.title} />
          <CaseFacts project={project} />
        </div>

        <LitCaption paragraphs={[project.summary]} className="camara__resumo" />

        <div className="camara__corpo">
          <MdxContent source={project.content} />
        </div>

        {project.link && (
          <p>
            <a href={project.link} target="_blank" rel="noopener noreferrer" className="camara__visitar focus-ring">
              {camara.visit[linkKind(project.link)]}
              <span aria-hidden="true"> ↗</span>
            </a>
          </p>
        )}
      </article>
      {next && <NextCase project={next} />}
      <RoomDoor href="/about" room={rooms.about.title} label={navLabel("/about")} />
    </>
  );
}
