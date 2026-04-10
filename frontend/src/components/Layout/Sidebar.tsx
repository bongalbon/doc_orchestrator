"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiGet, WS_BASE } from "../../lib/api";

type ActivityResponse = {
  running_tasks: Array<{ task_id: number; agent_name: string; title: string; status: string }>;
  active_agents: string[];
};

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [activity, setActivity] = useState<ActivityResponse>({ running_tasks: [], active_agents: [] });

  const loadActivity = async () => {
    try {
      const data = await apiGet<ActivityResponse>("/tasks/activity/");
      setActivity(data);
    } catch (err) {
      console.error("Activity load failed", err);
    }
  };

  useEffect(() => {
    loadActivity();
    const ws = new WebSocket(`${WS_BASE}/ws/activity/`);
    ws.onmessage = () => {
      loadActivity();
    };
    return () => ws.close();
  }, []);

  const handleLogout = () => {
    window.localStorage.clear();
    router.push("/login");
  };

  const navLinks = [
    { href: "/", label: "Tableau de Bord", icon: "📊" },
    { href: "/agents", label: "Agents", icon: "🤖" },
    { href: "/tasks", label: "Tâches", icon: "📋" },
    { href: "/settings", label: "Paramètres", icon: "⚙️" },
  ];

  return (
    <aside className="w-64 border-r flex flex-col shrink-0 h-full overflow-y-auto" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}>
      {/* Header Sidebar */}
      <div className="p-4 border-b flex items-center gap-2 shrink-0" style={{ borderColor: "var(--border-color)" }}>
        <div className="w-7 h-7 rounded bg-[#ff5c00] flex items-center justify-center text-black font-bold text-sm">AI</div>
        <h1 className="font-serif text-xl leading-none">
          AI DOC<br/>
          <span className="text-sm font-sans text-[#888]">ORCHESTRATOR</span>
        </h1>
      </div>

      {/* Nav Menu */}
      <nav className="p-4 flex-1 flex flex-col gap-2">
        {navLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 p-2 rounded text-sm transition-colors ${
                isActive ? "bg-[#ff5c00]/10 text-[#ff5c00] font-medium border border-[#ff5c00]/20" : "text-[#888] hover:text-white hover:bg-white/5"
              }`}
            >
              <span className="text-lg">{link.icon}</span>
              {link.label}
            </Link>
          );
        })}

        {/* Live Activity Section */}
        <div className="mt-8 mb-6">
          <h2 className="text-xs font-mono uppercase tracking-wider text-[#888] mb-3 flex items-center">
            Activité en direct
            {activity.running_tasks.length > 0 && (
              <span className="ml-2 text-[#ff5c00] animate-pulse">●</span>
            )}
          </h2>
          <ul className="space-y-2">
            {activity.running_tasks.map((row) => (
              <li key={row.task_id} className="text-xs border p-2 rounded flex flex-col relative overflow-hidden" style={{ borderColor: "var(--border-color)" }}>
                <div className="absolute inset-0 bg-gradient-to-r from-[#ff5c00]/10 via-[#ff5c00]/5 to-transparent animate-pulse"></div>
                <div className="relative flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#ff5c00] rounded-full animate-spin"></span>
                  <span className="text-white block truncate flex-1">{row.title}</span>
                </div>
                <span className="relative text-[#ff5c00] mt-1">@{row.agent_name}</span>
              </li>
            ))}
            {activity.running_tasks.length === 0 && (
              <li className="text-xs text-[#555] italic">Aucune tâche en cours</li>
            )}
          </ul>
        </div>
      </nav>

      {/* Footer Sidebar */}
      <div className="p-4 border-t shrink-0" style={{ borderColor: "var(--border-color)" }}>
        <button
          onClick={handleLogout}
          className="w-full btn text-xs text-[#888] hover:text-[#ef4444] border-transparent hover:border-[#ef4444]"
        >
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
