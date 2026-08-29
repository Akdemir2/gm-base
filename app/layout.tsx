import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GM Base",
  description: "One GM. Every day. Onchain.",
  other: {
    "base:app_id": "6946df93d19763ca26ddc726",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
