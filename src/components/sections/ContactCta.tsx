import { contactCta } from "@/lib/content/copy";
import { buildMailtoUrl } from "@/lib/mailto";

type ContactCtaProps = {
  email: string;
};

// CTA principal da página de contato — abre o cliente de e-mail do usuário (sem backend).
export function ContactCta({ email }: ContactCtaProps) {
  const href = buildMailtoUrl(email, {
    subject: contactCta.mailtoSubject,
    body: contactCta.mailtoBody,
  });

  return (
    <div className="flex flex-col gap-6 rounded-card border border-accent/60 bg-secondary/10 p-8 lg:p-10">
      <div className="flex flex-col gap-3">
        <h2 className="text-small-heading text-foreground">{contactCta.heading}</h2>
        <p className="text-large-body text-foreground/90">{contactCta.description}</p>
      </div>

      <a
        href={href}
        className="caps focus-ring inline-flex w-fit items-center justify-center rounded-full bg-accent px-8 py-4 text-foreground transition-colors duration-[var(--motion-base)] ease-out-soft hover:bg-hover"
      >
        {contactCta.button}
      </a>

      <p className="text-small-body text-muted">
        {contactCta.hint} <span className="text-foreground/80">{email}</span>
      </p>
    </div>
  );
}
