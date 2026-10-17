/** Copia texto; false quando o navegador nega (sem HTTPS, sem permissão, sem API). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
