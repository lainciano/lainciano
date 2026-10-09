import type { ComponentProps } from "react";
import { library } from "@/lib/content/copy";
import { CopyCodeButton } from "./CopyCodeButton";

// Bloco de código do post (spec 7.7): borda, rolagem própria (focável, para rolar com as setas) e "copiar".
export function CodeBlock(props: ComponentProps<"pre">) {
  return (
    <div className="codigo">
      <pre {...props} tabIndex={0} role="region" aria-label={library.codeLabel} />
      <CopyCodeButton label={library.copy} doneLabel={library.copied} failLabel={library.copyFailed} />
    </div>
  );
}

/** Componentes do MDX dos posts (os cases não têm código e seguem com o MDX padrão). */
export const POST_MDX_COMPONENTS = { pre: CodeBlock };
