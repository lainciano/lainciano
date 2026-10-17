import type { Metadata } from "next";
import { FeaturedPost } from "@/components/blog/FeaturedPost";
import { LedgerRustle } from "@/components/blog/LedgerRustle";
import { PostLedgerRow } from "@/components/blog/PostLedgerRow";
import { PageContent } from "@/components/ui/PageContent";
import { RoomDoor } from "@/components/ui/RoomDoor";
import { RoomTitle } from "@/components/ui/RoomTitle";
import { ExplorerMark } from "@/interaction/relics/ExplorerMark";
import { RoomSound } from "@/interaction/sound/RoomSound";
import { pages, rooms } from "@/lib/content/copy";
import { splitLibrary } from "@/lib/content/library";
import { getPosts } from "@/lib/content/posts";
import { navLabel } from "@/lib/nav";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: pages.blog.heading,
  description: "Artigos sobre Next.js, animação, CSS e segurança.",
  path: "/blog",
});

// Biblioteca (spec 7.6): título gótico, abertura, destaque e livro-razão por ano. Sem WebGL, sem física.
export default function BlogPage() {
  const { featured, years } = splitLibrary(getPosts());

  return (
    <PageContent>
      <ExplorerMark area="blog" />
      <RoomSound name="biblioteca" />
      <section className="content-container biblioteca py-section">
        <RoomTitle title={rooms.blog.title} role={rooms.blog.role} />
        <p className="biblioteca__abertura">{pages.blog.intro}</p>

        <LedgerRustle>
          {featured && <FeaturedPost post={featured} />}
          {years.map(({ year, posts }) => (
            <section
              key={year}
              id={`ano-${year}`}
              data-rail={String(year)}
              aria-labelledby={`ano-${year}-titulo`}
              className="biblioteca__ano"
            >
              <h2 id={`ano-${year}-titulo`} className="biblioteca__ano-titulo">
                {year}
              </h2>
              <ol className="ledger">
                {posts.map((post) => (
                  <li key={post.slug}>
                    <PostLedgerRow post={post} dateStyle="short" />
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </LedgerRustle>
      </section>
      <RoomDoor href="/contact" room={rooms.contact.title} label={navLabel("/contact")} />
    </PageContent>
  );
}
