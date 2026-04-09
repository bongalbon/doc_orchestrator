"use client";

import React, { FormEvent, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  api_key?: string;
  is_approved?: boolean;
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

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8008/api";
const WS_BASE = API_BASE.replace("http://", "ws://").replace("https://", "wss://").replace(/\/api$/, "");

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
  const [provider, setProvider] = useState("ollama");
  const [modelName, setModelName] = useState("");
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
  const [apiKey, setApiKey] = useState("");
  const [studioTask, setStudioTask] = useState<AgentTask | null>(null);
  const [studioContent, setStudioContent] = useState("");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);

  const PROVIDER_MODELS: Record<string, string[]> = {
    ollama: ollamaModels.length > 0 ? ollamaModels : ["llama3.1:8b", "mistral", "gemma2"],
    openai: ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"],
    gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-pro-vision"],
    anthropic: ["claude-3-5-sonnet-20240620", "claude-3-opus-20240229", "claude-3-haiku-20240307"],
    grok: ["grok-2-1212", "grok-beta"],
  };

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
      const ws = new WebSocket(`${WS_BASE}/ws/activity/`);
      ws.onmessage = () => {
        loadAll().catch(console.error);
      };
      return () => ws.close();
    }
  }, []);

  useEffect(() => {
    if (provider === "ollama") {
      apiGet<{ models: string[] }>("/tasks/ollama-models/")
        .then((res) => setOllamaModels(res.models))
        .catch(() => setOllamaModels([]));
    }
  }, [provider]);

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
        provider,
        model_name: modelName,
        api_key: apiKey,
        requested_agent_id: targetAgentId ? Number(targetAgentId) : null,
      });
      setTaskPrompt("");
      setApiKey("");
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

  async function saveStudioResult() {
    if (!studioTask) return;
    setBusy(true);
    try {
      await apiFetch(`/tasks/${studioTask.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: studioContent, is_approved: studioTask.is_approved }),
      });
      await loadAll();
      setStudioTask(null);
    } finally {
      setBusy(false);
    }
  }

  async function approveTask(task: AgentTask) {
    await apiFetch(`/tasks/${task.id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_approved: true }),
    });
    await loadAll();
  }

  const handleExport = async (format: "docx" | "pdf" | "xlsx") => {
    if (!studioTask) return;
    const token = window.localStorage.getItem("jwtAccess");
    try {
      const response = await fetch(`${API_BASE}/tasks/${studioTask.id}/export/${format}/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${studioTask.title.replace(/\s+/g, "_")}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (err) {
      console.error("Export failed", err);
    }
  };

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
          <div className="grid grid-cols-2 gap-2">
            <select
              className="input"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setModelName(PROVIDER_MODELS[e.target.value]?.[0] || "");
              }}
            >
              <option value="ollama">ollama (local)</option>
              <option value="openai">openai</option>
              <option value="gemini">gemini</option>
              <option value="grok">grok / xAI</option>
              <option value="anthropic">anthropic</option>
            </select>
            {provider !== "ollama" ? (
              <input
                className="input"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Clé API requis"
                required
              />
            ) : (
              <div className="input opacity-50 bg-slate-800 flex items-center text-xs">
                Local Ollama - Pas de clé nécessaire
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex gap-2">
              <select className="input flex-1" value={modelName} onChange={(e) => setModelName(e.target.value)}>
                <option value="">-- Sélect. Modèle --</option>
                {(PROVIDER_MODELS[provider] || []).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                <option value="custom">Autre (saisie manuelle)</option>
              </select>
              {(!PROVIDER_MODELS[provider]?.includes(modelName) || modelName === "custom") && (
                <input
                  className="input flex-1"
                  value={modelName === "custom" ? "" : modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="Nom du modèle"
                />
              )}
            </div>
          </div>
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
                {task.status === "done" && (
                  <>
                    <button
                      className="btn secondary"
                      onClick={() => {
                        setStudioTask(task);
                        setStudioContent(task.result);
                      }}
                    >
                      Studio / Éditer
                    </button>
                    {!task.is_approved && (
                      <button className="btn" onClick={() => approveTask(task)}>
                        Approuver
                      </button>
                    )}
                    {task.is_approved && <span className="text-green-400 text-xs self-center">✓ Approuvé</span>}
                  </>
                )}
              </div>
              {task.result ? (
                <div className="bg-slate-900 border border-slate-700 p-4 rounded-lg text-sm text-slate-300 font-mono whitespace-pre-wrap overflow-x-auto min-h-[100px] mb-4 prose prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {task.result}
                  </ReactMarkdown>
                </div>
              ) : null}
              {task.error_message ? <p className="text-red-300">{task.error_message}</p> : null}
            </article>
          ))}
        </div>

        {/* Studio Modal */}
        {studioTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="panel w-full max-w-4xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                <h2 className="text-xl font-bold">Studio: {studioTask.title}</h2>
                <button className="text-slate-400 hover:text-white" onClick={() => setStudioTask(null)}>
                  ✕
                </button>
              </div>
              <div className="mt-4 flex-1 overflow-auto">
                <div className="bg-slate-900 border border-slate-700 p-4 rounded-lg text-sm text-slate-300 min-h-[400px] prose prose-invert max-w-none mb-6">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {studioContent}
                  </ReactMarkdown>
                </div>

                <div className="bg-slate-800 p-4 rounded-lg mb-6 border border-slate-700">
                  <h4 className="text-sm font-semibold mb-3">Éditeur de texte brut</h4>
                  <textarea
                    className="w-full bg-slate-900 text-slate-100 p-3 rounded border border-slate-600 min-h-[200px] text-sm font-mono"
                    value={studioContent}
                    onChange={(e) => setStudioContent(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 justify-between border-t border-slate-700 pt-4">
                <div className="flex gap-2">
                  <button className="btn tertiary" onClick={() => handleExport("docx")}>
                    Export DOCX
                  </button>
                  <button className="btn tertiary" onClick={() => handleExport("pdf")}>
                    Export PDF
                  </button>
                  <button className="btn tertiary" onClick={() => handleExport("xlsx")}>
                    Export XLSX
                  </button>
                </div>
                <div className="flex gap-2">
                  <button className="btn" onClick={() => setStudioTask(null)}>
                    Fermer
                  </button>
                  <button className="btn primary" onClick={saveStudioResult} disabled={busy}>
                    Sauvegarder
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
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
