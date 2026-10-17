import type { ComponentProps } from "react";
import { MDXRemote } from "next-mdx-remote/rsc";

type MdxContentProps = {
  source: string;
  /** Substituições de elementos do MDX (ex.: `pre` com "copiar" nos posts). */
  components?: ComponentProps<typeof MDXRemote>["components"];
};

// Renderiza corpo MDX/markdown em Server Components (Sprint 2).
// Estilos tipográficos em `.mdx-content` (globals.css).
export function MdxContent({ source, components }: MdxContentProps) {
  return (
    <div className="mdx-content">
      <MDXRemote source={source} components={components} />
    </div>
  );
}
