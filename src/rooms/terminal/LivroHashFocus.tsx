"use client";

import { useEffect } from "react";

// Chegou por /contact#livro: o foco vai ao título do livro (o âncora sozinho não move o foco do teclado).
export function LivroHashFocus() {
  useEffect(() => {
    if (window.location.hash !== "#livro") return;
    const frame = requestAnimationFrame(() => document.getElementById("livro-titulo")?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  return null;
}
