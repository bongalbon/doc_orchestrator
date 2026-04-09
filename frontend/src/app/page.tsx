"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Agent = {
  id: number;
  name: string;
  kind: "primary" | "sub";
  specialty: string;
  parent: number | null;
  is_active: boolean;
};

type AgentTask = {
  id: number;
  title: string;
  prompt: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  requested_agent_name?: string;
  assigned_agent_name?: string;
  result: string;
  error_message: string;
};

type ActivityResponse = {
  running_tasks: Array<{ task_id: number; agent_name: string; title: string; status: string }>;
  active_agents: string[];
};

type AdminUser = {
  id: number;
  username: string;
  email: string;
  is_superuser: boolean;
  roles: string[];
};

type AuditEntry = {
  id: number;
  action: string;
  actor: string | null;
  task_id: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000/api";

function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const access = window.localStorage.getItem("jwtAccess");
  if (access) return { Authorization: `Bearer ${access}` };
  const token = window.localStorage.getItem("authToken");
  return token ? { Authorization: `Token ${token}` } : {};
}

async function refreshAccessToken(): Promise<boolean> {
  const refresh = window.localStorage.getItem("jwtRefresh");
  if (!refresh) return false;
  const res = await fetch(`${API_BASE}/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { access: string };
  window.localStorage.setItem("jwtAccess", data.access);
  return true;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    ...init,
    headers: { ...authHeaders(), ...(init?.headers || {}) },
  });
  if (res.status === 401 && (await refreshAccessToken())) {
    return apiFetch<T>(path, init);
  }
  if (!res.ok) throw new Error(`${init?.method || "GET"} ${path} failed`);
  return res.json();
}

async function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path);
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export default function Home() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [activity, setActivity] = useState<ActivityResponse>({ running_tasks: [], active_agents: [] });
  const [taskTitle, setTaskTitle] = useState("Rédiger la note stratégique");
  const [taskPrompt, setTaskPrompt] = useState("");
  const [targetAgentId, setTargetAgentId] = useState<string>("");
  const [agentName, setAgentName] = useState("");
  const [agentKind, setAgentKind] = useState<"primary" | "sub">("sub");
  const [specialty, setSpecialty] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin12345");
  const [loggedIn, setLoggedIn] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);

  const primaryAgents = useMemo(() => agents.filter((a) => a.kind === "primary"), [agents]);

  async function loadAll() {
    const [agentData, taskData, activityData] = await Promise.all([
      apiGet<Agent[]>("/agents/"),
      apiGet<AgentTask[]>("/tasks/"),
      apiGet<ActivityResponse>("/tasks/activity/"),
    ]);
    setAgents(agentData);
    setTasks(taskData);
    setActivity(activityData);
    const [usersData, logsData] = await Promise.all([
      apiGet<{ users: AdminUser[] }>("/admin/users/").catch(() => ({ users: [] })),
      apiGet<{ logs: AuditEntry[] }>("/admin/audit/").catch(() => ({ logs: [] })),
    ]);
    setAdminUsers(usersData.users);
    setAuditLogs(logsData.logs);
  }

  useEffect(() => {
    const token = window.localStorage.getItem("authToken");
    setLoggedIn(Boolean(token));
    if (token) {
      loadAll().catch(console.error);
      const ws = new WebSocket("ws://127.0.0.1:8000/ws/activity/");
      ws.onmessage = () => {
        loadAll().catch(console.error);
      };
      return () => ws.close();
    }
  }, []);

  async function login(e: FormEvent) {
    e.preventDefault();
    const response = await apiPost<{ token: string; access?: string; refresh?: string }>("/auth/login/", {
      username,
      password,
    });
    window.localStorage.setItem("authToken", response.token);
    if (response.access) window.localStorage.setItem("jwtAccess", response.access);
    if (response.refresh) window.localStorage.setItem("jwtRefresh", response.refresh);
    setLoggedIn(true);
    await loadAll();
  }

  async function registerAndLogin() {
    await apiPost<{ token: string; access?: string; refresh?: string }>("/auth/register/", {
      username,
      password,
      role: "manager",
    });
    const response = await apiPost<{ token: string; access?: string; refresh?: string }>("/auth/login/", {
      username,
      password,
    });
    window.localStorage.setItem("authToken", response.token);
    if (response.access) window.localStorage.setItem("jwtAccess", response.access);
    if (response.refresh) window.localStorage.setItem("jwtRefresh", response.refresh);
    setLoggedIn(true);
    await loadAll();
  }

  async function createAgent(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiPost<Agent>("/agents/", {
        name: agentName,
        kind: agentKind,
        specialty,
        parent: agentKind === "sub" && parentId ? Number(parentId) : null,
        system_prompt: `You are ${agentName}, specialist in ${specialty || "general tasks"}.`,
      });
      setAgentName("");
      setSpecialty("");
      setParentId("");
      await loadAll();
    } finally {
      setBusy(false);
    }
  }

  async function createTask(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiPost<AgentTask>("/tasks/", {
        title: taskTitle,
        prompt: taskPrompt,
        requested_agent_id: targetAgentId ? Number(targetAgentId) : null,
      });
      setTaskPrompt("");
      await loadAll();
    } finally {
      setBusy(false);
    }
  }

  async function cancelTask(taskId: number) {
    await apiPost<{ ok: boolean }>(`/tasks/${taskId}/cancel/`, {});
    await loadAll();
  }

  async function retryTask(taskId: number) {
    await apiPost<{ ok: boolean }>(`/tasks/${taskId}/retry/`, {});
    await loadAll();
  }

  async function updateRole(userId: number, role: string) {
    await apiPost<{ ok: boolean }>(`/admin/users/${userId}/role/`, { role });
    await loadAll();
  }

  if (!loggedIn) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl items-center p-6">
        <section className="panel w-full">
          <h1 className="text-2xl font-bold">Connexion</h1>
          <p className="text-sm text-slate-300">Authentifie-toi pour piloter les agents.</p>
          <form className="mt-4 grid gap-3" onSubmit={login}>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
            <button className="btn">Se connecter</button>
            <button type="button" className="btn" onClick={registerAndLogin}>
              Creer compte manager
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-7xl gap-6 p-6 lg:grid-cols-3">
      <section className="panel lg:col-span-2">
        <h1 className="text-2xl font-bold">AI Doc Orchestrator - Reactif et moderne</h1>
        <p className="text-sm text-slate-300">
          Agent principal + sous-agents, delegation automatique et execution parallele des taches.
        </p>
        <form className="mt-6 grid gap-3" onSubmit={createTask}>
          <input
            className="input"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="Titre de la tache"
            required
          />
          <textarea
            className="input min-h-28"
            value={taskPrompt}
            onChange={(e) => setTaskPrompt(e.target.value)}
            placeholder="Explique la tache a traiter..."
            required
          />
          <select className="input" value={targetAgentId} onChange={(e) => setTargetAgentId(e.target.value)}>
            <option value="">Agent principal (delegation auto)</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} ({agent.kind})
              </option>
            ))}
          </select>
          <button className="btn" disabled={busy}>
            Lancer la tache
          </button>
        </form>

        <div className="mt-6 grid gap-3">
          <h2 className="text-lg font-semibold">Taches</h2>
          {tasks.map((task) => (
            <article className="task-card" key={task.id}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{task.title}</h3>
                <span className={`status ${task.status}`}>{task.status}</span>
              </div>
              <p className="text-xs text-slate-300">
                Demande: {task.requested_agent_name || "auto"} - Execution: {task.assigned_agent_name || "routing"}
              </p>
              <div className="mt-2 flex gap-2">
                {(task.status === "queued" || task.status === "running") && (
                  <button className="btn" onClick={() => cancelTask(task.id)}>
                    Cancel
                  </button>
                )}
                {(task.status === "failed" || task.status === "cancelled") && (
                  <button className="btn" onClick={() => retryTask(task.id)}>
                    Retry
                  </button>
                )}
              </div>
              {task.result ? <pre className="result">{task.result}</pre> : null}
              {task.error_message ? <p className="text-red-300">{task.error_message}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <aside className="panel space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Agents actifs</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {activity.active_agents.length ? (
              activity.active_agents.map((a) => (
                <span key={a} className="chip">
                  {a}
                </span>
              ))
            ) : (
              <span className="text-sm text-slate-400">Aucun agent en execution.</span>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold">En cours</h2>
          <ul className="mt-2 space-y-2">
            {activity.running_tasks.length ? (
              activity.running_tasks.map((row) => (
                <li key={row.task_id} className="task-mini">
                  <strong>{row.title}</strong>
                  <span>{row.agent_name}</span>
                </li>
              ))
            ) : (
              <li className="text-sm text-slate-400">Aucune tache active.</li>
            )}
          </ul>
        </div>

        <form className="grid gap-3" onSubmit={createAgent}>
          <h2 className="text-lg font-semibold">Creer un agent</h2>
          <input
            className="input"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder="Nom de l'agent"
            required
          />
          <select className="input" value={agentKind} onChange={(e) => setAgentKind(e.target.value as "primary" | "sub")}>
            <option value="sub">Sous-agent</option>
            <option value="primary">Agent principal</option>
          </select>
          <input
            className="input"
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            placeholder="Specialite (ex: juridique, finance...)"
          />
          <select
            className="input"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            disabled={agentKind !== "sub"}
          >
            <option value="">Parent principal (optionnel)</option>
            {primaryAgents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
          <button className="btn" disabled={busy}>
            Ajouter agent
          </button>
        </form>

        <div className="grid gap-2">
          <h2 className="text-lg font-semibold">Admin - Roles</h2>
          {adminUsers.map((u) => (
            <div key={u.id} className="task-mini">
              <span>
                {u.username} ({u.roles.join(",") || "none"})
              </span>
              <select className="input" defaultValue={u.roles[0] || "viewer"} onChange={(e) => updateRole(u.id, e.target.value)}>
                <option value="viewer">viewer</option>
                <option value="operator">operator</option>
                <option value="manager">manager</option>
              </select>
            </div>
          ))}
        </div>

        <div className="grid gap-2">
          <h2 className="text-lg font-semibold">Admin - Audit</h2>
          {auditLogs.slice(0, 12).map((log) => (
            <div key={log.id} className="task-mini">
              <span>{log.action}</span>
              <span>{log.actor || "-"}</span>
            </div>
          ))}
        </div>
      </aside>
    </main>
  );
}
