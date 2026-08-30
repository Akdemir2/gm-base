import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://gm-base-six.vercel.app"),
  title: "GM Base",
  description: "One GM. Every day. Onchain.",
  openGraph: {
    title: "GM Base",
    description: "Start your day on Base. Send one GM each UTC day and build your onchain streak.",
    url: "/",
    siteName: "GM Base",
    type: "website",
    images: [
      {
        url: "/gm-base-share-card.jpg",
        width: 1910,
        height: 1000,
        alt: "GM Base — One GM. Every day. Onchain.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GM Base",
    description: "Start your day on Base. Send one GM each UTC day and build your onchain streak.",
    images: ["/gm-base-share-card.jpg"],
  },
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
