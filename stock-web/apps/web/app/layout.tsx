import { Sidebar } from "@/components/layout/Sidebar";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./theme-provider";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Agent学习",
  description: "基于多Agent架构的A股智能分析平台",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body
        className={geist.className}
        style={{
          background: "var(--bg-primary)",
          color: "var(--text-primary)",
        }}
      >
        <ThemeProvider>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main
              className="flex-1 overflow-y-auto relative h-full"
              style={{ background: "var(--bg-primary)" }}
            >
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
