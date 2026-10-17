import type { Metadata } from "next";
import { CryptEmpty } from "@/components/layout/CryptEmpty";
import { SiteChrome } from "@/components/layout/SiteChrome";
import { cryptEmpty } from "@/lib/content/copy";

export const metadata: Metadata = {
  title: cryptEmpty.title,
  robots: { index: false, follow: true },
};

// Cripta vazia (spec 7.9) para URL sem rota: fora do grupo (site), então traz a própria moldura (D2).
export default function NotFound() {
  return (
    <SiteChrome>
      <CryptEmpty />
    </SiteChrome>
  );
}
