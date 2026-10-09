"use client";

import { CopyButton } from "@/components/ui/CopyButton";
import { library } from "@/lib/content/copy";
import { cleanCode } from "./code";

// O código vem do <pre> irmão no clique: o bloco é HTML do servidor, nada é duplicado em props.
const codeOf = (button: HTMLButtonElement) =>
  cleanCode(button.closest(".codigo")?.querySelector("pre")?.textContent ?? "");

export function CopyCodeButton() {
  return (
    <CopyButton
      text={codeOf}
      label={library.copy}
      doneLabel={library.copied}
      failLabel={library.copyFailed}
      className="codigo__copiar"
    />
  );
}
