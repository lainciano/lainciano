import { z } from "zod";

// Schemas Zod para validar frontmatter MDX na leitura (build-time).

export const projectFrontmatterSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  year: z.number().int(),
  tags: z.array(z.string()).min(1),
  coverImage: z.string().min(1),
  accentColor: z.string().optional(),
  published: z.boolean(),
  summary: z.string().min(1),
  link: z.string().url().optional(),
  coverAlt: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  kind: z.string().min(1).optional(),
});

export const postFrontmatterSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  excerpt: z.string().min(1),
  tags: z.array(z.string()).min(1),
  published: z.boolean(),
  createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type ProjectFrontmatter = z.infer<typeof projectFrontmatterSchema>;
export type PostFrontmatter = z.infer<typeof postFrontmatterSchema>;
