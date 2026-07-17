import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hxchange — Room Swap Marketplace",
  description: "Find and swap hostel rooms with verified NITK students. No more WhatsApp group spam.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
