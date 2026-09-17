import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@fontsource/noto-sans-tc/chinese-traditional-400.css";
import "@fontsource/noto-sans-tc/chinese-traditional-500.css";
import "@fontsource/noto-sans-tc/latin-400.css";
import "@fontsource/noto-sans-tc/latin-500.css";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "CareMate HK · 康伴",
  description: "CareMate HK — organise personal health records and consultation notes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-HK" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
