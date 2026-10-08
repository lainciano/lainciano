import type { ProjectMeta } from "@/types/content";

export type SlabTone = "sangue" | "osso" | "ferrugem";

export type Slab = { slug: string; title: string; meta: string; tone: SlabTone };

/** Protótipo: a 1ª laje em --sangue, depois --osso e --ferrugem alternados. */
export function slabTone(index: number): SlabTone {
  if (index === 0) return "sangue";
  return index % 2 === 1 ? "osso" : "ferrugem";
}

/** Uma laje por projeto publicado, na ordem de getProjects() (ano desc, título). */
export function toSlabs(projects: readonly Pick<ProjectMeta, "slug" | "title" | "year" | "kind">[]): Slab[] {
  return projects.map((project, index) => ({
    slug: project.slug,
    title: project.title,
    meta: project.kind ? `${project.year} · ${project.kind}` : String(project.year),
    tone: slabTone(index),
  }));
}
