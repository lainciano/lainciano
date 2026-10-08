import { TransitionLink } from "@/components/ui/TransitionLink";
import { formatDate } from "@/lib/format";
import type { PostMeta } from "@/types/content";

// Linha do livro-razão (mockup aprovado do Blog): data Mono, título serif, resumo e tags.
export function PostLedgerRow({ post }: { post: PostMeta }) {
  return (
    <TransitionLink href={`/blog/${post.slug}`} className="ledger-row focus-ring">
      <time dateTime={post.createdAt} className="ledger-row__data">
        {formatDate(post.createdAt)}
      </time>
      <span className="ledger-row__corpo">
        <span className="ledger-row__titulo">{post.title}</span>
        <span className="ledger-row__resumo">{post.excerpt}</span>
      </span>
      <span className="ledger-row__tags">{post.tags.join(", ")}</span>
    </TransitionLink>
  );
}
