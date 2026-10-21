# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Personal portfolio site for Lain (Luciano Rodrigues) — Next.js 16 (App Router) + React 19 + TypeScript, 100% file-based content (MDX + JSON), no database. Dark editorial theme, GSAP/Lenis motion, View Transitions between routes. Content and copy are in Portuguese (pt-BR); code identifiers are in English.

## Work in progress — "Cripta" redesign

A full redesign (gothic/brutal/hacker, gamified, GSAP + Three.js + Matter.js, WebAudio) was approved on 2026-10-08 and is being implemented in phases. **Before changing any UI, read `docs/superpowers/HANDOFF-cripta.md`** — it points to the spec (`docs/superpowers/specs/2026-10-08-portfolio-cripta-design.md`), the Phase 1 plan, the phase roadmap and the approved prototype (local copy under `docs/superpowers/specs/assets/cripta/`). Estado (2026-10-20): Fases 1–8 em produção (`main`, PR #3; remoto `lainciano/lainciano`). O ranking de produção usa um banco Upstash gratuito só dele (sem cartão; no limite do plano a API fecha em 503 e o jogo segue), com `RANKING_SECRET`/`ADMIN_TOKEN`/`KV_REST_API_*` só no ambiente `production`. Falta: checagens em dispositivo real. Etapa atual (2026-10-20): redesign v2 (feedback em `docs/superpowers/feedback-redesign-v2-2026-10-17.md`), frente 1 = **Limiar**, a intro cinematográfica que substitui o Portal (spec `docs/superpowers/specs/2026-10-20-limiar-design.md` aprovada; plano `docs/superpowers/plans/2026-10-20-limiar.md`, branch `feat/limiar`). Metas de performance não atingidas: JS inicial 207–216 KB gzip (meta 180) e LCP simulado ~2,4–3,3 s (meta 2,5; o piso não vem do JS). Those docs live in the gitignored `docs/` folder (local only). Where the spec conflicts with this file (e.g. the Upstash Redis exception for the ranking, the removal of the route banner/Loader), the spec wins.

## Commands

Package manager is **pnpm** (pinned via `packageManager` in `package.json`; migrated from npm — do not reintroduce `package-lock.json`).

```bash
pnpm dev      # start dev server
pnpm build    # production build
pnpm start    # serve production build
pnpm lint     # eslint (eslint-config-next core-web-vitals + typescript)
pnpm test     # vitest
```

Tests run with Vitest (`pnpm test`). There is no `typecheck` script — use `pnpm exec tsc --noEmit` if type-checking is needed standalone.

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
- Per-route accent color override happens via `data-accent-color`/inline `--color-accent` on the route wrapper, not by hardcoding hex per component.
- Do **not** add new `--spacing-{xs,sm,md,lg,xl,2xl}` names to `@theme` — they collide with Tailwind's built-in size scale and silently break `max-w-*` utilities. Only `--spacing-section` (→ `py-section`) is exposed as a named Tailwind utility; other spacing tokens are used as raw CSS vars (`gap-[var(--space-lg)]`).
- Two type families: Instrument Serif (editorial headings) and Geist (display/body). Section/page headings are always serif; card titles are Geist bold uppercase — don't mix.
- Every interactive element needs `focus-visible` via the `.focus-ring` utility class.
- Respect `prefers-reduced-motion`: disable marquee, parallax, scroll-scrub, and long loader animations when set.

### Animation stack

- **GSAP** (`+ ScrollTrigger`, `@gsap/react`) for scroll-driven timelines, stagger, parallax — timelines live in `src/animations/*.ts`, one file per effect (e.g. `servicesStack.ts`).
- Núcleo de interação em `src/interaction/` (cursor, som WebAudio, relíquias, HUD, Limiar, modo leitura). Salas em `src/rooms/` (Ruína na Home, Gravura no Sobre, Relicário em /work, Câmara nos cases): ilhas client pequenas sobre HTML do servidor; `three` e `matter-js` só em `src/rooms/*/scene.ts`/`world.ts`, carregados por `import()`, nunca no JS inicial — as cenas do Relicário e da Câmara só nascem na primeira intenção de uso (`useIntentReady`: ponteiro, toque, foco ou 8 s após o `load`), para não pesar no TBT. Elementos que seguem o cursor são `position: fixed` normais em portal (nunca popover); o GSAP anima só um filho interno. Loops no `gsap.ticker`, no máx. 2 contextos WebGL (`src/rooms/shared/webgl.ts`). Spec: `docs/superpowers/specs/2026-10-08-portfolio-cripta-design.md`.
- **Limiar** (`src/interaction/limiar/`, intro da 1ª visita; substitui o Portal; spec `docs/superpowers/specs/2026-10-20-limiar-design.md`): a casca `Limiar.tsx` (`<dialog id="limiar">`, ato Som, HUD próprio, "pular") fica no JS inicial e o `LIMIAR_BOOT_SCRIPT` (`src/interaction/boot.ts`) o abre antes da hidratação (nunca para robô/webdriver, com a chave de som já gravada ou em modo leitura); os atos 2 a 5 vivem na ilha `LimiarStage`, carregada por `import()` só com o Limiar aberto. Fechar passa sempre por `limiarStore.close(motivo)`; a relíquia `limiar` é concedida **ao fechar, depois de `dialog.close()`**, para o toast e a platina aparecerem sobre a página real (e vale mesmo com pular/Esc se já foi pega). O comando `limiar` do console reabre a entrada (só a dica em modo leitura; sem nova concessão). A contagem de relíquias deriva do catálogo (`RELICS.length`, hoje 11), nunca de número fixo. Módulos lazy do Limiar não podem importar `react-dom` (`flushSync`/`createPortal`): isso reagrupa os chunks de framework do Turbopack e soma JS inicial em todas as rotas.
- Console global em `src/interaction/console/` (`/` fora de campos, HUD, menu mobile): lógica pura em `parse.ts`/`commands.ts` (efeitos aplicados pela ilha `ConsoleSession`, carregada por `import()` na 1ª abertura via `LazyConsoleSession`), `<dialog>` em `ConsoleOverlay`; dados do servidor via `SiteChrome` (`src/components/layout/SiteChrome.tsx`), que também envolve o `src/app/not-found.tsx` (404 na raiz, `<h1>` estático `CryptEmpty`; console e som só no cliente). Relíquia ASCII do Contato em `src/rooms/terminal/` (three + AsciiEffect só por `import()`).
- Biblioteca (`/blog`, `/blog/[slug]`): lógica pura em `src/lib/content/library.ts` (destaque, anos, vizinhos sem wrap) e `src/lib/reading.ts` (progresso e relíquia Leitor, que só conta rolagem após input do visitante e dwell só com aba visível); ilhas pequenas em `src/components/blog/` (`LedgerRustle` som de folha, `ReadingBar` em portal acima do HUD, `CopyCodeButton`); o `pre` do MDX dos posts é `CodeBlock` via `MdxContent components`. Ilhas cliente não importam o `copy.ts` inteiro (custou +15,6 KB em todas as rotas): os rótulos descem do servidor por props.
- Platina e livro: API em `src/app/api/{run,ranking}` sobre `src/lib/ranking/` (lógica pura testada: `validate`, `token` HMAC, `rules`, `store`/`limiter` atrás de interfaces; `handlers.ts` testado com `Request` real; `server.ts` liga o ambiente; loja em memória só em dev ou com `RANKING_MEMORY_STORE=1`). Fase 7: com `KV_REST_API_URL/TOKEN` (ou `UPSTASH_REDIS_REST_*`) a API usa o Upstash Redis (`upstashStore.ts`: `record` atômico em Lua com lápide, `top` = 1 `ZRANGE` com o apelido no membro do ZSET; limitadores `@upstash/ratelimit` que fecham em falha, com tetos globais; prefixo de chaves por `VERCEL_ENV`); na Vercel só `production`/`preview` usam o Redis, o resto responde 503. Moderação: `GET /api/ranking/moderation` (lista com `runId`) e `DELETE /api/ranking/<runId>`, ambos com `Authorization: Bearer <ADMIN_TOKEN>`. Segredos `RANKING_SECRET`/`ADMIN_TOKEN` por ambiente (Vercel env; `.env.local` só em dev, ver `.env.example`); sem segredo a API responde 503 e o jogo segue. **Produção exige um banco Upstash só dela** (o prefixo não isola credenciais) e `.vercelignore` protege o `vercel deploy` local (o CLI não lê o `.gitignore`). Tela de platina carregada por `import()` (`PlatinumHost`; rótulos por props com `fillTemplate`, sem `copy.ts` nas ilhas cliente), livro no Contato (`PlatinumBook` + `bookStore`). As pausas do Lenis são contadas e a da navegação tem dono (`holdNavigation`/`releaseNavigationHold`). Cabeçalhos de segurança no `next.config.ts` (CSP mínima sem `script-src`).
- **Carregamento tardio (Fase 8):** GSAP, ScrollTrigger e Lenis não estão no JS inicial. `src/lib/motion.ts` expõe `getGsap()` (síncrono, `null` se ainda não chegou — animações de gesto pulam), `whenGsap(run)` (efeitos contínuos esperam e cancelam no cleanup) e `afterLoadIdle`; `SmoothScroll` cria o Lenis depois do `load` e o guarda em `lenis-bridge` (`getLenis()`). Não importe `gsap`/`lenis` estaticamente em código que roda no layout. A Ruína e a Gravura só criam matter-js/three no 1º gesto (`useIntentReady`).
- **Lenis** for smooth scroll, bridged via `src/lib/lenis-bridge.ts` (`pauseLenis()`/`resumeLenis()`) and `SmoothScroll` provider — must be paused/resumed around page transitions.
- **View Transitions API** (Next.js `experimental.viewTransition`, enabled in `next.config.ts`) drives route transitions, with a GSAP crossfade fallback (`src/animations/pageTransitionFallback.ts`) when the API is unsupported or reduced-motion is active. Full flow documented in `docs/view-transitions.md`.
  - `src/lib/navigation.ts` → `navigateWithTransition()` is the actual navigation logic (View Transition vs. fallback, direction-aware `nav-forward`/`nav-back`).
  - `src/lib/nav.ts` → just the static `NAV_LINKS` array shared by HUD/Footer. Don't confuse the two files.
  - `TransitionLink` / `LinkHover` components and `useViewTransition` hook wrap this for use in components.
- Desktop-only spatial effects must degrade to a normal document-flow layout on mobile — never animation-gate content visibility (avoid FOIC: content must be legible without JS/scroll).

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

No backend/form submission (the only API is the platina book, `src/app/api/{run,ranking}`). `/contact` is the Terminal room: ASCII altar (`src/rooms/terminal/`), an embedded console (`LazyConsoleSession`), the visible email from `content/site.json` with a `CopyButton` and a `mailto:` link (`buildMailtoUrl`), plus the relic inventory. The footer keeps `CopyEmailButton`. See `docs/contact.md` (may be stale).

## Explicitly out of scope for this project

- No database or ORM (Prisma, Supabase, Neon, etc.). Exceção aprovada: Upstash Redis apenas para o ranking da platina (spec Cripta 8.5); provisionado na Fase 7 (Preview/Development no projeto Vercel `lainciano` (domínio `lainciano.vercel.app`), integração `lainciano-ranking`).
- No headless CMS (Sanity, Contentful)
- No Framer Motion as the primary animation library (GSAP is)
- No `@studio-freight/react-lenis` (deprecated — use `lenis` directly)

## Docs

`docs/` has deeper references worth reading before large changes: `design-system.md` (tokens/components/a11y checklist), `content-system.md` (voice/tone/copy rules), `data-layer.md` (content shape), `tech-stack.md`, `view-transitions.md`, `seo.md`, `contact.md`, `sprints.md` (phased project plan/status).
