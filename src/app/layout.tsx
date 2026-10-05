import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "CareMate HK · 康伴",
  description: "CareMate HK — organise personal health records and consultation notes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-HK" className="h-full antialiased">
      <body className="min-h-full font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
