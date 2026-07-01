import type { Metadata } from "next";
import { BlogCard } from "@/components/ui/BlogCard";
import { PageContent } from "@/components/ui/PageContent";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { pages } from "@/lib/content/copy";
import { getPosts } from "@/lib/content/posts";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: pages.blog.heading,
  description: "Artigos sobre Next.js, animação, CSS e segurança.",
  path: "/blog",
});

export default function BlogPage() {
  const posts = getPosts();

  return (
    <PageContent>
      <section className="content-container py-section">
        <div className="mb-12 flex flex-col gap-4">
          <span className="caps block text-muted">{pages.blog.eyebrow}</span>
          <SectionHeading className="text-large-heading max-w-3xl text-foreground">
            {pages.blog.intro}
          </SectionHeading>
        </div>

        <div className="grid grid-cols-1 gap-[var(--grid-gap)] md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>
      </section>
    </PageContent>
  );
}
