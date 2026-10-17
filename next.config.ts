import type { NextConfig } from "next";

// Sem `script-src`/`style-src` de propósito: o Next injeta scripts inline e a CSP restrita quebraria o site.
// Estas diretivas só fecham o que o site não usa (embutir em frame, <base>, plugins, forms para fora).
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.0.0.101"],
  experimental: {
    viewTransition: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
