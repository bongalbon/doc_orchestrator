"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAuth = () => {
      const token = window.localStorage.getItem("jwtAccess") || window.localStorage.getItem("authToken");
      if (!token && pathname !== "/login") {
        router.push("/login");
        setIsAuthenticated(false);
      } else if (token && pathname === "/login") {
        router.push("/");
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(!!token);
      }
    };

    checkAuth();
  }, [pathname, router]);

  // Si non authentifié et pas sur la page login, on affiche rien pendant la redirection
  if (isAuthenticated === null || (!isAuthenticated && pathname !== "/login")) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black">
        <div className="animate-pulse flex items-center gap-2 text-[#ff5c00]">
          <span className="w-2 h-2 bg-[#ff5c00] rounded-full"></span>
          Chargement...
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
