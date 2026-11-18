import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AirShot — generador de video asistido por IA",
  description: "Historia → storyboard LLM → escenas con imagen/vídeo/narración IA → ensamblaje FFmpeg. Aplicación local single-user.",
  keywords: ["AirShot", "storyboard", "video", "IA", "TTS", "FFmpeg"],
  authors: [{ name: "AirShot" }],
  openGraph: {
    title: "AirShot",
    description: "Generador de video asistido por IA (local)",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}
