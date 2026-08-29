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

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.name, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: SITE.publisher, url: SITE.repoUrl }],
  creator: SITE.publisher,
  alternates: { canonical: "/" },
  /*
   * Every icon lives in `public/` and is generated from `public/icon.svg` by
   * `npm run icons`. They are deliberately NOT `app/` file-convention icons: those
   * emit hashed URLs (`/icon.svg?a1b2c3`), and `manifest.ts` needs stable paths it
   * can name.
   *
   * Order matters — the SVG first, so anything that understands it uses the one
   * that stays sharp at every size. `/favicon.ico` is still worth shipping because
   * browsers probe that exact path on their own, before reading any of these tags.
   * The apple icon must be a PNG: iOS ignores SVG for `apple-touch-icon` and falls
   * back to a screenshot of the page.
   */
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "64x64" },
    ],
    shortcut: [{ url: "/favicon.ico", sizes: "16x16 32x32 48x48" }],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
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
      </body>
    </html>
  );
}
