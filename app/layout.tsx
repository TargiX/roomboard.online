import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.roomboard.online"),
  title: {
    default: "Roomboard - Launch Approval Room",
    template: "%s · Roomboard",
  },
  description:
    "Put the real launch material in one private room, invite the people who need to approve it, and close with a decision record.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    description:
      "Put the real launch material in one private room, invite the people who need to approve it, and close with a decision record.",
    siteName: "Roomboard",
    title: "Roomboard - Launch Approval Room",
    type: "website",
    url: "/",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Roomboard launch approval room preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    description:
      "Put the real launch material in one private room, invite the people who need to approve it, and close with a decision record.",
    images: ["/opengraph-image"],
    title: "Roomboard - Launch Approval Room",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
