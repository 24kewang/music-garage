import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import TabNav from "@/shared/components/TabNav";
import "./globals.css";
import styles from "./layout.module.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <TabNav />
        <main className={styles.main}>{children}</main>
      </body>
    </html>
  );
}
