# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Personal portfolio site for Lain (Luciano Rodrigues) — Next.js 16 (App Router) + React 19 + TypeScript, 100% file-based content (MDX + JSON), no database. Dark editorial theme, GSAP/Lenis motion, View Transitions between routes. Content and copy are in Portuguese (pt-BR); code identifiers are in English.

## Commands

Package manager is **pnpm** (pinned via `packageManager` in `package.json`; migrated from npm — do not reintroduce `package-lock.json`).

```bash
pnpm dev      # start dev server
pnpm build    # production build
pnpm start    # serve production build
pnpm lint     # eslint (eslint-config-next core-web-vitals + typescript)
```

No test suite is configured. There is no `typecheck` script — use `pnpm exec tsc --noEmit` if type-checking is needed standalone.

## Architecture

### Content layer (no DB, no CMS)

All content is file-based, versioned in git. See `docs/data-layer.md` for full detail.

| Type | Location | Read via |
|---|---|---|
| Site config (name, tagline, email, social links) | `content/site.json` | `getSiteSettings()` in `src/lib/content/site.ts` |
| Projects | `content/projects/*.mdx` (frontmatter + MDX body) | `getProjects()`, `getProjectBySlug()` in `src/lib/content/projects.ts` |
| Blog posts | `content/posts/*.mdx` | `getPosts()`, `getPostBySlug()` in `src/lib/content/posts.ts` |

- Frontmatter is parsed with `gray-matter` (`src/lib/content/mdx.ts`) and validated against Zod schemas in `src/lib/content/schemas.ts` (`projectFrontmatterSchema`, `postFrontmatterSchema`).
- Routes `/work/[slug]` and `/blog/[slug]` use `generateStaticParams()` against these MDX files — pure SSG, no ISR.
- New content = add/edit `.mdx` (and image in `public/images/`) → commit → redeploy. There is no runtime content API.
- Never hardcode data in components — it belongs in `content/` or a typed content source.

### UI copy — separate from MDX content

System/UI copy (labels, headings, microcopy, CTA text) is centralized in `src/lib/content/copy.ts`, distinct from the MDX content layer above. New user-facing strings go there, not hardcoded in JSX — see `docs/content-system.md` for voice/tone, terminology, and capitalization rules. MDX body copy (post/project prose) stays in the `content/` frontmatter+body files instead.

### Design system — token-driven CSS

`src/app/globals.css` is the single source of truth for design tokens (`:root` + Tailwind v4 `@theme inline`): color, spacing (`--space-*`), motion durations/easings, z-index layers, border radius, typography scale. Full reference: `docs/design-system.md`.

- **Never hardcode a color, spacing, duration, or z-index value in a component** — add/use a token instead. If a value repeats in 2+ places, it should become a token.
- Per-route accent color override happens via `data-accent-color`/inline `--color-accent` on the route wrapper (e.g. `app/(site)/work/[slug]/layout.tsx`), not by hardcoding hex per component.
- Do **not** add new `--spacing-{xs,sm,md,lg,xl,2xl}` names to `@theme` — they collide with Tailwind's built-in size scale and silently break `max-w-*` utilities. Only `--spacing-section` (→ `py-section`) is exposed as a named Tailwind utility; other spacing tokens are used as raw CSS vars (`gap-[var(--space-lg)]`).
- Two type families: Instrument Serif (editorial headings) and Geist (display/body). Section/page headings are always serif; card titles are Geist bold uppercase — don't mix.
- Every interactive element needs `focus-visible` via the `.focus-ring` utility class.
- Respect `prefers-reduced-motion`: disable marquee, parallax, scroll-scrub, and long loader animations when set.

### Animation stack

- **GSAP** (`+ ScrollTrigger`, `@gsap/react`) for scroll-driven timelines, stagger, parallax — timelines live in `src/animations/*.ts`, one file per effect (e.g. `heroMarquee.ts`, `servicesStack.ts`).
- **Lenis** for smooth scroll, bridged via `src/lib/lenis-bridge.ts` (`pauseLenis()`/`resumeLenis()`) and `SmoothScroll` provider — must be paused/resumed around page transitions.
- **View Transitions API** (Next.js `experimental.viewTransition`, enabled in `next.config.ts`) drives route transitions, with a GSAP crossfade fallback (`src/animations/pageTransitionFallback.ts`) when the API is unsupported or reduced-motion is active. Full flow documented in `docs/view-transitions.md`.
  - `src/lib/navigation.ts` → `navigateWithTransition()` is the actual navigation logic (View Transition vs. fallback, direction-aware `nav-forward`/`nav-back`).
  - `src/lib/nav.ts` → just the static `NAV_LINKS` array shared by Header/Footer. Don't confuse the two files.
  - `TransitionLink` / `LinkHover` components and `useViewTransition` hook wrap this for use in components.
- Desktop-only spatial effects (card scatter/deck layouts) must degrade to a normal document-flow layout on mobile — never animation-gate content visibility (avoid FOIC: content must be legible without JS/scroll).

### Route structure

```
src/app/
  layout.tsx              # root: fonts, Loader, SmoothScroll provider
  (site)/
    template.tsx           # View Transitions wrapper
    layout.tsx
    page.tsx                # home
    about/, work/, work/[slug]/, blog/, blog/[slug]/, contact/
  sitemap.ts, robots.ts
```

Server Components by default (MDX/JSON reads, SEO, static markup); Client Components only where GSAP/Lenis/hover/interactivity require it.

### SEO

`buildPageMetadata()` in `src/lib/seo/metadata.ts` is the single place building per-route `Metadata` (Open Graph + Twitter card), given title/description/path — call this from every route's `generateMetadata`/`metadata` rather than constructing Metadata objects ad hoc. `src/lib/seo/url.ts` provides `getSiteUrl()`/`absoluteUrl()`.

### Contact

No backend/form submission — `/contact` only offers a `mailto:` CTA (`ContactCta`, built from `content/site.json` email) and a copy-to-clipboard button (`CopyEmailButton`). See `docs/contact.md`.

## Explicitly out of scope for this project

- No database or ORM (Prisma, Supabase, Neon, etc.)
- No headless CMS (Sanity, Contentful)
- No Framer Motion as the primary animation library (GSAP is)
- No `@studio-freight/react-lenis` (deprecated — use `lenis` directly)

## Docs

`docs/` has deeper references worth reading before large changes: `design-system.md` (tokens/components/a11y checklist), `content-system.md` (voice/tone/copy rules), `data-layer.md` (content shape), `tech-stack.md`, `view-transitions.md`, `seo.md`, `contact.md`, `sprints.md` (phased project plan/status).
