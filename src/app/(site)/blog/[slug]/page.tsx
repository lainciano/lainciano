import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { POST_MDX_COMPONENTS } from "@/components/blog/CodeBlock";
import { PostNav } from "@/components/blog/PostNav";
import { ReadingBar } from "@/components/blog/ReadingBar";
import { MdxContent } from "@/components/content/MdxContent";
import { RoomDoor } from "@/components/ui/RoomDoor";
import { TransitionLink } from "@/components/ui/TransitionLink";
import { ExplorerMark } from "@/interaction/relics/ExplorerMark";
import { RoomSound } from "@/interaction/sound/RoomSound";
import { pages, rooms } from "@/lib/content/copy";
import { getPostNeighbors } from "@/lib/content/library";
import { getPostBySlug, getPosts } from "@/lib/content/posts";
import { formatDate } from "@/lib/format";
import { navLabel } from "@/lib/nav";
import { buildPageMetadata } from "@/lib/seo/metadata";

type Params = { slug: string };

// Slug fora do conteúdo é URL sem rota: cai no 404 da raiz, que sai renderizado no servidor (sem JS).
export const dynamicParams = false;

export function generateStaticParams() {
  return getPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
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

// Post — leitura (spec 7.7, mockup): cabeçalho, corpo em 66ch, anterior/próximo e a porta para o Contato (D5).
export default async function PostPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();
  const { older, newer } = getPostNeighbors(getPosts(), post.slug);

  return (
    <>
      <ExplorerMark area="post" />
      <RoomSound name="biblioteca" />
      <ReadingBar key={post.slug} targetId="corpo" />
      <article className="content-container leitura py-section">
        <TransitionLink href="/blog" transitionDirection="back" className="link-mono focus-ring leitura__voltar">
          {pages.blog.back}
        </TransitionLink>

        <header className="leitura__cabeca">
          <p className="leitura__linha">
            <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
            <span>{post.tags.join(", ")}</span>
          </p>
          <h1 className="leitura__titulo">{post.title}</h1>
          <p className="leitura__standfirst">{post.excerpt}</p>
        </header>

        <div id="corpo" className="leitura__corpo">
          <MdxContent source={post.content} components={POST_MDX_COMPONENTS} />
        </div>

        <PostNav older={older} newer={newer} />
      </article>
      <RoomDoor href="/contact" room={rooms.contact.title} label={navLabel("/contact")} />
    </>
  );
}
