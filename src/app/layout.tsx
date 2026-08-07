import type { Metadata } from "next";
import { Geist_Mono, Poppins, Righteous } from "next/font/google";
import SiteHeader from "@/shared/components/SiteHeader";
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
  title: {
    default: "Music Garage",
    template: "%s · Music Garage",
  },
  description: "A collection of small games for people who like making noise together.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
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
      </body>
    </html>
  );
}
