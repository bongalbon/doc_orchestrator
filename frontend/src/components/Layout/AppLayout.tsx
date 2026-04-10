"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import AuthWrapper from "./AuthWrapper";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  return (
    <AuthWrapper>
      <div className="flex h-screen w-full overflow-hidden bg-[var(--bg-primary)]">
        {!isLoginPage && <Sidebar />}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {children}
        </main>
      </div>
    </AuthWrapper>
  );
}
