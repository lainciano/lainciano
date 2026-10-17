"use client";

import { useCallback, useState } from "react";

type CopyEmailButtonProps = {
  email: string;
  className?: string;
  /** Exibe feedback curto após copiar (ms). */
  feedbackMs?: number;
};

// Copia e-mail para a área de transferência com feedback visual (Sprint 5).
export function CopyEmailButton({
  email,
  className = "",
  feedbackMs = 2000,
}: CopyEmailButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), feedbackMs);
    } catch {
      // Fallback para browsers sem clipboard API
      window.location.href = `mailto:${email}`;
    }
  }, [email, feedbackMs]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`link-underline focus-ring inline-flex min-h-11 items-center cursor-pointer bg-transparent text-left transition-colors duration-[var(--motion-fast)] hover:text-accent ${copied ? "text-accent" : ""} ${className}`.trim()}
      aria-label={copied ? "E-mail copiado" : `Copiar e-mail ${email}`}
      aria-live="polite"
    >
      {copied ? "Copiado ✓" : email}
    </button>
  );
}
