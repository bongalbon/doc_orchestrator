"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet } from "../lib/api";
import NotificationCenter from "../components/notifications/NotificationCenter";

type AgentTask = {
  id: number;
  title: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  created_at?: string;
};

type Agent = {
  id: number;
  name: string;
  kind: "primary" | "sub";
  is_active: boolean;
};

type ActivityResponse = {
  running_tasks: Array<{ task_id: number; agent_name: string; title: string; status: string }>;
  active_agents: string[];
};

export default function Dashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [activity, setActivity] = useState<ActivityResponse>({ running_tasks: [], active_agents: [] });
  const [loading, setLoading] = useState(true);

  async function loadData() {
    try {
      const [agentData, taskData, activityData] = await Promise.all([
        apiGet<any>("/agents/"),
        apiGet<any>("/tasks/"),
        apiGet<ActivityResponse>("/tasks/activity/"),
      ]);

      // Handle both direct array and paginated response { results: [] }
      setAgents(Array.isArray(agentData) ? agentData : (agentData?.results || []));
      setTasks(Array.isArray(taskData) ? taskData : (taskData?.results || []));
      setActivity(activityResData(activityData));
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    } finally {
      setLoading(false);
    }
  }

  function activityResData(data: any): ActivityResponse {
    if (!data) return { running_tasks: [], active_agents: [] };
    return {
      running_tasks: Array.isArray(data.running_tasks) ? data.running_tasks : [],
      active_agents: Array.isArray(data.active_agents) ? data.active_agents : []
    };
  }

  useEffect(() => {
    loadData();
    // Refresh interval for dashboard stats
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    const safeTasks = Array.isArray(tasks) ? tasks : [];
    const safeAgents = Array.isArray(agents) ? agents : [];
    const safeActiveAgents = Array.isArray(activity.active_agents) ? activity.active_agents : [];

    return {
      total: safeTasks.length,
      done: safeTasks.filter(t => t?.status === "done").length,
      running: safeTasks.filter(t => t?.status === "running" || t?.status === "queued").length,
      failed: safeTasks.filter(t => t?.status === "failed").length,
      agentsCount: safeAgents.length,
      activeAgentsCount: safeActiveAgents.length
    };
  }, [tasks, agents, activity]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black">
        <div className="text-[#ff5c00] animate-pulse font-mono tracking-widest uppercase">Initialisation du Dashboard...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-[var(--bg-primary)]">
      <header className="mb-10">
        <h1 className="text-4xl font-serif mb-2">Tableau de Bord</h1>
        <p className="text-[#888] font-mono uppercase tracking-widest text-xs">Vue d'ensemble de l'orchestration</p>
      </header>

      <NotificationCenter />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="panel border border-[var(--border-color)] p-6 rounded-xl bg-[var(--bg-secondary)] hover:border-[#ff5c00]/50 transition-colors">
          <span className="block text-[#888] text-xs font-mono uppercase tracking-widest mb-2 font-bold">Total Tâches</span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-serif text-white">{stats.total}</span>
            <span className="text-[#888] text-sm">requêtes</span>
          </div>
        </div>

        <div className="panel border border-[var(--border-color)] p-6 rounded-xl bg-[var(--bg-secondary)] hover:border-[#10b981]/50 transition-colors">
          <span className="block text-[#10b981] text-xs font-mono uppercase tracking-widest mb-2 font-bold">Terminées</span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-serif text-white">{stats.done}</span>
            <span className="text-[#888] text-sm">({stats.total > 0 ? Math.round((stats.done/stats.total)*100) : 0}%)</span>
          </div>
        </div>

        <div className="panel border border-[var(--border-color)] p-6 rounded-xl bg-[var(--bg-secondary)] hover:border-[#ff5c00]/50 transition-colors">
          <span className="block text-[#ff5c00] text-xs font-mono uppercase tracking-widest mb-2 font-bold">En Cours</span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-serif text-white">{stats.running}</span>
            <span className="text-[#888] text-sm">actives</span>
          </div>
        </div>

        <div className="panel border border-[var(--border-color)] p-6 rounded-xl bg-[var(--bg-secondary)] hover:border-[#ef4444]/50 transition-colors">
          <span className="block text-[#ef4444] text-xs font-mono uppercase tracking-widest mb-2 font-bold">Échecs</span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-serif text-white">{stats.failed}</span>
            <span className="text-[#888] text-sm">alertes</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Tasks */}
        <section className="panel border border-[var(--border-color)] rounded-xl bg-[var(--bg-secondary)] overflow-hidden">
          <div className="p-4 border-b border-[var(--border-color)] bg-black/20 flex justify-between items-center">
            <h2 className="font-serif text-lg">Tâches Récentes</h2>
            <Link href="/tasks" className="text-xs text-[#ff5c00] hover:underline uppercase tracking-widest font-mono">Voir tout</Link>
          </div>
          <div className="p-0">
            {tasks.slice(0, 5).map((task) => (
              <div key={task.id} className="p-4 border-b border-[var(--border-color)] last:border-0 hover:bg-white/5 transition-colors flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-white mb-1">{task.title}</h3>
                  <span className="text-[10px] text-[#666] font-mono">ID: DOC-{task.id}</span>
                </div>
                <span className={`status ${task.status} text-[10px] px-2 py-1 rounded font-mono uppercase`}>
                  {task.status}
                </span>
              </div>
            ))}
            {tasks.length === 0 && (
              <div className="p-8 text-center text-[#555] italic text-sm">Aucune tâche enregistrée</div>
            )}
          </div>
        </section>

        {/* Fleet Status */}
        <section className="panel border border-[var(--border-color)] rounded-xl bg-[var(--bg-secondary)] overflow-hidden">
          <div className="p-4 border-b border-[var(--border-color)] bg-black/20 flex justify-between items-center">
            <h2 className="font-serif text-lg">État de la Flotte</h2>
            <Link href="/agents" className="text-xs text-[#ff5c00] hover:underline uppercase tracking-widest font-mono">Gérer</Link>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-4 mb-8">
              <div className="flex-1 text-center p-4 bg-black/30 rounded-lg border border-[var(--border-color)]">
                <span className="block text-2xl font-serif text-white">{stats.agentsCount}</span>
                <span className="text-[10px] text-[#888] uppercase tracking-widest font-mono">Agents Total</span>
              </div>
              <div className="flex-1 text-center p-4 bg-black/30 rounded-lg border border-[#10b981]/20">
                <span className="block text-2xl font-serif text-[#10b981]">{stats.activeAgentsCount}</span>
                <span className="text-[10px] text-[#10b981] uppercase tracking-widest font-mono">En ligne</span>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-mono text-[#888] uppercase tracking-widest mb-4">Activité des Agents</h3>
              {agents.map((agent) => {
                const isActive = activity.active_agents.includes(agent.name);
                return (
                  <div key={agent.id} className="flex items-center justify-between p-2 rounded hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-[#10b981] animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-[#333]'}`}></div>
                      <span className="text-sm">{agent.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-[#555] uppercase">{agent.kind}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* Quick Launch Section */}
      <section className="mt-10 p-8 border border-[#ff5c00]/20 rounded-xl bg-gradient-to-r from-[#ff5c00]/10 to-transparent flex items-center justify-between">
        <div>
          <h2 className="text-xl font-serif mb-2">Lancer une nouvelle orchestration</h2>
          <p className="text-sm text-[#888]">Prêt à assigner une tâche à l'un de vos agents spécialisés ?</p>
        </div>
        <Link href="/tasks" className="btn primary px-8 py-3 text-sm font-bold tracking-widest uppercase">
          Nouvelle Tâche 🚀
        </Link>
      </section>
    </div>
  );
}
