const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

// Formata "2025-12-13" como "13 de Dezembro de 2025" sem depender de timezone.
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return `${day} de ${MONTHS[month - 1]} de ${year}`;
}

const SHORT_MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// "2026-03-25" → "25 mar" (linha do livro-razão: o ano já está no grupo). Sem timezone.
export function formatShortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day || month > 12) return iso;
  return `${day} ${SHORT_MONTHS[month - 1]}`;
}
