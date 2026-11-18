import type { Metadata } from "next";
import { Geist, Geist_Mono, Bricolage_Grotesque, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display editorial: Bricolage Grotesque (titulares y marca)
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

// Acento serif itálico: Instrument Serif (palabras destacadas)
const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "AirShot — estudio local de cine con IA",
  description:
    "Historia → storyboard LLM → escenas con imagen/vídeo/narración IA → ensamblaje FFmpeg. Estudio de generación de vídeo single-user, 100% local.",
  keywords: ["AirShot", "storyboard", "video", "IA", "TTS", "FFmpeg", "cine"],
  authors: [{ name: "AirShot" }],
  openGraph: {
    title: "AirShot",
    description: "Estudio local de generación de vídeo con IA",
    siteName: "AirShot",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} ${instrument.variable} font-sans antialiased bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}
