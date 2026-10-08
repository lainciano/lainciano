import type { Metadata } from "next";
import { CraftSeals } from "@/components/sections/CraftSeals";
import { LibraryPreview } from "@/components/sections/LibraryPreview";
import { AvailabilitySeal } from "@/components/ui/AvailabilitySeal";
import { RoomDoor } from "@/components/ui/RoomDoor";
import { RoomTitle } from "@/components/ui/RoomTitle";
import { home, rooms } from "@/lib/content/copy";
import { getPosts } from "@/lib/content/posts";
import { getProjects } from "@/lib/content/projects";
import { getSiteSettings } from "@/lib/content/site";
import { navLabel } from "@/lib/nav";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { Ruina } from "@/rooms/ruina/Ruina";
import { toSlabs } from "@/rooms/ruina/slabs";

const site = getSiteSettings();

export const metadata: Metadata = buildPageMetadata({
  title: site.siteName,
  description: site.tagline,
  path: "/",
});

// Home — Ruína (spec 7.2): título da sala, tese, arena (o h1 é o wordmark nela), Ofício, Biblioteca, porta.
export default function HomePage() {
  const slabs = toSlabs(getProjects());
  const posts = getPosts().slice(0, 3);

  return (
    <div className="mt-8 lg:mt-12">
      <RoomTitle as="p" title={rooms.home.title} role={rooms.home.role} className="content-container mb-[var(--space-lg)]" />
      <section
        data-rail={rooms.home.title}
        id="ruina"
        aria-label={rooms.home.title}
        className="content-container flex flex-col gap-[var(--space-md)] pb-section"
      >
        <div className="abertura">
          <p className="abertura__tese">{home.thesis}</p>
          <AvailabilitySeal text={site.availability} />
        </div>
        <Ruina siteName={site.siteName} slabs={slabs} />
      </section>
      <CraftSeals />
      <LibraryPreview posts={posts} />
      <RoomDoor href="/work" room={rooms.work.title} label={navLabel("/work")} />
    </div>
  );
}
