import { TransitionLink } from "@/components/ui/TransitionLink";
import { formatDate } from "@/lib/format";
import type { PostMeta } from "@/types/content";

// Post mais recente em destaque (spec 7.6, mockup): data, título serif grande, resumo e tags.
export function FeaturedPost({ post }: { post: PostMeta }) {
  return (
    <TransitionLink href={`/blog/${post.slug}`} className="destaque focus-ring">
      <time dateTime={post.createdAt} className="destaque__data">
        {formatDate(post.createdAt)}
      </time>
      <span className="destaque__corpo">
        <span className="destaque__titulo">{post.title}</span>
        <span className="destaque__resumo">{post.excerpt}</span>
        <span className="destaque__tags">{post.tags.join(", ")}</span>
      </span>
    </TransitionLink>
  );
}
