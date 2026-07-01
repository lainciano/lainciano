import type { Metadata } from "next";
import { getSiteSettings } from "@/lib/content/site";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { About } from "@/components/sections/About";
import { LatestBlog } from "@/components/sections/LatestBlog";
import { Work } from "@/components/sections/Work";
import dynamic from "next/dynamic";

// Services abaixo da dobra — carrega GSAP/ScrollTrigger sob demanda (Sprint 5).
const Services = dynamic(
  () => import("@/components/sections/Services").then((mod) => mod.Services),
  { loading: () => <div className="content-container py-section" aria-hidden /> },
);

const site = getSiteSettings();

export const metadata: Metadata = buildPageMetadata({
  title: site.siteName,
  description: site.tagline,
  path: "/",
});

export default function HomePage() {
  return (
    <div className="mt-8 lg:mt-12">
      <About />
      <Work />
      <LatestBlog />
      <Services />
    </div>
  );
}
