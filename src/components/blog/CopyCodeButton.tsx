"use client";

import { CopyButton } from "@/components/ui/CopyButton";
import { cleanCode } from "./code";

// O código vem do <pre> irmão no clique: o bloco é HTML do servidor, nada é duplicado em props.
const codeOf = (button: HTMLButtonElement) =>
  cleanCode(button.closest(".codigo")?.querySelector("pre")?.textContent ?? "");

// Os rótulos chegam por props do servidor: importar o copy.ts aqui duplicava ~15 KB de JS em todas as rotas.
type CopyCodeButtonProps = { label: string; doneLabel: string; failLabel: string };

export function CopyCodeButton({ label, doneLabel, failLabel }: CopyCodeButtonProps) {
  return (
    <CopyButton
      text={codeOf}
      label={label}
      doneLabel={doneLabel}
      failLabel={failLabel}
      className="codigo__copiar"
    />
  );
}
