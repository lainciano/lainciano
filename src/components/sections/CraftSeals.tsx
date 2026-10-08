import { home, services } from "@/lib/content/copy";

// Ofício: os 3 serviços como selos (spec 7.2). Hover inclina 2° e acende a borda; sem física.
export function CraftSeals() {
  return (
    <section data-rail={home.craftHeading} id="oficio" aria-labelledby="oficio-titulo" className="content-container py-section">
      <h2 id="oficio-titulo" className="text-room-subtitle mb-[var(--space-lg)]">
        {home.craftHeading}
      </h2>
      <ul className="selos">
        {services.map((service) => (
          <li key={service.title} className="selo">
            <h3 className="selo__titulo">{service.title}</h3>
            <p className="selo__texto">{service.description}</p>
            <ul className="selo__tags">
              {service.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
