/** Texto do bloco para a área de transferência: sem as quebras de linha finais que o MDX acrescenta. */
export function cleanCode(text: string): string {
  return text.replace(/\n+$/, "");
}
