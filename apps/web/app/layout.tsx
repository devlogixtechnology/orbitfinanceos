import { cookies } from "next/headers";
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import "./globals.css";

export const metadata: Metadata = {
  applicationName: "OrbitOS",
  description: "Evidence-backed digital-asset operations",
  icons: {
    apple: "/apple-touch-icon.png",
    icon: [
      { url: "/favicon.ico" },
      { sizes: "16x16", type: "image/png", url: "/favicon-16x16.png" },
      { sizes: "32x32", type: "image/png", url: "/favicon-32x32.png" },
      { sizes: "48x48", type: "image/png", url: "/favicon-48x48.png" },
      { type: "image/svg+xml", url: "/favicon.svg" },
    ],
  },
  manifest: "/site.webmanifest",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.orbitos.devlogix.com.pk",
  ),
  openGraph: {
    description: "Evidence-backed digital-asset operations",
    images: [{ alt: "OrbitOS", height: 630, url: "/og-image.png", width: 1200 }],
    siteName: "OrbitOS",
    title: "OrbitOS",
    type: "website",
  },
  title: {
    default: "OrbitOS",
    template: "%s | OrbitOS",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const themeCookie = (await cookies()).get("orbitos_theme")?.value;
  const theme = themeCookie === "light" || themeCookie === "dark" ? themeCookie : undefined;

  return (
    <html
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      data-theme={theme}
      lang="en"
    >
      <body>{children}</body>
    </html>
  );
}
