import { TransitionLink } from "@/components/ui/TransitionLink";
import { library } from "@/lib/content/copy";
import type { PostMeta } from "@/types/content";

type PostNavProps = { older: PostMeta | null; newer: PostMeta | null };

// Anterior (mais antigo) e próximo (mais novo), sem wrap (spec 7.7, mockup; D4).
export function PostNav({ older, newer }: PostNavProps) {
  if (!older && !newer) return null;
  return (
    <nav aria-label={library.neighborsLabel} className="post-nav">
      {older && (
        <TransitionLink
          href={`/blog/${older.slug}`}
          transitionDirection="back"
          className="post-nav__link post-nav__link--anterior focus-ring"
        >
          <small className="post-nav__rotulo">{library.older}</small>
          <span className="post-nav__titulo">{older.title}</span>
        </TransitionLink>
      )}
      {newer && (
        <TransitionLink href={`/blog/${newer.slug}`} className="post-nav__link post-nav__link--proximo focus-ring">
          <small className="post-nav__rotulo">{library.newer}</small>
          <span className="post-nav__titulo">{newer.title}</span>
        </TransitionLink>
      )}
    </nav>
  );
}
