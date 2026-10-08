"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";
import { createServicesStack } from "@/animations/servicesStack";
import { ServiceCard } from "@/components/ui/ServiceCard";
import { services } from "@/lib/content/copy";

// Seção de serviços com a animação de "cartas se juntando" no scroll.
// A timeline (ScrollTrigger scrub + matchMedia) está em /animations; aqui só
// localizamos os cards e delegamos o setup, devolvendo o cleanup ao useGSAP.
export function Services() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const section = sectionRef.current;
      if (!section) return;
      const cards = gsap.utils.toArray<HTMLElement>("[data-service-card]", section);
      return createServicesStack(
        section,
        cards,
        services.map((service) => service.rotation),
      );
    },
    { scope: sectionRef },
  );

  return (
    <section
      data-rail="Ofício"
      ref={sectionRef}
      id="services"
      className="content-container py-section"
      aria-label="Serviços"
    >
      <div className="relative grid grid-cols-1 gap-[var(--grid-gap)] md:grid-cols-3">
        {services.map((service) => (
          <ServiceCard key={service.title} service={service} />
        ))}
      </div>
    </section>
  );
}
