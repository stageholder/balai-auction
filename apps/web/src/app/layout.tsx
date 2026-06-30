import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import { SiteChrome } from "@/components/site-chrome";
import { AccountNav } from "@/components/account-nav";
import { Toaster } from "@/components/ui/sonner";
import { SITE } from "@/lib/site";
import "./globals.css";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-serif",
});
const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: SITE.name,
  description: SITE.tagline,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${serif.variable} ${sans.variable}`}>
      <body className="min-h-screen">
        <NextTopLoader
          color="#9b1b30"
          height={2}
          showSpinner={false}
          shadow="0 0 8px rgba(155,27,48,0.6)"
        />
        <SiteChrome accountSlot={<AccountNav />}>{children}</SiteChrome>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
