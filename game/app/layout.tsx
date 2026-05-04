import type { Metadata } from "next";
import { Caveat } from "next/font/google";
import "./globals.css";

const notebookHand = Caveat({
  subsets: ["latin"],
  variable: "--font-notebook-hand",
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "CaseBreaker AI — The Harlow Manor Affair",
  description: "An AI-powered interactive murder mystery",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${notebookHand.variable}`}>
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
