import type { ProjectMeta } from "@/types/content";
import {
  assertSlugMatch,
  listMdxFiles,
  parseFrontmatter,
  readMdxFile,
} from "@/lib/content/mdx";
import { projectFrontmatterSchema } from "@/lib/content/schemas";

export type Project = ProjectMeta & { content: string };

const PROJECTS_DIR = "projects";

function loadProject(filename: string): Project {
  const { fileSlug, data, content } = readMdxFile(PROJECTS_DIR, filename);
  const meta = parseFrontmatter(projectFrontmatterSchema, data, filename);
  assertSlugMatch(fileSlug, meta.slug, filename);
  return { ...meta, content };
}

/** Ano desc; empate por título (pt-BR). readdirSync não garante ordem. */
export function sortProjects(projects: ProjectMeta[]): ProjectMeta[] {
  return [...projects].sort((a, b) => b.year - a.year || a.title.localeCompare(b.title, "pt-BR"));
}

export function coverAltFor(project: Pick<ProjectMeta, "title" | "coverAlt">): string {
  return project.coverAlt ?? `Captura da interface do projeto ${project.title}`;
}

/** Projetos publicados, ordenados por ano (desc) e título. */
export function getProjects(): ProjectMeta[] {
  return sortProjects(
    listMdxFiles(PROJECTS_DIR)
      .map((file) => loadProject(file))
      .filter((p) => p.published),
  );
}

/** Projeto por slug ou `null` se inexistente / não publicado. */
export function getProjectBySlug(slug: string): Project | null {
  const filename = `${slug}.mdx`;
  const files = listMdxFiles(PROJECTS_DIR);
  if (!files.includes(filename)) return null;

  const project = loadProject(filename);
  if (!project.published) return null;
  return project;
}
