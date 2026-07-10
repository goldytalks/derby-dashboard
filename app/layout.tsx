import type { Metadata, Viewport } from "next";
import {
  Archivo,
  Archivo_Black,
  Cormorant_Garamond,
  Space_Grotesk,
} from "next/font/google";
import "./globals.css";

const displayFont = Archivo_Black({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  fallback: ["Impact", "sans-serif"],
});

const dataFont = Space_Grotesk({
  weight: ["500", "700"],
  subsets: ["latin"],
  variable: "--font-data",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

const bodyFont = Archivo({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  fallback: ["Helvetica", "Arial", "sans-serif"],
});

const editorialFont = Cormorant_Garamond({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-editorial",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export const metadata: Metadata = {
  title: "Novig Booth | novig: for the cup",
  description:
    "One photo becomes a team-styled portrait inside a square, shareable Gallery Slip.",
};

export const viewport: Viewport = {
  themeColor: "#0E0E12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${dataFont.variable} ${bodyFont.variable} ${editorialFont.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
