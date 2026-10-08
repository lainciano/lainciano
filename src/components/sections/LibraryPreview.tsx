import { PostLedgerRow } from "@/components/blog/PostLedgerRow";
import { TransitionLink } from "@/components/ui/TransitionLink";
import { home } from "@/lib/content/copy";
import type { PostMeta } from "@/types/content";

// Biblioteca (prévia): últimos posts no formato livro-razão (spec 7.2).
export function LibraryPreview({ posts }: { posts: PostMeta[] }) {
  return (
    <section data-rail={home.libraryHeading} id="biblioteca" aria-labelledby="biblioteca-titulo" className="content-container py-section">
      <div className="mb-[var(--space-lg)] flex flex-wrap items-end justify-between gap-[var(--space-sm)]">
        <h2 id="biblioteca-titulo" className="text-room-subtitle">
          {home.libraryHeading}
        </h2>
        <TransitionLink href="/blog" className="link-mono focus-ring">
          {home.libraryAll}
        </TransitionLink>
      </div>
      <ol className="ledger">
        {posts.map((post) => (
          <li key={post.slug}>
            <PostLedgerRow post={post} />
          </li>
        ))}
      </ol>
    </section>
  );
}
