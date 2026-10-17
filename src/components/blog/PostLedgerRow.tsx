import { TransitionLink } from "@/components/ui/TransitionLink";
import { formatDate, formatShortDate } from "@/lib/format";
import type { PostMeta } from "@/types/content";

type PostLedgerRowProps = {
  post: PostMeta;
  /** "short" no índice do Blog (o ano está no grupo); "full" na prévia da Home (D2). */
  dateStyle?: "full" | "short";
};

// Linha do livro-razão (mockup aprovado do Blog): data Mono, título serif, resumo e tags.
export function PostLedgerRow({ post, dateStyle = "full" }: PostLedgerRowProps) {
  const short = dateStyle === "short";
  return (
    <TransitionLink
      href={`/blog/${post.slug}`}
      className={`ledger-row focus-ring ${short ? "ledger-row--curta" : ""}`.trim()}
    >
      <time dateTime={post.createdAt} className="ledger-row__data">
        {short ? formatShortDate(post.createdAt) : formatDate(post.createdAt)}
      </time>
      <span className="ledger-row__corpo">
        <span className="ledger-row__titulo">{post.title}</span>
        <span className="ledger-row__resumo">{post.excerpt}</span>
      </span>
      <span className="ledger-row__tags">{post.tags.join(", ")}</span>
    </TransitionLink>
  );
}
