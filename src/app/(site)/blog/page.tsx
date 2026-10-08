import type { Metadata } from "next";
import { BlogCard } from "@/components/ui/BlogCard";
import { RoomSound } from "@/interaction/sound/RoomSound";
import { PageContent } from "@/components/ui/PageContent";
import { RoomDoor } from "@/components/ui/RoomDoor";
import { RoomTitle } from "@/components/ui/RoomTitle";
import { pages, rooms } from "@/lib/content/copy";
import { getPosts } from "@/lib/content/posts";
import { navLabel } from "@/lib/nav";
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
      <RoomSound name="biblioteca" />
      <section className="content-container py-section">
        <RoomTitle title={rooms.blog.title} role={rooms.blog.role} className="mb-[var(--space-xl)]" />

        <div className="grid grid-cols-1 gap-[var(--grid-gap)] md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>
      </section>
      <RoomDoor href="/contact" room={rooms.contact.title} label={navLabel("/contact")} />
    </PageContent>
  );
}
