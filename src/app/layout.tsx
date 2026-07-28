import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TPL사업부 주간자료 시스템",
  description: "TPL사업부 주간업무 자료 작성, 검토, 승인 시스템"
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
