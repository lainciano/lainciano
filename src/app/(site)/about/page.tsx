import type { Metadata } from "next";
import { About } from "@/components/sections/About";
import { buildPageMetadata } from "@/lib/seo/metadata";
import dynamic from "next/dynamic";

const Services = dynamic(
  () => import("@/components/sections/Services").then((mod) => mod.Services),
  { loading: () => <div className="content-container py-section" aria-hidden /> },
);

export const metadata: Metadata = buildPageMetadata({
  title: "Sobre",
  description:
    "Software Engineer — Full Stack, Mobile, Arquitetura de Sistemas e Cibersegurança.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <div className="mt-8 lg:mt-12">
      <About />
      <Services />
    </div>
  );
}
