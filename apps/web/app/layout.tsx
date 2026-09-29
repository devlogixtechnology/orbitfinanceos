import { cookies } from "next/headers";
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import "./globals.css";

export const metadata: Metadata = {
  description: "Evidence-backed digital-asset operations",
  title: "OrbitOS",
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
