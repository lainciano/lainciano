import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { MdxContent } from "@/components/content/MdxContent";
import { Pill, Tag } from "@/components/ui/Pill";
import { pages } from "@/lib/content/copy";
import { getProjectBySlug, getProjects } from "@/lib/content/projects";
import { buildPageMetadata } from "@/lib/seo/metadata";

type Params = { slug: string };

export function generateStaticParams() {
  return getProjects().map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
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

function linkLabel(url: string): string {
  return url.includes("github.com") ? "Ver repositório" : "Acessar projeto";
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) notFound();

  return (
    <article className="content-container py-12 lg:py-16">
      <div className="mb-8 flex flex-col gap-4">
        <span className="caps text-muted">{project.year}</span>
        <h1 className="text-large-heading text-foreground">{project.title}</h1>
        <div className="flex flex-wrap gap-2">
          {project.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      </div>

      <div
        className="relative mb-10 aspect-[16/9] w-full max-w-3xl overflow-hidden rounded-card"
        style={{ backgroundColor: project.accentColor ?? "var(--color-secondary)" }}
      >
        {project.coverImage && (
          <Image
            src={project.coverImage}
            alt={`Capa do projeto ${project.title}`}
            fill
            className="object-cover rounded-card border border-secondary shadow-lg"
            sizes="(max-width: 768px) 100vw, 768px"
            priority
          />
        )}
      </div>

      <p className="text-large-body max-w-2xl text-foreground/90">{project.summary}</p>

      <div className="mt-10 max-w-2xl">
        <MdxContent source={project.content} />
      </div>

      <div className="mt-12 flex flex-wrap gap-4">
        {project.link && (
          <a
            href={project.link}
            target="_blank"
            rel="noopener noreferrer"
            className="caps focus-ring inline-flex items-center justify-center rounded-full bg-accent px-6 py-3 text-foreground transition-colors duration-[var(--motion-base)] ease-out-soft hover:bg-hover"
          >
            {linkLabel(project.link)} ↗
          </a>
        )}
        <Pill href="/work" transitionDirection="back">
          {pages.work.back}
        </Pill>
      </div>
    </article>
  );
}
