import type { Metadata, Viewport } from "next";
import { Geist_Mono, Poppins, Righteous } from "next/font/google";
import SiteFooter from "@/shared/components/SiteFooter";
import SiteHeader from "@/shared/components/SiteHeader";
import { SITE } from "@/shared/site";
import "./globals.css";
import styles from "./layout.module.css";

/** Display face. Reserved for the wordmark and page titles, never body copy. */
const righteous = Righteous({
  variable: "--font-righteous",
  weight: "400",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
});

/** Kept for the pitch readouts, which need tabular figures. */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Cloudflare Web Analytics. Cookieless and aggregate-only — see the privacy policy.
 * Injected manually rather than through Cloudflare's automatic HTML rewriting so
 * that the beacon is visible in this file and covered by the CSP in
 * `public/_headers` rather than appearing from nowhere.
 *
 * Absent when the token is unset, which keeps local development and preview
 * deployments out of the production numbers.
 */
const beaconToken = process.env.NEXT_PUBLIC_CF_BEACON_TOKEN;

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.name, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: SITE.publisher, url: SITE.repoUrl }],
  creator: SITE.publisher,
  alternates: { canonical: "/" },
  // favicon.ico lives at src/app/favicon.ico and is picked up by convention; the SVG
  // is what modern browsers and the web app manifest actually use.
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: SITE.name,
    description: SITE.description,
    url: SITE.url,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.name,
    description: SITE.description,
  },
};

export const viewport: Viewport = {
  // Matches --color-bg, so the browser chrome does not flash a light band above the
  // page on mobile. One dark theme, so there is only one value to give.
  themeColor: "#0d0d16",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior= "smooth"
      className={`${righteous.variable} ${poppins.variable} ${geistMono.variable}`}
    >
      <body>
        <a href="#main" className="skipLink">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className={styles.main}>
          {children}
        </main>
        <SiteFooter />

        {beaconToken ? (
          <script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: beaconToken })}
          />
        ) : null}
      </body>
    </html>
  );
}
