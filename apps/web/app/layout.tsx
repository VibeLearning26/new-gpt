import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VibeGPT – Campus Study Agent",
  description:
    "AI-powered study assistant that generates exam-ready answers using your college's approved study materials. Grounded in facts, structured by marks.",
  keywords: ["study", "AI", "exam", "answers", "college", "RAG", "VibeGPT"],
  icons: {
    icon: "/logo.png?v=20260731",
    shortcut: "/logo.png?v=20260731",
    apple: "/logo.png?v=20260731",
  },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="antialiased">{children}</body>
    </html>
  );
}
