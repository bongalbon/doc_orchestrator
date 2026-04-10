"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type AgentTask = {
  id: number;
  title: string;
  prompt: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  assigned_agent_id?: number;
  assigned_agent_name?: string;
  result: string;
  error_message: string;
  is_approved?: boolean;
  created_at?: string;
  provider?: string;
  model?: string;
};

type Agent = {
  id: number;
  name: string;
  kind: "primary" | "sub";
  specialty?: string;
  is_active?: boolean;
};

type ActivityResponse = {
  running_tasks: Array<{ task_id: number; agent_name: string; title: string; status: string }>;
  active_agents: string[];
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

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    ...init,
    headers: { ...authHeaders(), ...(init?.headers || {}) },
  });
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

export default function TasksPage() {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [activity, setActivity] = useState<ActivityResponse>({ running_tasks: [], active_agents: [] });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [approvalFilter, setApprovalFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "title">("newest");
  const [busy, setBusy] = useState(false);
  const [studioTask, setStudioTask] = useState<AgentTask | null>(null);
  const [studioContent, setStudioContent] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);

  // États pour le modal de re-paramétrage
  const [retryTaskModal, setRetryTaskModal] = useState<AgentTask | null>(null);
  const [retryAgentId, setRetryAgentId] = useState<string>("");
  const [retryProvider, setRetryProvider] = useState<string>("gemini");
  const [retryModel, setRetryModel] = useState<string>("gemini-2.5-flash");

  const PROVIDER_MODELS: Record<string, string[]> = {
    ollama: ["llama3.1:8b", "mistral", "gemma2"],
    openai: ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"],
    gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-pro-vision"],
    anthropic: ["claude-3-5-sonnet-20240620", "claude-3-opus-20240229", "claude-3-haiku-20240307"],
    grok: ["grok-2-1212", "grok-beta"],
  };

  async function loadAll() {
    try {
      const [taskData, activityData, agentsData] = await Promise.all([
        apiGet<AgentTask[]>("/tasks/"),
        apiGet<ActivityResponse>("/tasks/activity/"),
        apiGet<Agent[]>("/agents/"),
      ]);
      setTasks(taskData);
      setActivity(activityData);
      setAgents(agentsData);
    } catch (err) {
      console.error("Load failed", err);
      setLoggedIn(false);
    }
  }

  useEffect(() => {
    const token = window.localStorage.getItem("jwtAccess") || window.localStorage.getItem("authToken");
    setLoggedIn(Boolean(token));
    if (token) {
      loadAll().catch(console.error);
      const ws = new WebSocket(`${WS_BASE}/ws/activity/`);
      ws.onmessage = () => loadAll().catch(console.error);
      return () => ws.close();
    }
  }, []);

  async function retryTask(taskId: number) {
    setBusy(true);
    try {
      await apiPost<{ ok: boolean }>(`/tasks/${taskId}/retry/`, {});
      await loadAll();
    } finally {
      setBusy(false);
    }
  }

  function openRetryModal(task: AgentTask) {
    setRetryTaskModal(task);
    setRetryAgentId(task.assigned_agent_id?.toString() || "");
    setRetryProvider(task.provider || "gemini");
    setRetryModel(task.model || PROVIDER_MODELS.gemini[0]);
  }

  function closeRetryModal() {
    setRetryTaskModal(null);
    setRetryAgentId("");
    setRetryProvider("gemini");
    setRetryModel("gemini-2.5-flash");
  }

  async function retryWithNewParams(e: React.FormEvent) {
    e.preventDefault();
    if (!retryTaskModal) return;

    setBusy(true);
    try {
      // Mise à jour de la tâche avec les nouveaux paramètres
      await apiFetch(`/tasks/${retryTaskModal.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigned_agent_id: retryAgentId ? Number(retryAgentId) : null,
          provider: retryProvider,
          model: retryModel,
        }),
      });

      // Relancer la tâche
      await apiPost<{ ok: boolean }>(`/tasks/${retryTaskModal.id}/retry/`, {});
      await loadAll();
      closeRetryModal();
    } finally {
      setBusy(false);
    }
  }

  async function cancelTask(taskId: number) {
    await apiPost<{ ok: boolean }>(`/tasks/${taskId}/cancel/`, {});
    await loadAll();
  }

  async function approveTask(task: AgentTask) {
    await apiFetch(`/tasks/${task.id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_approved: true }),
    });
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

  const filteredTasks = useMemo(() => {
    let result = [...tasks];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.prompt.toLowerCase().includes(q) ||
          (t.assigned_agent_name?.toLowerCase().includes(q) ?? false)
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((t) => t.status === statusFilter);
    }

    if (approvalFilter !== "all") {
      if (approvalFilter === "approved") {
        result = result.filter((t) => t.is_approved);
      } else if (approvalFilter === "pending") {
        result = result.filter((t) => t.status === "done" && !t.is_approved);
      }
    }

    result.sort((a, b) => {
      if (sortBy === "newest") return (b.id || 0) - (a.id || 0);
      if (sortBy === "oldest") return (a.id || 0) - (b.id || 0);
      if (sortBy === "title") return a.title.localeCompare(b.title);
      return 0;
    });

    return result;
  }, [tasks, searchQuery, statusFilter, approvalFilter, sortBy]);

  const stats = useMemo(() => {
    return {
      total: tasks.length,
      done: tasks.filter((t) => t.status === "done").length,
      failed: tasks.filter((t) => t.status === "failed").length,
      running: tasks.filter((t) => t.status === "running").length,
      queued: tasks.filter((t) => t.status === "queued").length,
      approved: tasks.filter((t) => t.is_approved).length,
      pending: tasks.filter((t) => t.status === "done" && !t.is_approved).length,
    };
  }, [tasks]);

  const handleExport = async (format: "docx" | "pdf" | "xlsx") => {
    if (!studioTask) return;
    const token = window.localStorage.getItem("jwtAccess");
    try {
      const response = await fetch(`${API_BASE}/tasks/${studioTask.id}/export/?fmt=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
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
          <h1 className="text-3xl font-serif mb-4">Connexion requise</h1>
          <Link href="/" className="btn primary w-full text-center block">
            Retour à l&apos;accueil
          </Link>
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
            <Link href="/" className="btn w-full text-center block mb-2">
              ← Retour à l&apos;accueil
            </Link>
          </div>

          <div className="mb-6">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[#888] mb-3">Statistiques</h2>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded bg-black/50 border" style={{ borderColor: "var(--border-color)" }}>
                <span className="block text-[#888]">Total</span>
                <span className="text-lg text-white">{stats.total}</span>
              </div>
              <div className="p-2 rounded bg-black/50 border" style={{ borderColor: "var(--border-color)" }}>
                <span className="block text-[#10b981]">Terminées</span>
                <span className="text-lg text-white">{stats.done}</span>
              </div>
              <div className="p-2 rounded bg-black/50 border" style={{ borderColor: "var(--border-color)" }}>
                <span className="block text-[#ef4444]">Échouées</span>
                <span className="text-lg text-white">{stats.failed}</span>
              </div>
              <div className="p-2 rounded bg-black/50 border" style={{ borderColor: "var(--border-color)" }}>
                <span className="block text-[#ff5c00]">En cours</span>
                <span className="text-lg text-white">{stats.running + stats.queued}</span>
              </div>
              <div className="p-2 rounded bg-black/50 border" style={{ borderColor: "var(--border-color)" }}>
                <span className="block text-[#10b981]">Approuvées</span>
                <span className="text-lg text-white">{stats.approved}</span>
              </div>
              <div className="p-2 rounded bg-black/50 border" style={{ borderColor: "var(--border-color)" }}>
                <span className="block text-[#ff5c00]">En attente</span>
                <span className="text-lg text-white">{stats.pending}</span>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[#888] mb-3">Activité en direct</h2>
            {activity.running_tasks.length > 0 ? (
              <ul className="space-y-2">
                {activity.running_tasks.map((row) => (
                  <li key={row.task_id} className="text-xs border p-2 rounded flex flex-col relative overflow-hidden" style={{ borderColor: "var(--border-color)" }}>
                    <div className="absolute inset-0 bg-gradient-to-r from-[#ff5c00]/10 via-[#ff5c00]/5 to-transparent animate-pulse"></div>
                    <span className="relative text-white block truncate">{row.title}</span>
                    <span className="relative text-[#ff5c00]">@{row.agent_name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[#555]">Aucune tâche en cours</p>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 border-b flex items-center justify-between px-6 shrink-0" style={{ borderColor: "var(--border-color)", backgroundColor: "var(--bg-primary)" }}>
          <h1 className="text-lg font-serif">Gestion des tâches</h1>
          <button className="btn text-xs text-[#888]" onClick={() => { window.localStorage.clear(); window.location.reload(); }}>
            Déconnexion
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Search and Filters */}
          <section className="panel mb-6">
            <div className="flex flex-col gap-4">
              {/* Search */}
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input flex-1"
                  placeholder="Rechercher par titre, description ou agent..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="btn text-xs">
                    Effacer
                  </button>
                )}
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-[#888]">Statut:</label>
                  <select
                    className="input !w-auto text-xs py-1"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">Tous ({stats.total})</option>
                    <option value="done">Terminées ({stats.done})</option>
                    <option value="failed">Échouées ({stats.failed})</option>
                    <option value="running">En cours ({stats.running})</option>
                    <option value="queued">En attente ({stats.queued})</option>
                    <option value="cancelled">Annulées</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs text-[#888]">Approbation:</label>
                  <select
                    className="input !w-auto text-xs py-1"
                    value={approvalFilter}
                    onChange={(e) => setApprovalFilter(e.target.value)}
                  >
                    <option value="all">Toutes</option>
                    <option value="approved">Approuvées ({stats.approved})</option>
                    <option value="pending">À approuver ({stats.pending})</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs text-[#888]">Tri:</label>
                  <select
                    className="input !w-auto text-xs py-1"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                  >
                    <option value="newest">Plus récentes</option>
                    <option value="oldest">Plus anciennes</option>
                    <option value="title">Titre (A-Z)</option>
                  </select>
                </div>
              </div>

              {/* Quick Filter Buttons */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setStatusFilter("failed"); setApprovalFilter("all"); }}
                  className={`btn !py-1 text-xs ${statusFilter === "failed" ? "border-[#ef4444] text-[#ef4444]" : ""}`}
                >
                  ⚠️ Échouées ({stats.failed})
                </button>
                <button
                  onClick={() => { setStatusFilter("done"); setApprovalFilter("pending"); }}
                  className={`btn !py-1 text-xs ${statusFilter === "done" && approvalFilter === "pending" ? "border-[#ff5c00] text-[#ff5c00]" : ""}`}
                >
                  ⏳ À approuver ({stats.pending})
                </button>
                <button
                  onClick={() => { setStatusFilter("running"); setApprovalFilter("all"); }}
                  className={`btn !py-1 text-xs ${statusFilter === "running" ? "border-[#ff5c00] text-[#ff5c00]" : ""}`}
                >
                  ▶️ En cours ({stats.running + stats.queued})
                </button>
                <button
                  onClick={() => { setStatusFilter("all"); setApprovalFilter("all"); setSearchQuery(""); }}
                  className="btn !py-1 text-xs"
                >
                  🔄 Réinitialiser
                </button>
              </div>

              <div className="text-xs text-[#888]">
                {filteredTasks.length} tâche(s) affichée(s) sur {tasks.length}
              </div>
            </div>
          </section>

          {/* Tasks List */}
          <section>
            {filteredTasks.length === 0 ? (
              <div className="panel text-center py-12">
                <p className="text-[#888] mb-2">Aucune tâche ne correspond à vos critères</p>
                <button onClick={() => { setStatusFilter("all"); setApprovalFilter("all"); setSearchQuery(""); }} className="btn text-xs">
                  Réinitialiser les filtres
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredTasks.map((task) => (
                  <article key={task.id} className="panel flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-mono text-xs text-[#666]">DOC-{task.id}</span>
                          <span
                            className={`status ${task.status} text-[10px] px-2 py-0.5 rounded`}
                            style={{
                              backgroundColor: task.status === "done" ? "#10b98120" : task.status === "failed" ? "#ef444420" : task.status === "running" ? "#ff5c0020" : "#88888820",
                              color: task.status === "done" ? "#10b981" : task.status === "failed" ? "#ef4444" : task.status === "running" ? "#ff5c00" : "#888",
                            }}
                          >
                            {task.status === "queued" ? "en attente" : task.status === "running" ? "en cours" : task.status === "done" ? "terminé" : task.status === "failed" ? "échoué" : "annulé"}
                          </span>
                          {task.is_approved && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-[#10b981]/20 text-[#10b981]">
                              Approuvé
                            </span>
                          )}
                          {task.status === "done" && !task.is_approved && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-[#ff5c00]/20 text-[#ff5c00]">
                              À approuver
                            </span>
                          )}
                        </div>
                        <h3 className="font-medium text-white text-base font-serif mb-1">{task.title}</h3>
                        <p className="text-xs text-[#888] font-mono">
                          Assigné à : {task.assigned_agent_name || "Routeur"}
                        </p>
                      </div>
                    </div>

                    {task.status === "failed" && task.error_message && (
                      <div className="text-xs text-[#ef4444] font-mono whitespace-pre-wrap bg-[#ef4444]/10 p-2 rounded">
                        {task.error_message}
                      </div>
                    )}

                    {task.result && (
                      <div className="p-3 rounded bg-black border text-sm text-[#ccc] max-h-[200px] overflow-y-auto" style={{ borderColor: "var(--border-color)" }}>
                        {typeof task.result === "string" && !task.result.startsWith("Error:") ? (
                          <>
                            <div className="prose prose-invert prose-sm max-w-none font-sans">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.result.slice(0, 300)}</ReactMarkdown>
                            </div>
                            {task.result.length > 300 && (
                              <button
                                onClick={() => { setStudioTask(task); setStudioContent(task.result); }}
                                className="text-[#ff5c00] text-xs mt-2 hover:underline"
                              >
                                Voir tout →
                              </button>
                            )}
                          </>
                        ) : (
                          <pre className="whitespace-pre-wrap font-mono text-xs text-[#ccc]">
                            {safeStringResult(task.result).slice(0, 500)}
                            {safeStringResult(task.result).length > 500 && "..."}
                          </pre>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {(task.status === "queued" || task.status === "running") && (
                        <button
                          className="btn !py-1 text-xs hover:text-[#ef4444] hover:border-[#ef4444] hover:bg-[#ef4444]/10"
                          onClick={() => cancelTask(task.id)}
                        >
                          Annuler
                        </button>
                      )}

                      {(task.status === "failed" || task.status === "cancelled") && (
                        <button
                          className="btn !py-2 text-sm border-[#ef4444] text-[#ef4444] hover:bg-[#ef4444]/10"
                          onClick={() => openRetryModal(task)}
                          disabled={busy}
                        >
                          🔄 Relancer avec options
                        </button>
                      )}

                      {task.status === "done" && (
                        <>
                          <button
                            className="btn !py-1 text-xs"
                            onClick={() => { setStudioTask(task); setStudioContent(safeStringResult(task.result)); }}
                          >
                            Ouvrir dans le Studio
                          </button>
                          {!task.is_approved && (
                            <button
                              className="btn !py-1 text-xs border-[#10b981] text-[#10b981] hover:bg-[#10b981]/10"
                              onClick={() => approveTask(task)}
                            >
                              Approuver
                            </button>
                          )}
                        </>
                      )}

                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Retry Modal with Re-configuration */}
      {retryTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/80">
          <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-xl overflow-hidden border shadow-2xl" style={{ borderColor: "var(--border-color)", backgroundColor: "var(--bg-secondary)" }}>
            <div className="flex items-center justify-between p-4 border-b bg-[#000]" style={{ borderColor: "var(--border-color)" }}>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-[#ff5c00] px-2 py-1 rounded bg-[#ff5c00]/10 border border-[#ff5c00]/20">DOC-{retryTaskModal.id}</span>
                <h2 className="text-lg font-serif">Relancer avec nouveaux paramètres</h2>
              </div>
              <button className="text-[#888] hover:text-white transition-colors text-xl leading-none" onClick={closeRetryModal}>✕</button>
            </div>

            <form onSubmit={retryWithNewParams} className="p-4 space-y-4 overflow-y-auto">
              <div className="bg-[#ef4444]/10 border border-[#ef4444]/30 rounded p-3 mb-4">
                <p className="text-sm text-[#ef4444]">
                  <strong>Erreur précédente :</strong> {retryTaskModal.error_message || "Erreur inconnue"}
                </p>
              </div>

              <div>
                <label className="text-sm text-[#888] mb-1 block uppercase tracking-wider">Agent assigné</label>
                <select
                  className="input w-full text-sm py-2"
                  value={retryAgentId}
                  onChange={(e) => setRetryAgentId(e.target.value)}
                >
                  <option value="">Délégation automatique</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} ({agent.kind}){agent.specialty ? ` - ${agent.specialty}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-[#888] mb-1 block uppercase tracking-wider">Provider LLM</label>
                <select
                  className="input w-full text-sm py-2"
                  value={retryProvider}
                  onChange={(e) => {
                    setRetryProvider(e.target.value);
                    setRetryModel(PROVIDER_MODELS[e.target.value]?.[0] || "");
                  }}
                >
                  <option value="ollama">Ollama (Local)</option>
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Gemini</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="grok">xAI Grok</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-[#888] mb-1 block uppercase tracking-wider">Modèle</label>
                <select
                  className="input w-full text-sm py-2"
                  value={retryModel}
                  onChange={(e) => setRetryModel(e.target.value)}
                >
                  {PROVIDER_MODELS[retryProvider]?.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  <option value="custom">Custom...</option>
                </select>
                {retryModel === "custom" && (
                  <input
                    className="input w-full text-sm py-2 mt-2"
                    placeholder="Nom du modèle personnalisé..."
                    onChange={(e) => setRetryModel(e.target.value)}
                  />
                )}
              </div>

              <div className="pt-4 border-t flex gap-3" style={{ borderColor: "var(--border-color)" }}>
                <button type="button" className="btn" onClick={closeRetryModal}>Annuler</button>
                <button type="submit" className="btn primary flex-1" disabled={busy}>
                  {busy ? "Relancement..." : "🚀 Relancer la tâche"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
