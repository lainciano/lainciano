"use client";

import { useEffect, useState, type RefObject } from "react";

type InViewOptions = { rootMargin?: string; threshold?: number; once?: boolean };

/** true enquanto o elemento cruza a viewport ampliada por rootMargin (padrão 400 px, spec 9.3). */
export function useInView(
  ref: RefObject<Element | null>,
  { rootMargin = "400px", threshold = 0, once = false }: InViewOptions = {},
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        setInView(entry.isIntersecting);
        if (once && entry.isIntersecting) observer.disconnect();
      },
      { rootMargin, threshold },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rootMargin, threshold, once]);

  return inView;
}
