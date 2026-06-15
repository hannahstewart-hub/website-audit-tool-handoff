import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Is Your Website Actually Winning Private Clients? | Birdie",
  description:
    "Free 60-second audit for UK homecare agency owners. See whether your website is built to convert private-pay families, and what to fix first.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
