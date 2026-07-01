import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MdxContent } from "@/components/content/MdxContent";
import { Pill, Tag } from "@/components/ui/Pill";
import { pages } from "@/lib/content/copy";
import { getPostBySlug, getPosts } from "@/lib/content/posts";
import { formatDate } from "@/lib/format";
import { buildPageMetadata } from "@/lib/seo/metadata";

type Params = { slug: string };

export function generateStaticParams() {
  return getPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "Post não encontrado" };

  return buildPageMetadata({
    title: post.title,
    description: post.excerpt,
    path: `/blog/${post.slug}`,
    type: "article",
    publishedTime: post.createdAt,
  });
}

export default async function PostPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  return (
    <article className="content-container py-12 lg:py-16">
      <div className="mb-8 flex flex-col gap-4">
        <span className="caps text-muted">{formatDate(post.createdAt)}</span>
        <h1 className="text-large-heading text-foreground">{post.title}</h1>
        <div className="flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      </div>

      <p className="text-large-body max-w-2xl text-foreground/90">{post.excerpt}</p>

      <div className="mt-10 max-w-2xl">
        <MdxContent source={post.content} />
      </div>

      <div className="mt-12">
        <Pill href="/blog" transitionDirection="back">
          {pages.blog.back}
        </Pill>
      </div>
    </article>
  );
}
