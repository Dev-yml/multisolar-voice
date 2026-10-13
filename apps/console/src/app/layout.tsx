import type { Metadata, Viewport } from "next";
import { Noto_Sans_Devanagari, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const ui = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const deva = Noto_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "500", "600", "700"], variable: "--font-deva", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Multi Solar Voice", template: "%s · Multi Solar Voice" },
  description: "Private console for the Multi Solar Voice Agent.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#1b2a30" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ui.variable} ${deva.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
