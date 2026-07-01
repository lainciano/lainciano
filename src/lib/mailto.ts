/**
 * Monta URL mailto: com assunto e corpo opcionais (página de contato).
 *
 * Usa encodeURIComponent (espaço → %20) em vez de URLSearchParams (espaço → "+"):
 * em mailto: (RFC 6068) o "+" é literal, então URLSearchParams faria o corpo chegar
 * como "Olá!+Gostaria+de+..." no cliente de e-mail.
 */
export function buildMailtoUrl(
  email: string,
  options?: { subject?: string; body?: string },
): string {
  const params: string[] = [];
  if (options?.subject) params.push(`subject=${encodeURIComponent(options.subject)}`);
  if (options?.body) params.push(`body=${encodeURIComponent(options.body)}`);

  const query = params.join("&");
  return query ? `mailto:${email}?${query}` : `mailto:${email}`;
}
