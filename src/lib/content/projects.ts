import { getAdjacent, type Adjacent } from "@/lib/content/adjacent";
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

/** Quantas tags aparecem na linha do índice (spec 7.4; D11: as primeiras do MDX). */
export const INDEX_STACK_SIZE = 2;

export function indexStack(tags: readonly string[]): string {
  return tags.slice(0, INDEX_STACK_SIZE).join(", ");
}

/** Link de projeto: repositório (GitHub) ou site no ar — muda o rótulo nos fatos da Câmara. */
export function linkKind(url: string): "repo" | "site" {
  return /^https?:\/\/(www\.)?github\.com\//i.test(url) ? "repo" : "site";
}

/** URL legível para os fatos: sem protocolo, sem www, sem barra final. */
export function displayUrl(url: string): string {
  return url
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
}

/** Vizinhos de um case na ordem do índice, com wrap (spec 7.5: último → primeiro). */
export function getAdjacentProjects(slug: string): Adjacent<ProjectMeta> {
  return getAdjacent(getProjects(), slug, { wrap: true });
}
