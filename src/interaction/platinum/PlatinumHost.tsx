"use client";

import { lazy, Suspense, useState, type ComponentType } from "react";
import type { PlatinumLabels } from "./labels";
import { platinumStore, usePlatinumOpen } from "./store";

type DialogProps = { labels: PlatinumLabels; open: boolean; onClose: () => void };

// A tela aparece uma vez na vida do visitante: o código dela só baixa na primeira abertura (D13).
const PlatinumDialog = lazy(() =>
  import("./PlatinumDialog")
    .then((module): { default: ComponentType<DialogProps> } => ({ default: module.PlatinumDialog }))
    .catch((): { default: ComponentType<DialogProps> } => ({ default: () => null })), // sem o chunk, nada abre: a platina continua guardada no estado
);

export function PlatinumHost({ labels }: { labels: PlatinumLabels }) {
  const open = usePlatinumOpen();
  const [loaded, setLoaded] = useState(false);
  if (open && !loaded) setLoaded(true); // derivado do render (padrão do React), não em efeito
  if (!loaded) return null;
  return (
    <Suspense fallback={null}>
      <PlatinumDialog labels={labels} open={open} onClose={() => platinumStore.close()} />
    </Suspense>
  );
}
