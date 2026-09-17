import type { Metadata } from "next";
import { Inter, Noto_Sans_TC } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const noto = Noto_Sans_TC({
  variable: "--font-noto",
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: "CareMate HK · 康伴",
  description: "CareMate HK — organise personal health records and consultation notes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-HK"
      className={`${inter.variable} ${noto.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
