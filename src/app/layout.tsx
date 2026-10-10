import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["SOFT", "opsz"],
  style: ["normal", "italic"],
  display: "swap",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Dinner Club — decide where to eat in 60 seconds",
  description: "Four friends. One link. Sixty seconds of swiping. One restaurant everyone agrees on.",
  appleWebApp: { capable: true, title: "Dinner Club", statusBarStyle: "default" },
  openGraph: {
    title: "Dinner Club",
    description: "You're invited to pick dinner. Sixty seconds of swiping — one restaurant everyone agrees on.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#f6f1e9",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="font-sans">
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
