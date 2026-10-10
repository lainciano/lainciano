/** Preenche "{nome}" com valores; marcador sem valor fica visível (rótulos vêm do servidor por props). */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (Object.hasOwn(values, key) ? String(values[key]) : match));
}
