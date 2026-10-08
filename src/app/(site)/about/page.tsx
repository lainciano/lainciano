import type { Metadata } from "next";
import { AvailabilitySeal } from "@/components/ui/AvailabilitySeal";
import { LitCaption } from "@/components/ui/LitCaption";
import { RoomDoor } from "@/components/ui/RoomDoor";
import { RoomTitle } from "@/components/ui/RoomTitle";
import { about, gravura, rooms, skills } from "@/lib/content/copy";
import { getSiteSettings } from "@/lib/content/site";
import { navLabel } from "@/lib/nav";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { Gravura } from "@/rooms/gravura/Gravura";

export const metadata: Metadata = buildPageMetadata({
  title: "Sobre",
  description:
    "Software Engineer — Full Stack, Mobile, Arquitetura de Sistemas e Cibersegurança.",
  path: "/about",
});

// Sobre — Gravura (spec 7.3): retrato em gravura, cargo, legenda que acende, disponibilidade,
// Inscrições (skills; a trajetória entra quando existir — pendência 14) e porta para o Blog.
export default function AboutPage() {
  const site = getSiteSettings();

  return (
    <div className="mt-8 lg:mt-12">
      <RoomTitle title={rooms.about.title} role={rooms.about.role} className="content-container mb-[var(--space-xl)]" />
      <section data-rail={rooms.about.title} id="gravura" aria-label={rooms.about.title} className="content-container gravura pb-section">
        <Gravura />
        <div className="gravura__texto">
          <p className="cargo">
            {about.roleTop}
            <br />
            {about.roleBottom}
          </p>
          <LitCaption paragraphs={about.paragraphs} keywords={gravura.captionKeywords} relic="leitura" />
          <AvailabilitySeal text={site.availability} />
        </div>
      </section>
      <section
        data-rail={gravura.inscriptionsHeading}
        id="inscricoes"
        aria-labelledby="inscricoes-titulo"
        className="content-container py-section"
      >
        <h2 id="inscricoes-titulo" className="text-room-subtitle mb-[var(--space-lg)]">
          {gravura.inscriptionsHeading}
        </h2>
        <ul className="placas" aria-label={gravura.skillsLabel}>
          {skills.map((skill) => (
            <li key={skill.label} className="placa">
              {skill.label}
            </li>
          ))}
        </ul>
      </section>
      <RoomDoor href="/blog" room={rooms.blog.title} label={navLabel("/blog")} />
    </div>
  );
}
