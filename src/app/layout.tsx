import type { Metadata } from "next";
import { Geist, Grenze_Gotisch, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { Loader } from "@/components/ui/Loader";
import { SmoothScroll } from "@/components/providers/SmoothScroll";
import { getSiteSettings } from "@/lib/content/site";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { getSiteUrl } from "@/lib/seo/url";
import "lenis/dist/lenis.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
});

const grenze = Grenze_Gotisch({
  variable: "--font-grenze",
  subsets: ["latin"],
  weight: ["500", "700", "900"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const site = getSiteSettings();
const seo = buildPageMetadata({
  title: site.siteName,
  description: site.tagline,
  path: "/",
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: site.siteName,
    template: `%s | ${site.siteName}`,
  },
  description: site.tagline,
  alternates: seo.alternates,
  openGraph: seo.openGraph,
  twitter: seo.twitter,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${instrumentSerif.variable} ${grenze.variable} ${jetbrains.variable}`}
    >
      <body className="antialiased">
        <Loader siteName={site.siteName} />
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
