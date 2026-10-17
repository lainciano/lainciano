#!/usr/bin/env bash
# Mede a Fase 8: JS inicial (gzip -9, só <script> do HTML) e Lighthouse mobile (mediana de N rodadas).
# Uso: scripts/measure.sh [rodadas=3]   — exige `pnpm build` feito; sobe `pnpm start` na porta 3100.
# Rode com a máquina parada. Saída em .measure/ (ignorado pelo git).
set -euo pipefail
cd "$(dirname "$0")/.."
RUNS="${1:-3}"; PORT=3100; OUT=.measure; mkdir -p "$OUT"
SLUG=$(ls content/projects | head -1 | sed 's/\.mdx$//'); POST=$(ls content/posts | head -1 | sed 's/\.mdx$//')
ROUTES=("/" "/about" "/work" "/work/$SLUG" "/blog" "/blog/$POST" "/contact")

pnpm exec next start -p $PORT >"$OUT/server.log" 2>&1 & SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for _ in $(seq 40); do curl -sf "http://localhost:$PORT/" >/dev/null && break; sleep 0.5; done

echo "## JS inicial (KB gzip -9 | brotli 11, o que a Vercel serve)"
for r in "${ROUTES[@]}"; do
  total=0; btotal=0
  for p in $(curl -s "http://localhost:$PORT$r" | grep -o '/_next/static/[^"]*\.js' | sort -u); do
    body=$(mktemp); curl -s "http://localhost:$PORT$p" >"$body"
    total=$((total + $(gzip -9 -c "$body" | wc -c)))
    btotal=$((btotal + $(node -e 'const z=require("zlib");process.stdout.write(String(z.brotliCompressSync(require("fs").readFileSync(process.argv[1])).length))' "$body")))
    rm -f "$body"
  done
  printf "%-28s %4d | %4d KB\n" "$r" $((total / 1024)) $((btotal / 1024))
done

echo "## Lighthouse mobile (mediana de $RUNS) — perf | LCP s | TBT ms | CLS"
for r in "${ROUTES[@]}"; do
  rows=()
  for i in $(seq "$RUNS"); do
    f="$OUT/lh$(echo "$r" | tr '/' '_')-$i.json"
    npx --yes lighthouse@12 "http://localhost:$PORT$r" --quiet --output=json --output-path="$f" \
      --chrome-flags="--headless=new --no-sandbox" >/dev/null 2>&1 || continue
    rows+=("$(node -e 'const j=require(process.argv[1]),a=j.audits;console.log([j.categories.performance.score*100,a["largest-contentful-paint"].numericValue/1000,a["total-blocking-time"].numericValue,a["cumulative-layout-shift"].numericValue].join(" "))' "$PWD/$f")")
  done
  printf '%s\n' "${rows[@]}" | node -e '
    const rs=require("fs").readFileSync(0,"utf8").trim().split("\n").map(l=>l.split(" ").map(Number));
    const med=i=>{const v=rs.map(r=>r[i]).sort((a,b)=>a-b);return v[Math.floor(v.length/2)]};
    console.log(process.argv[1].padEnd(28),med(0).toFixed(0),"|",med(1).toFixed(1),"|",med(2).toFixed(0),"|",med(3).toFixed(3))' "$r"
done
