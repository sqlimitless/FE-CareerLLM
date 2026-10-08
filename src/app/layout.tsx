import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "무엇이든 물어보세요.",
  description: "초대 링크로 시작하는 나만의 AI 채팅 공간",
  referrer: "no-referrer",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
