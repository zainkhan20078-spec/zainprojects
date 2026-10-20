import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SidebarNav } from "@/components/nav";
import { INTEGRATION_STATUS } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Sedan Services · AI Dispatch Orchestration",
  description:
    "Enterprise automation layer bridging Limo Anywhere, Claude, Google Workspace and Slack for Personal Sedan Services of Las Vegas.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="mx-auto flex min-h-screen w-full max-w-[1560px] flex-col lg:flex-row">
          <SidebarNav integrations={INTEGRATION_STATUS} />
          <main className="min-w-0 flex-1 px-5 pb-16 pt-6 sm:px-8 lg:px-10 lg:pt-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
