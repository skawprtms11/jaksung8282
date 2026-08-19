import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TPL사업부 주간자료 시스템",
  description: "TPL사업부 주간업무 자료 작성, 검토, 승인 시스템",
  applicationName: "TPL 주간자료",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "TPL 주간자료",
    statusBarStyle: "default"
  },
  icons: {
    icon: [
      { url: "/icons/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: [{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }]
  }
};

export const viewport: Viewport = {
  themeColor: "#007050"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
