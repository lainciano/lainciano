"use client";

import { useLenis } from "lenis/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { hud } from "@/lib/content/copy";

type Mark = { id: string; label: string };

// Trilho vertical (≥ lg) com as seções [data-rail] da página; marca a seção no centro da viewport.
export function ProgressRail() {
  const pathname = usePathname();
  const lenis = useLenis();
  const [marks, setMarks] = useState<Mark[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-rail]"));
    sections.forEach((section, index) => {
      if (!section.id) section.id = `secao-${index + 1}`;
    });
    const frame = requestAnimationFrame(() => {
      setMarks(sections.map((section) => ({ id: section.id, label: section.dataset.rail ?? "" })));
    });
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    sections.forEach((section) => observer.observe(section));
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pathname]);

  if (marks.length < 2) return null;

  return (
    <nav aria-label={hud.railLabel} className="progress-rail">
      <ol>
        {marks.map((mark) => (
          <li key={mark.id}>
            <a
              href={`#${mark.id}`}
              aria-current={active === mark.id ? "location" : undefined}
              className="progress-rail__mark focus-ring"
              onClick={(event) => {
                const target = document.getElementById(mark.id);
                if (!target) return;
                event.preventDefault();
                if (lenis) lenis.scrollTo(target, { offset: -64 });
                else target.scrollIntoView();
              }}
            >
              <span className="progress-rail__label text-verb">{mark.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
