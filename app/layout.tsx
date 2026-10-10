import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "GD Arena — Speak with confidence",
  description:
    "Practice campus placement group discussions with an AI panel, live captions, and transcript-grounded feedback.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
