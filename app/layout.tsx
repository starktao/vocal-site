import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "雅思词汇学习",
  description: "本地词汇学习系统"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
