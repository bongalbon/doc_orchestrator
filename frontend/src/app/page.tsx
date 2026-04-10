"use client";

import React, { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

type Notification = {
  id: number;
  type: "success" | "error" | "info";
  message: string;
  taskId?: number;
  createdAt: Date;
  read: boolean;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8008/api";
const WS_BASE = API_BASE.replace("http://", "ws://").replace("https://", "wss://").replace(/\/api$/, "");

function safeStringResult(result: unknown): string {
  if (typeof result === "string") return result;
  if (result === null || result === undefined) return "";
  if (result instanceof Error) return result.toString();
  if (typeof result === "object") {
    try {
      const str = JSON.stringify(result, null, 2);
      if (str !== "{}") return str;
      return Object.prototype.toString.call(result);
    } catch {
      return String(result);
    }
  }
  return String(result);
}

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
  const [savedApiKeys, setSavedApiKeys] = useState<Record<string, string>>({});
  const [newApiProvider, setNewApiProvider] = useState("openai");
  const [newApiKey, setNewApiKey] = useState("");
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [batchTasks, setBatchTasks] = useState<Array<{ title: string; prompt: string }>>([]);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [prevTasks, setPrevTasks] = useState<AgentTask[]>([]);
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
    try {
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
    } catch (err) {
      console.error("Load failed, redirecting to login", err);
      setLoggedIn(false);
    }
  }

  useEffect(() => {
    const token = window.localStorage.getItem("jwtAccess") || window.localStorage.getItem("authToken");
    setLoggedIn(Boolean(token));
    const storedKeys = window.localStorage.getItem("apiKeys");
    if (storedKeys) {
      setSavedApiKeys(JSON.parse(storedKeys));
    }
    if (token) {
      loadAll().catch(console.error);
      const ws = new WebSocket(`${WS_BASE}/ws/activity/`);
      ws.onmessage = () => {
        loadAll().catch(console.error);
      };
      return () => ws.close();
    }
  }, []);

  // Check for completed tasks and send notifications
  useEffect(() => {
    if (prevTasks.length > 0 && tasks.length > 0) {
      const newlyCompleted = tasks.filter(
        (t) => t.status === "done" && prevTasks.find((pt) => pt.id === t.id && pt.status !== "done")
      );
      const newlyFailed = tasks.filter(
        (t) => t.status === "failed" && prevTasks.find((pt) => pt.id === t.id && pt.status !== "failed")
      );

      const newNotifications: Notification[] = [
        ...newlyCompleted.map((t) => ({
          id: Date.now() + t.id,
          type: "success" as const,
          message: `Tâche "${t.title}" terminée`,
          taskId: t.id,
          createdAt: new Date(),
          read: false,
        })),
        ...newlyFailed.map((t) => ({
          id: Date.now() + t.id + 10000,
          type: "error" as const,
          message: `Tâche "${t.title}" a échoué`,
          taskId: t.id,
          createdAt: new Date(),
          read: false,
        })),
      ];

      if (newNotifications.length > 0) {
        setNotifications((prev) => [...newNotifications, ...prev].slice(0, 20));
      }
    }
    setPrevTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    if (provider === "ollama") {
      apiGet<{ models: string[] }>("/tasks/ollama-models/")
        .then((res) => setOllamaModels(res.models))
        .catch(() => setOllamaModels([]));
    }
  }, [provider]);

  async function login(e: FormEvent) {
    e.preventDefault();
    try {
      const response = await apiPost<{ token: string; access?: string; refresh?: string }>("/auth/login/", {
        username,
        password,
      });
      window.localStorage.setItem("authToken", response.token);
      if (response.access) window.localStorage.setItem("jwtAccess", response.access);
      if (response.refresh) window.localStorage.setItem("jwtRefresh", response.refresh);
      setLoggedIn(true);
      await loadAll();
    } catch (err) {
      console.error("Login failed", err);
      alert("Identifiants incorrects ou serveur indisponible. Si c'est votre première connexion après reset, utilisez 'S'inscrire'.");
    }
  }

  async function registerAndLogin() {
    try {
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
    } catch (err) {
      console.error("Registration failed", err);
      alert("Erreur lors de l'inscription. L'utilisateur existe peut-être déjà.");
    }
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

  async function createTask(e?: FormEvent) {
    if (e) e.preventDefault();
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
      if (!isBatchMode) setApiKey("");
      await loadAll();
    } finally {
      setBusy(false);
    }
  }

  function addToBatch() {
    if (!taskTitle.trim() || !taskPrompt.trim()) return;
    setBatchTasks([...batchTasks, { title: taskTitle.trim(), prompt: taskPrompt.trim() }]);
    setTaskTitle("Rédiger la note stratégique");
    setTaskPrompt("");
  }

  function removeFromBatch(index: number) {
    setBatchTasks(batchTasks.filter((_, i) => i !== index));
  }

  async function createBatchTasks() {
    if (batchTasks.length === 0) return;
    setBusy(true);
    try {
      await Promise.all(
        batchTasks.map((t) =>
          apiPost<AgentTask>("/tasks/", {
            title: t.title,
            prompt: t.prompt,
            provider,
            model_name: modelName,
            api_key: apiKey,
            requested_agent_id: targetAgentId ? Number(targetAgentId) : null,
          })
        )
      );
      setBatchTasks([]);
      setIsBatchMode(false);
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

  function saveApiKey() {
    if (!newApiKey.trim()) return;
    const updated = { ...savedApiKeys, [newApiProvider]: newApiKey.trim() };
    setSavedApiKeys(updated);
    window.localStorage.setItem("apiKeys", JSON.stringify(updated));
    setNewApiKey("");
  }

  function deleteApiKey(provider: string) {
    const updated = { ...savedApiKeys };
    delete updated[provider];
    setSavedApiKeys(updated);
    window.localStorage.setItem("apiKeys", JSON.stringify(updated));
    if (apiKey === savedApiKeys[provider]) {
      setApiKey("");
    }
  }

  function applySavedKey(provider: string) {
    if (savedApiKeys[provider]) {
      setApiKey(savedApiKeys[provider]);
    }
  }

  const handleExport = async (format: "docx" | "pdf" | "xlsx") => {
    if (!studioTask) return;
    const token = window.localStorage.getItem("jwtAccess");
    try {
      const response = await fetch(`${API_BASE}/tasks/${studioTask.id}/export/?fmt=${format}`, {
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
      <main className="flex min-h-screen w-full items-center justify-center p-6" style={{ backgroundColor: "var(--bg-primary)" }}>
        <section className="panel w-full max-w-sm" style={{ border: "1px solid var(--border-color)", padding: "2rem" }}>
          <h1 className="text-3xl font-serif mb-2">AI DOC ORCHESTRATOR</h1>
          <p className="text-sm text-[#888888] mb-6">Entrez vos identifiants pour accéder à la plateforme.</p>
          <form className="grid gap-4" onSubmit={login}>
            <div>
              <label className="text-xs text-[#888] mb-1 block uppercase tracking-wider">Nom d'utilisateur</label>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Nom d'utilisateur" />
            </div>
            <div>
              <label className="text-xs text-[#888] mb-1 block uppercase tracking-wider">Mot de passe</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" />
            </div>
            <button className="btn primary w-full mt-2">Se connecter</button>
            <button type="button" className="btn w-full opacity-60 text-xs" onClick={registerAndLogin}>
              Créer un compte manager
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ backgroundColor: "var(--bg-primary)" }}>
      {/* Sidebar */}
      <aside className="w-64 border-r flex flex-col shrink-0 overflow-y-auto" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}>
        <div className="p-4 border-b flex items-center gap-2 shrink-0" style={{ borderColor: "var(--border-color)" }}>
          <div className="w-6 h-6 rounded bg-[#ff5c00] flex items-center justify-center text-black font-bold text-xs">AI</div>
          <h1 className="font-serif text-lg leading-none">AI DOC<br/><span className="text-xs font-sans text-[#888]">ORCHESTRATOR</span></h1>
        </div>

        <div className="p-4 flex-1">
          <div className="mb-6">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[#888] mb-3">Agents disponibles</h2>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {agents.length ? (
                agents.map((a) => {
                  const isRunning = activity.active_agents.includes(a.name);
                  return (
                    <span 
                      key={a.id} 
                      className={`chip relative ${isRunning ? 'animate-pulse ring-2 ring-[#ff5c00] ring-offset-1 ring-offset-black' : ''}`}
                      title={`${a.name} - ${a.specialty || 'Spécialité générale'}${isRunning ? ' (En cours)' : ''}`}
                    >
                      {a.name}
                      {isRunning && (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#10b981] rounded-full animate-ping"></span>
                      )}
                    </span>
                  );
                })
              ) : (
                <span className="text-xs text-[#555]">Aucun agent créé</span>
              )}
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[#888] mb-3">
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
                    <span className="w-2 h-2 bg-[#ff5c00] rounded-full animate-spin"></span>
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

          <div className="mb-6">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[#888] mb-3">Liste des agents</h2>
            <form className="grid gap-2" onSubmit={createAgent}>
              <input className="input !py-1.5 !px-2 text-xs" value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="Nom de l'agent" required />
              <select className="input !py-1.5 !px-2 text-xs" value={agentKind} onChange={(e) => setAgentKind(e.target.value as "primary" | "sub")}>
                <option value="sub">Sous-agent</option>
                <option value="primary">Agent principal</option>
              </select>
              <input className="input !py-1.5 !px-2 text-xs" value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Spécialité" />
              <button className="btn w-full !py-1.5 text-xs" disabled={busy}>Recruter un agent</button>
            </form>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-mono uppercase tracking-wider text-[#888]">Clés API</h2>
              <button 
                onClick={() => setShowApiKeys(!showApiKeys)}
                className="text-[10px] text-[#ff5c00] hover:text-[#ff7c33]"
              >
                {showApiKeys ? "Masquer" : "Gérer"}
              </button>
            </div>
            
            {showApiKeys && (
              <div className="space-y-2 mb-3 p-2 rounded bg-black/50 border" style={{ borderColor: "var(--border-color)" }}>
                <div className="flex flex-col gap-1">
                  <select 
                    className="input !py-1 !px-2 text-xs"
                    value={newApiProvider}
                    onChange={(e) => setNewApiProvider(e.target.value)}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Gemini</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="grok">xAI Grok</option>
                  </select>
                  <input
                    type="password"
                    className="input !py-1 !px-2 text-xs"
                    placeholder="Nouvelle clé API..."
                    value={newApiKey}
                    onChange={(e) => setNewApiKey(e.target.value)}
                  />
                  <button 
                    onClick={saveApiKey}
                    className="btn !py-1 text-xs"
                    disabled={!newApiKey.trim()}
                  >
                    Sauvegarder
                  </button>
                </div>
              </div>
            )}
            
            {Object.keys(savedApiKeys).length > 0 && (
              <div className="space-y-1">
                {Object.entries(savedApiKeys).map(([prov, key]) => (
                  <div key={prov} className="flex items-center justify-between text-xs">
                    <span className="text-[#888] capitalize">{prov}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setProvider(prov); setApiKey(key); }}
                        className="text-[#10b981] hover:text-[#10b981]/80"
                        title="Utiliser cette clé"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => deleteApiKey(prov)}
                        className="text-[#ef4444] hover:text-[#ef4444]/80"
                        title="Supprimer"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {Object.keys(savedApiKeys).length === 0 && (
              <p className="text-[10px] text-[#555]">Aucune clé sauvegardée</p>
            )}
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-mono uppercase tracking-wider text-[#888]">Notifications</h2>
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative text-[10px] text-[#ff5c00] hover:text-[#ff7c33]"
              >
                <span className="flex items-center gap-1">
                  🔔
                  {notifications.filter(n => !n.read).length > 0 && (
                    <span className="bg-[#ef4444] text-white text-[9px] px-1.5 py-0.5 rounded-full">
                      {notifications.filter(n => !n.read).length}
                    </span>
                  )}
                </span>
              </button>
            </div>
            
            {showNotifications && (
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {notifications.length === 0 && (
                  <p className="text-[10px] text-[#555]">Aucune notification</p>
                )}
                {notifications.map((notif) => (
                  <div 
                    key={notif.id} 
                    className={`text-xs p-2 rounded border-l-2 cursor-pointer transition-opacity ${
                      notif.read ? 'opacity-50' : 'opacity-100'
                    } ${
                      notif.type === 'success' ? 'border-l-[#10b981] bg-[#10b981]/10' : 
                      notif.type === 'error' ? 'border-l-[#ef4444] bg-[#ef4444]/10' : 
                      'border-l-[#ff5c00] bg-[#ff5c00]/10'
                    }`}
                    style={{ borderColor: "var(--border-color)" }}
                    onClick={() => {
                      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
                      if (notif.taskId) {
                        const task = tasks.find(t => t.id === notif.taskId);
                        if (task) {
                          setStudioTask(task);
                          setStudioContent(safeStringResult(task.result));
                        }
                      }
                    }}
                  >
                    <span className="block truncate">{notif.message}</span>
                    <span className="text-[10px] text-[#888]">
                      {notif.createdAt.toLocaleTimeString()}
                    </span>
                  </div>
                ))}
                {notifications.length > 0 && (
                  <button 
                    onClick={() => setNotifications([])}
                    className="text-[10px] text-[#888] hover:text-white mt-2 w-full text-center"
                  >
                    Effacer tout
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mb-6">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[#888] mb-3">Administration & Audit</h2>
            <div className="space-y-1">
              {auditLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="flex flex-col text-xs text-[#666] border-b pb-1 mb-1" style={{ borderColor: "var(--border-color)" }}>
                  <span className="truncate">{log.action}</span>
                  <span>par : {log.actor || "-"}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <Link href="/tasks" className="btn primary w-full text-center block">
              📋 Voir toutes les tâches
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b flex items-center justify-between px-6 shrink-0" style={{ borderColor: "var(--border-color)", backgroundColor: "var(--bg-primary)" }}>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm px-2 py-0.5 rounded bg-[#111] border text-[#fff]" style={{ borderColor: "var(--border-color)" }}># Espace de travail</span>
          </div>
          <button className="btn text-xs text-[#888]" onClick={() => { window.localStorage.clear(); window.location.reload(); }}>Déconnexion</button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-8 flex flex-col items-center" style={{ backgroundColor: "var(--bg-primary)" }}>
          <div className="w-full max-w-4xl flex flex-col gap-6">
            
            {/* New Task Area */}
            <section className="panel !pb-4">
              <h2 className="text-lg font-serif mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#ff5c00]"></span>
                Assigner une nouvelle tâche
              </h2>
              <form className="flex flex-col gap-4" onSubmit={createTask}>
                <input className="input text-lg font-serif bg-transparent border-0 border-b rounded-none px-0 focus:border-[#ff5c00] pb-2 text-white" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Titre de la tâche..." required />
                <textarea className="input min-h-[100px] resize-y text-sm text-white focus:border-[#555]" value={taskPrompt} onChange={(e) => setTaskPrompt(e.target.value)} placeholder="Décrivez le travail à effectuer..." required />
                
                <div className="flex flex-wrap gap-2 p-3 rounded bg-black border" style={{ borderColor: "var(--border-color)" }}>
                  <div className="flex flex-wrap gap-2 flex-1">
                    <select className="input !w-auto text-xs py-1" value={provider} onChange={(e) => { setProvider(e.target.value); setModelName(PROVIDER_MODELS[e.target.value]?.[0] || ""); }}>
                      <option value="ollama">Ollama (Local)</option>
                      <option value="openai">OpenAI</option>
                      <option value="gemini">Gemini</option>
                      <option value="grok">xAI Grok</option>
                      <option value="anthropic">Anthropic</option>
                    </select>
                    
                    <select className="input !w-auto text-xs py-1" value={modelName} onChange={(e) => setModelName(e.target.value)}>
                      {(!PROVIDER_MODELS[provider]?.includes(modelName) && modelName !== "") && <option value={modelName}>{modelName}</option>}
                      {(PROVIDER_MODELS[provider] || []).map((m) => (<option key={m} value={m}>{m}</option>))}
                      <option value="custom">Custom...</option>
                    </select>

                    <select className="input !w-auto text-xs py-1" value={targetAgentId} onChange={(e) => setTargetAgentId(e.target.value)}>
                      <option value="">Délégation auto</option>
                      {agents.map((agent) => (<option key={agent.id} value={agent.id}>{agent.name} ({agent.kind})</option>))}
                    </select>

                    {provider !== "ollama" ? (
                      <div className="flex gap-2 flex-1 min-w-[150px] max-w-[300px]">
                        {savedApiKeys[provider] && (
                          <button
                            type="button"
                            onClick={() => setApiKey(savedApiKeys[provider])}
                            className="btn !py-1 text-xs text-[#10b981] border-[#10b981]/50 hover:bg-[#10b981]/10 whitespace-nowrap"
                            title="Utiliser la clé sauvegardée"
                          >
                            Clé sauvegardée
                          </button>
                        )}
                        <input 
                          className="input !w-auto text-xs py-1 flex-1 min-w-[120px]" 
                          type="password" 
                          value={apiKey} 
                          onChange={(e) => setApiKey(e.target.value)} 
                          placeholder={savedApiKeys[provider] ? "Clé API (modifiée)" : "Clé API"} 
                          required 
                        />
                      </div>
                    ) : (
                      <div className="text-xs flex items-center text-[#ff5c00] opacity-80 px-2 font-mono border-l border-[#333] pl-3">Aucune clé API requise</div>
                    )}
                  </div>
                </div>
                
                <div className="flex justify-end gap-2 mt-1 flex-wrap">
                  <button 
                    type="button" 
                    onClick={() => setIsBatchMode(!isBatchMode)}
                    className={`btn text-xs ${isBatchMode ? 'border-[#ff5c00] text-[#ff5c00]' : ''}`}
                  >
                    {isBatchMode ? "Mode simple" : "Mode batch"}
                  </button>
                  
                  {isBatchMode ? (
                    <button 
                      type="button" 
                      onClick={addToBatch}
                      className="btn text-xs border-[#10b981] text-[#10b981]"
                      disabled={!taskTitle.trim() || !taskPrompt.trim()}
                    >
                      + Ajouter à la file ({batchTasks.length})
                    </button>
                  ) : (
                    <button className="btn primary px-6" disabled={busy}>Assigner</button>
                  )}
                  
                  {isBatchMode && batchTasks.length > 0 && (
                    <button 
                      type="button" 
                      onClick={createBatchTasks}
                      className="btn primary"
                      disabled={busy}
                    >
                      Lancer {batchTasks.length} tâche(s)
                    </button>
                  )}
                </div>
                
                {isBatchMode && batchTasks.length > 0 && (
                  <div className="mt-4 p-3 rounded bg-black/50 border" style={{ borderColor: "var(--border-color)" }}>
                    <h3 className="text-xs font-mono uppercase tracking-wider text-[#888] mb-2">File d'attente ({batchTasks.length})</h3>
                    <div className="space-y-1 max-h-[150px] overflow-y-auto">
                      {batchTasks.map((t, i) => (
                        <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-[#111]">
                          <span className="truncate flex-1 mr-2">{t.title}</span>
                          <button 
                            onClick={() => removeFromBatch(i)}
                            className="text-[#ef4444] hover:text-[#ef4444]/80"
                            title="Retirer"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </form>
            </section>

            {/* Tasks List */}
            <section>
              <h2 className="text-lg font-serif mb-4 pb-2 border-b" style={{ borderColor: "var(--border-color)" }}>Journal des tâches</h2>
              <div className="flex flex-col">
                {tasks.map((task) => (
                  <article className="task-card flex flex-col gap-2" key={task.id}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-[#666]">DOC-{task.id}</span>
                          <h3 className="font-medium text-white truncate text-base font-serif">{task.title}</h3>
                        </div>
                        <p className="text-xs text-[#888] font-mono uppercase tracking-wider">
                          Assigné à : {task.assigned_agent_name || "Routeur"}
                        </p>
                      </div>
                      <span className={`status ${task.status}`}>{task.status === "queued" ? "en attente" : task.status === "running" ? "en cours" : task.status === "done" ? "terminé" : task.status === "failed" ? "échoué" : "annulé"}</span>
                    </div>
                    
                    {task.result && (
                      <div className="mt-2 p-4 rounded bg-black border text-sm text-[#ccc] max-h-[250px] overflow-y-auto" style={{ borderColor: "var(--border-color)" }}>
                        {typeof task.result === "string" && !task.result.startsWith("Error:") ? (
                          <div className="prose prose-invert prose-sm max-w-none font-sans prose-p:my-1 prose-headings:mb-2 prose-headings:mt-4 first:prose-headings:mt-0">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.result}</ReactMarkdown>
                          </div>
                        ) : (
                          <pre className="whitespace-pre-wrap font-mono text-xs text-[#ccc]">
                            {safeStringResult(task.result)}
                          </pre>
                        )}
                      </div>
                    )}

                    {task.error_message && (
                      <div className="mt-1 text-xs text-[#ef4444] font-mono whitespace-pre-wrap bg-[#ef4444]/10 p-2 rounded">
                        {task.error_message}
                      </div>
                    )}

                    <div className="flex justify-end gap-2 mt-2">
                      {(task.status === "queued" || task.status === "running") && (
                        <button className="btn !py-1 text-xs hover:text-[#ef4444] hover:border-[#ef4444] hover:bg-[#ef4444]/10" onClick={() => cancelTask(task.id)}>Annuler</button>
                      )}
                      {(task.status === "failed" || task.status === "cancelled") && (
                        <button className="btn !py-1 text-xs" onClick={() => retryTask(task.id)}>Réessayer</button>
                      )}
                      {task.status === "done" && (
                        <>
                          <button className="btn !py-1 text-xs" onClick={() => { setStudioTask(task); setStudioContent(safeStringResult(task.result)); }}>
                            Ouvrir dans le Studio
                          </button>
                          {!task.is_approved && (
                            <button className="btn !py-1 text-xs border-[#10b981] text-[#10b981] hover:bg-[#10b981]/10" onClick={() => approveTask(task)}>
                              Approuver
                            </button>
                          )}
                          {task.is_approved && <span className="text-[#10b981] text-xs self-center font-mono uppercase tracking-widest bg-[#10b981]/10 px-2 py-0.5 rounded">Approuvé</span>}
                        </>
                      )}
                    </div>
                  </article>
                ))}
                {tasks.length === 0 && <p className="text-sm text-[#666] py-4 text-center">Aucune tâche trouvée. Créez-en une nouvelle.</p>}
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Studio Modal */}
      {studioTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/80">
          <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-xl overflow-hidden border shadow-2xl" style={{ borderColor: "var(--border-color)", backgroundColor: "var(--bg-secondary)" }}>
            <div className="flex items-center justify-between p-4 border-b bg-[#000]" style={{ borderColor: "var(--border-color)" }}>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-[#ff5c00] px-2 py-1 rounded bg-[#ff5c00]/10 border border-[#ff5c00]/20">DOC-{studioTask.id}</span>
                <h2 className="text-lg font-serif">Studio : {studioTask.title}</h2>
              </div>
              <button className="text-[#888] hover:text-white transition-colors text-xl leading-none" onClick={() => setStudioTask(null)}>✕</button>
            </div>
            
            <div className="flex-1 flex overflow-hidden">
              {/* Preview side */}
              <div className="flex-1 p-6 overflow-y-auto border-r bg-[#000]" style={{ borderColor: "var(--border-color)" }}>
                <div className="prose prose-invert prose-sm max-w-none font-sans prose-p:text-[#ccc] prose-headings:text-white">
                  {typeof studioContent === "string" && !studioContent.startsWith("Error:") ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{studioContent}</ReactMarkdown>
                  ) : (
                    <pre className="whitespace-pre-wrap font-mono text-xs text-[#ccc]">
                      {safeStringResult(studioContent)}
                    </pre>
                  )}
                </div>
              </div>
              {/* Editor side */}
              <div className="w-[450px] flex flex-col bg-[#050505]">
                <div className="p-3 border-b text-[10px] font-mono uppercase tracking-widest text-[#666] bg-[#0a0a0a]" style={{ borderColor: "var(--border-color)" }}>Markdown brut</div>
                <textarea
                  className="flex-1 w-full bg-transparent text-[#ddd] p-4 font-mono text-sm leading-relaxed focus:outline-none resize-none"
                  value={studioContent}
                  onChange={(e) => setStudioContent(e.target.value)}
                  placeholder="Édition du contenu brut..."
                />
              </div>
            </div>

            <div className="p-4 border-t flex justify-between items-center bg-[#000]" style={{ borderColor: "var(--border-color)" }}>
              <div className="flex gap-2">
                <button className="btn !py-1 text-xs text-[#888] hover:text-white" onClick={() => handleExport("docx")}>⭳ DOCX</button>
                <button className="btn !py-1 text-xs text-[#888] hover:text-white" onClick={() => handleExport("pdf")}>⭳ PDF</button>
                <button className="btn !py-1 text-xs text-[#888] hover:text-white" onClick={() => handleExport("xlsx")}>⭳ XLSX</button>
              </div>
              <div className="flex gap-3">
                <button className="btn" onClick={() => setStudioTask(null)}>Fermer</button>
                <button className="btn primary" onClick={saveStudioResult} disabled={busy}>Enregistrer les modifications</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
