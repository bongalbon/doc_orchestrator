"use client";

import React, { useEffect, useMemo, useState, FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiGet, apiPost, apiFetch, API_BASE } from "../../lib/api";

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
  ollama_url?: string;
};

type Agent = {
  id: number;
  name: string;
  kind: "primary" | "sub";
  specialty?: string;
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [approvalFilter, setApprovalFilter] = useState<string>("all");

  // Create Task State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState("Nouvelle Analyse");
  const [taskPrompt, setTaskPrompt] = useState("");
  const [provider, setProvider] = useState("gemini");
  const [modelName, setModelName] = useState("gemini-2.0-flash");
  const [targetAgentId, setTargetAgentId] = useState<string>("");
  const [apiKey, setApiKey] = useState("");
  const [isCEOMode, setIsCEOMode] = useState(false);
  const [isOllamaCloud, setIsOllamaCloud] = useState(false);
  const [ollamaCloudUrl, setOllamaCloudUrl] = useState("http://localhost:11434");
  const [dynamicModels, setDynamicModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // Studio & Retry States
  const [studioTask, setStudioTask] = useState<AgentTask | null>(null);
  const [studioContent, setStudioContent] = useState("");
  const [retryTaskModal, setRetryTaskModal] = useState<AgentTask | null>(null);
  const [retryAgentId, setRetryAgentId] = useState<string>("");
  const [retryProvider, setRetryProvider] = useState<string>("gemini");
  const [retryModel, setRetryModel] = useState<string>("gemini-2.0-flash");

  // Relaunch Task Modal State
  const [relaunchTaskModal, setRelaunchTaskModal] = useState<AgentTask | null>(null);
  const [relaunchTitle, setRelaunchTitle] = useState("");
  const [relaunchPrompt, setRelaunchPrompt] = useState("");
  const [relaunchAgentId, setRelaunchAgentId] = useState<string>("");
  const [relaunchProvider, setRelaunchProvider] = useState("gemini");
  const [relaunchModel, setRelaunchModel] = useState("gemini-2.0-flash");
  const [relaunchApiKey, setRelaunchApiKey] = useState("");
  const [relaunchIsOllamaCloud, setRelaunchIsOllamaCloud] = useState(false);
  const [relaunchOllamaUrl, setRelaunchOllamaUrl] = useState("http://localhost:11434");
  const [relaunchDynamicModels, setRelaunchDynamicModels] = useState<string[]>([]);
  const [relaunchIsLoadingModels, setRelaunchIsLoadingModels] = useState(false);

  // Delete confirmation modal state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  const PROVIDER_MODELS_FALLBACK: Record<string, string[]> = {
    ollama: ["llama3.3:latest", "llama3.2:latest", "llama3.1:8b"],
    openai: ["gpt-4o", "gpt-4o-mini", "o1-mini"],
    gemini: ["gemini-3.1-pro", "gemini-3.0-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    anthropic: ["claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022"],
    grok: ["grok-2-1212", "grok-beta"],
  };

  async function loadModelsForProvider(p: string, isCloud: boolean, cloudUrl?: string) {
    setIsLoadingModels(true);
    try {
      let endpoint = `/tasks/provider-models/?provider=${p}`;
      if (p === "ollama") {
        endpoint = isCloud && cloudUrl ? `/tasks/ollama-models/?url=${encodeURIComponent(cloudUrl)}` : `/tasks/ollama-models/`;
      }
      const data = await apiGet<{ models: string[], error?: string }>(endpoint);
      if (data.models && data.models.length > 0) {
        setDynamicModels(data.models);
        if (!data.models.includes(modelName)) setModelName(data.models[0]);
      } else {
        setDynamicModels(PROVIDER_MODELS_FALLBACK[p] || []);
      }
    } catch (err) {
      console.error("Failed to fetch models", err);
      setDynamicModels(PROVIDER_MODELS_FALLBACK[p] || []);
    } finally {
      setIsLoadingModels(false);
    }
  }

  useEffect(() => {
    if (showCreateForm) {
      loadModelsForProvider(provider, isOllamaCloud, ollamaCloudUrl);
    }
  }, [provider, isOllamaCloud, showCreateForm]);

  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    try {
      setError(null);
      const [taskData, agentsData] = await Promise.all([
        apiGet<AgentTask[]>("/tasks/"),
        apiGet<Agent[]>("/agents/"),
      ]);
      setTasks(taskData);
      setAgents(agentsData);
    } catch (err: any) {
      console.error("Failed to load tasks data", err);
      const msg = err?.message || "";
      if (msg.includes("Network error") || msg.includes("Unable to connect")) {
        setError(msg);
      } else {
        setError("Impossible de charger les données. Vérifiez que le backend est démarré.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 5000);
    return () => clearInterval(interval);
  }, []);

  async function handleCreateTask(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (isCEOMode) {
        await apiPost("/workflows/", {
          title: taskTitle,
          prompt: taskPrompt,
          manager_agent_id: targetAgentId ? Number(targetAgentId) : null,
        });
      } else {
        await apiPost<AgentTask>("/tasks/", {
          title: taskTitle,
          prompt: taskPrompt,
          provider,
          model_name: modelName,
          api_key: apiKey || "", // If empty, backend will fetch from ProviderCredential
          ollama_url: (provider === "ollama" && isOllamaCloud) ? ollamaCloudUrl : null,
          requested_agent_id: targetAgentId ? Number(targetAgentId) : null,
        });
      }
      setTaskPrompt("");
      setShowCreateForm(false);
      await loadAll();
    } catch (err: any) {
      console.error("Task creation failed", err);
      alert("Erreur lors du lancement : " + (err.message || "Vérifiez vos paramètres API ou votre connexion."));
    } finally {
      setBusy(false);
    }
  }

  // Old handleRelaunch - kept for compatibility with failed tasks retry button
  function handleRelaunchOld(task: AgentTask) {
    setTaskTitle(task.title);
    setTaskPrompt(task.prompt);
    setProvider(task.provider || "gemini");
    setModelName(task.model || "");
    setTargetAgentId(task.assigned_agent_id?.toString() || "");
    if (task.provider === "ollama" && task.ollama_url) {
      setIsOllamaCloud(true);
      setOllamaCloudUrl(task.ollama_url);
    } else {
      setIsOllamaCloud(false);
    }
    setIsCEOMode(false);
    setShowCreateForm(true);
  }

  // New relaunch modal functions
  async function loadRelaunchModelsForProvider(p: string, isCloud: boolean, cloudUrl?: string) {
    setRelaunchIsLoadingModels(true);
    try {
      let endpoint = `/tasks/provider-models/?provider=${p}`;
      if (p === "ollama") {
        endpoint = isCloud && cloudUrl ? `/tasks/ollama-models/?url=${encodeURIComponent(cloudUrl)}` : `/tasks/ollama-models/`;
      }
      const data = await apiGet<{ models: string[]; error?: string }>(endpoint);
      if (data.models && data.models.length > 0) {
        setRelaunchDynamicModels(data.models);
        if (!data.models.includes(relaunchModel)) setRelaunchModel(data.models[0]);
      } else {
        setRelaunchDynamicModels(PROVIDER_MODELS_FALLBACK[p] || []);
      }
    } catch (err) {
      console.error("Failed to fetch models", err);
      setRelaunchDynamicModels(PROVIDER_MODELS_FALLBACK[p] || []);
    } finally {
      setRelaunchIsLoadingModels(false);
    }
  }

  function openRelaunchModal(task: AgentTask) {
    setRelaunchTaskModal(task);
    setRelaunchTitle(task.title);
    setRelaunchPrompt(task.prompt);
    setRelaunchAgentId(task.assigned_agent_id?.toString() || "");
    setRelaunchProvider(task.provider || "gemini");
    setRelaunchModel(task.model || "gemini-2.0-flash");
    setRelaunchApiKey("");
    setRelaunchIsOllamaCloud(false);
    setRelaunchOllamaUrl(task.ollama_url || "http://localhost:11434");
    setRelaunchDynamicModels(PROVIDER_MODELS_FALLBACK[task.provider || "gemini"]);
    loadRelaunchModelsForProvider(task.provider || "gemini", false);
  }

  async function handleRelaunchSubmit(e: FormEvent) {
    e.preventDefault();
    if (!relaunchTaskModal) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        title: relaunchTitle,
        prompt: relaunchPrompt,
        provider: relaunchProvider,
        model_name: relaunchModel,
        api_key: relaunchApiKey || "",
        requested_agent_id: relaunchAgentId ? Number(relaunchAgentId) : null,
      };

      if (relaunchProvider === "ollama" && relaunchIsOllamaCloud) {
        payload.ollama_url = relaunchOllamaUrl;
      }

      await apiPost<AgentTask>("/tasks/", payload);
      setRelaunchTaskModal(null);
      await loadAll();
    } catch (err: any) {
      console.error("Relaunch failed", err);
      alert("Erreur lors du relancement : " + (err.message || "Vérifiez vos paramètres."));
    } finally {
      setBusy(false);
    }
  }

  // Delete confirmation functions
  function openDeleteConfirm(id: number) {
    setDeleteTargetId(id);
    setShowDeleteConfirm(true);
  }

  async function handleDelete() {
    if (!deleteTargetId) return;
    try {
      await apiFetch(`/tasks/${deleteTargetId}/`, { method: "DELETE" });
      await loadAll();
      setShowDeleteConfirm(false);
      setDeleteTargetId(null);
    } catch (err) {
      console.error("Delete failed", err);
      alert("Erreur lors de la suppression de la tâche");
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

  async function saveStudioResult() {
    if (!studioTask) return;
    setBusy(true);
    try {
      await apiFetch(`/tasks/${studioTask.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: studioContent }),
      });
      setStudioTask(null);
      await loadAll();
    } finally {
      setBusy(false);
    }
  }

  const handleExport = async (format: "docx" | "pdf" | "xlsx") => {
    if (!studioTask) return;
    const token = window.localStorage.getItem("jwtAccess") || window.localStorage.getItem("authToken");
    try {
      const response = await fetch(`${API_BASE}/tasks/${studioTask.id}/export/?fmt=${format}`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
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

  const filteredTasks = useMemo(() => {
    let result = [...tasks];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t => t.title.toLowerCase().includes(q) || t.prompt.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") result = result.filter(t => t.status === statusFilter);
    if (approvalFilter === "approved") result = result.filter(t => t.is_approved);
    if (approvalFilter === "pending") result = result.filter(t => t.status === "done" && !t.is_approved);
    return result;
  }, [tasks, searchQuery, statusFilter, approvalFilter]);

  if (loading) return <div className="p-8 font-mono text-[#ff5c00] animate-pulse">Synchronisation des orchestrations...</div>;

  if (error) return (
    <div className="p-8">
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 max-w-2xl">
        <h2 className="text-red-500 font-mono text-sm uppercase tracking-widest mb-4">Erreur de connexion</h2>
        <pre className="text-red-400/80 text-xs whitespace-pre-wrap font-mono leading-relaxed">{error}</pre>
        <button
          onClick={() => { setLoading(true); loadAll(); }}
          className="mt-4 btn border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white transition-all"
        >
          Réessayer
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-[var(--bg-primary)]">
      {/* Search & Header */}
      <header className="p-6 border-b border-[var(--border-color)] flex flex-wrap items-center justify-between gap-4 bg-black/10">
        <div>
          <h1 className="text-2xl font-serif">Centre d'Orchestration</h1>
          <p className="text-[10px] text-[#888] font-mono uppercase tracking-widest mt-1">{filteredTasks.length} tâches actives</p>
        </div>
        <div className="flex gap-3">
          <input 
            type="text" 
            placeholder="Rechercher une tâche..." 
            className="input !py-2 !px-4 text-sm w-64 bg-black/30"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button className="btn primary !py-1 !px-4 text-xs font-bold uppercase tracking-widest flex items-center gap-2" onClick={() => setShowCreateForm(true)}>
            <span className="text-lg">+</span> Nouvelle Tâche
          </button>
        </div>
      </header>

      {/* Filters Bar */}
      <div className="px-6 py-3 border-b border-[var(--border-color)] flex gap-4 overflow-x-auto bg-black/5 items-center">
        <select className="bg-[#1a1a1a] border border-[var(--border-color)] text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded text-white" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all" className="bg-[#1a1a1a] text-white">📋 Tous les Statuts</option>
          <option value="running" className="bg-[#1a1a1a] text-white">⚡ En Cours</option>
          <option value="done" className="bg-[#1a1a1a] text-[#10b981]">✅ Terminé</option>
          <option value="failed" className="bg-[#1a1a1a] text-red-400">❌ Échec</option>
          <option value="cancelled" className="bg-[#1a1a1a] text-[#888]">🚫 Annulé</option>
        </select>
        <select className="bg-[#1a1a1a] border border-[var(--border-color)] text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded text-white" value={approvalFilter} onChange={(e) => setApprovalFilter(e.target.value)}>
          <option value="all" className="bg-[#1a1a1a] text-white">📋 Toutes Approbations</option>
          <option value="approved" className="bg-[#1a1a1a] text-[#10b981]">✅ Approuvé</option>
          <option value="pending" className="bg-[#1a1a1a] text-[#ff5c00]">⏳ En attente</option>
        </select>
        {(searchQuery || statusFilter !== "all" || approvalFilter !== "all") && (
          <button
            onClick={() => { setSearchQuery(""); setStatusFilter("all"); setApprovalFilter("all"); }}
            className="px-2 py-1 bg-[#ff5c00]/20 hover:bg-[#ff5c00]/30 border border-[#ff5c00]/50 rounded text-[#ff5c00] text-xs font-mono uppercase tracking-widest transition-colors"
            title="Réinitialiser les filtres"
          >
            ✕ Reset
          </button>
        )}
      </div>

      {/* Tasks List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {filteredTasks.map((task) => (
          <article key={task.id} className="panel flex flex-col border border-[var(--border-color)] rounded-xl bg-[var(--bg-secondary)] hover:border-[#ff5c00]/30 transition-all overflow-hidden group">
            <div className="p-4 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-mono text-[#666] bg-black/40 px-2 py-0.5 rounded border border-white/5">DOC-{task.id}</span>
                  <span className={`text-[9px] uppercase font-mono px-2 py-0.5 rounded font-bold ${
                    task.status === 'done' ? 'bg-[#10b981]/20 text-[#10b981]' : 
                    task.status === 'failed' ? 'bg-[#ef4444]/20 text-[#ef4444]' : 
                    'bg-[#ff5c00]/20 text-[#ff5c00] animate-pulse'
                  }`}>{task.status}</span>
                  {task.is_approved && <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30">Approuvé</span>}
                </div>
                <h3 className="text-lg font-serif mb-1 group-hover:text-[#ff5c00] transition-colors">{task.title}</h3>
                <p className="text-xs text-[#888] line-clamp-2 italic">“{task.prompt}”</p>
              </div>
                            <div className="flex flex-col items-end gap-2 shrink-0">
                <span className="text-[10px] font-mono text-[#ff5c00] uppercase tracking-widest">@{task.assigned_agent_name || "Routeur"}</span>
                <div className="flex gap-2 mt-2 flex-wrap justify-end">
                   {/* Existing buttons for running/queued tasks */}
                   {(task.status === 'running' || task.status === 'queued') && (
                     <button 
                        className="btn !py-1 !px-3 text-[10px] border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white transition-all uppercase"
                        onClick={async () => {
                          if (confirm("Voulez-vous vraiment annuler cette tâche ?")) {
                            await apiPost(`/tasks/${task.id}/cancel/`, {});
                            await loadAll();
                          }
                        }}
                      >
                        ⏹ Annuler
                      </button>
                   )}
                   {/* Existing Studio and Approve buttons for done tasks */}
                   {task.status === 'done' && (
                     <>
                      <button className="btn !py-1 !px-3 text-[10px]" onClick={() => {setStudioTask(task); setStudioContent(task.result);}}>Studio</button>
                      {!task.is_approved && <button className="btn primary !py-1 !px-3 text-[10px]" onClick={() => approveTask(task)}>Approuver</button>}
                     </>
                   )}
                   {/* Old retry button for failed tasks */}
                   {task.status === 'failed' && (
                      <button className="btn !py-1 !px-3 text-[10px] border-[#ef4444] text-[#ef4444] hover:bg-[#ef4444] hover:text-white transition-all" onClick={() => handleRelaunchOld(task)}>
                        Réessayer 🔄
                      </button>
                   )}
                   {/* NEW: Relaunch button for all tasks (including done) */}
                   <button 
                     className="btn !py-1 !px-3 text-[10px] border-[#ff5c00] text-[#ff5c00] hover:bg-[#ff5c00] hover:text-white transition-all"
                     onClick={() => openRelaunchModal(task)}
                   >
                     🔄 Relancer
                   </button>
                   {/* NEW: Delete button for all tasks */}
                   <button 
                     className="btn !py-1 !px-3 text-[10px] border-red-400/50 text-red-400 hover:bg-red-400 hover:text-white transition-all"
                     onClick={() => openDeleteConfirm(task.id)}
                   >
                     🗑 Supprimer
                   </button>
                </div>
              </div>
            </div>
            {task.status === 'failed' && task.error_message && (
              <div className="mx-4 mb-4 p-2 bg-[#ef4444]/10 border border-[#ef4444]/20 rounded text-[10px] font-mono text-[#ef4444]">
                ERREUR: {task.error_message}
              </div>
            )}
          </article>
        ))}
        {filteredTasks.length === 0 && <div className="text-center py-20 text-[#555] italic">Aucune tâche ne correspond à vos recherches</div>}
      </div>

      {/* Modals: Create, Studio, Retry */}
      
      {/* Create Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/80">
          <div className="w-full max-w-2xl bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-[var(--border-color)] bg-black/20 flex justify-between items-center">
              <h2 className="font-serif text-xl">Lancer une nouvelle tâche</h2>
              <button onClick={() => setShowCreateForm(false)} className="text-[#888] hover:text-white">✕</button>
            </div>
            <form onSubmit={handleCreateTask} className="p-6 grid grid-cols-2 gap-6">
              <div className="col-span-2">
                <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block">Titre de la tâche</label>
                <input className="input w-full" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} required />
              </div>
              <div className="col-span-2 flex items-center gap-2 p-3 bg-[#ff5c00]/5 border border-[#ff5c00]/20 rounded-lg">
                <input 
                  type="checkbox" 
                  id="ceoMode"
                  className="w-4 h-4 accent-[#ff5c00]" 
                  checked={isCEOMode} 
                  onChange={(e) => setIsCEOMode(e.target.checked)} 
                />
                <label htmlFor="ceoMode" className="text-xs font-bold text-[#ff5c00] cursor-pointer uppercase tracking-tighter">
                  Activer le Mode CEO (Orchestration multi-agents & Recrutement Autonome)
                </label>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block">Prompt de l'utilisateur</label>
                <textarea className="input w-full h-32 resize-none text-sm" value={taskPrompt} onChange={(e) => setTaskPrompt(e.target.value)} placeholder="Décrivez votre besoin..." required />
              </div>
              <div>
                <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block">Agent Cible</label>
                <select className="input w-full text-xs" value={targetAgentId} onChange={(e) => setTargetAgentId(e.target.value)}>
                  <option value="">Sélectionner l'agent idéal</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.kind})</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block">Fournisseur</label>
                <select className="input w-full text-xs" value={provider} onChange={(e) => {
                  setProvider(e.target.value);
                  setIsOllamaCloud(false);
                }}>
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI ChatGPT</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="ollama">Ollama</option>
                  <option value="grok">xAI Grok</option>
                </select>
                {provider === "ollama" && (
                   <div className="mt-2 flex items-center gap-3">
                      <label className="text-[9px] uppercase font-mono flex items-center gap-1 cursor-pointer">
                        <input type="radio" name="ollamaMode" checked={!isOllamaCloud} onChange={() => setIsOllamaCloud(false)} /> Local
                      </label>
                      <label className="text-[9px] uppercase font-mono flex items-center gap-1 cursor-pointer">
                        <input type="radio" name="ollamaMode" checked={isOllamaCloud} onChange={() => setIsOllamaCloud(true)} /> Cloud/Remote
                      </label>
                   </div>
                )}
                {provider === "ollama" && isOllamaCloud && (
                   <input 
                     className="input w-full mt-2 text-[10px]" 
                     placeholder="http://votre-ollama:11434"
                     value={ollamaCloudUrl}
                     onChange={(e) => setOllamaCloudUrl(e.target.value)}
                     onBlur={() => loadModelsForProvider(provider, isOllamaCloud, ollamaCloudUrl)}
                   />
                )}
              </div>
              <div>
                <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block flex justify-between">
                  <span>Modèle d'IA</span>
                  {isLoadingModels && <span className="animate-spin">⌛</span>}
                </label>
                <div className="flex gap-1">
                  <select className="input w-full text-xs" value={modelName} onChange={(e) => setModelName(e.target.value)}>
                    {dynamicModels.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    <option value="custom">-- Personnalisé --</option>
                  </select>
                  <button type="button" className="btn !p-1 text-[10px]" title="Rafraîchir" onClick={() => loadModelsForProvider(provider, isOllamaCloud, ollamaCloudUrl)}>🔄</button>
                </div>
                {modelName === "custom" && (
                   <input 
                     className="input w-full mt-2 text-xs" 
                     placeholder="ID du modèle (ex: llama3.1:70b)" 
                     onChange={(e) => setModelName(e.target.value)}
                   />
                )}
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block">
                  Clé API (Optionnel)
                </label>
                <input 
                  type="password" 
                  className="input w-full text-xs" 
                  placeholder="Laisser vide pour utiliser la clé enregistrée dans vos paramètres" 
                  value={apiKey} 
                  onChange={(e) => setApiKey(e.target.value)} 
                />
              </div>
              <div className="col-span-2 pt-4 flex gap-3">
                <button type="button" onClick={() => setShowCreateForm(false)} className="btn flex-1">Annuler</button>
                <button type="submit" className="btn primary flex-1" disabled={busy}>Lancer l'Orchestration ⚡</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Studio Modal */}
      {studioTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/80">
          <div className="w-full max-w-6xl h-[90vh] bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 border-b border-[var(--border-color)] bg-black/30 flex justify-between items-center shrink-0">
               <div className="flex items-center gap-3">
                 <span className="text-[10px] font-mono text-[#ff5c00] border border-[#ff5c00]/30 px-2 py-0.5 rounded">STUDIO</span>
                 <h2 className="font-serif text-xl">{studioTask.title}</h2>
               </div>
               <button onClick={() => setStudioTask(null)} className="text-[#888] hover:text-white transition-colors text-xl">✕</button>
            </div>

            <div className="flex-1 flex overflow-hidden">
               {/* Preview */}
               <div className="flex-1 overflow-y-auto p-10 bg-black/40 prose prose-invert max-w-none prose-sm font-sans prose-p:text-[#ccc]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{studioContent}</ReactMarkdown>
               </div>
               {/* Editor */}
               <div className="w-[450px] border-l border-[var(--border-color)] flex flex-col bg-black/20">
                  <div className="p-3 border-b border-[var(--border-color)] text-[10px] uppercase font-mono tracking-widest text-[#555] bg-black/40">Markdown Source</div>
                  <textarea
                    className="flex-1 w-full p-6 bg-transparent text-[#ddd] font-mono text-sm leading-relaxed focus:outline-none resize-none"
                    value={studioContent}
                    onChange={(e) => setStudioContent(e.target.value)}
                  />
               </div>
            </div>

            <div className="p-4 border-t border-[var(--border-color)] bg-black/40 flex justify-between items-center shrink-0">
               <div className="flex gap-2">
                 <button className="btn !py-1 !px-3 text-xs" onClick={() => handleExport("docx")}>⭳ Word</button>
                 <button className="btn !py-1 !px-3 text-xs" onClick={() => handleExport("pdf")}>⭳ PDF</button>
               </div>
               <div className="flex gap-3">
                 <button className="btn !px-6" onClick={() => setStudioTask(null)}>Fermer</button>
                 <button className="btn primary !px-6 font-bold" onClick={saveStudioResult} disabled={busy}>Sync & Enregistrer</button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Relaunch Task Modal */}
      {relaunchTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/80">
          <div className="w-full max-w-2xl bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-[var(--border-color)] bg-black/20 flex justify-between items-center">
              <h2 className="font-serif text-xl">🔄 Relancer la tâche</h2>
              <button onClick={() => setRelaunchTaskModal(null)} className="text-[#888] hover:text-white">✕</button>
            </div>
            <form onSubmit={handleRelaunchSubmit} className="p-6 grid grid-cols-2 gap-6">
              <div className="col-span-2">
                <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block">Titre de la tâche</label>
                <input className="input w-full" value={relaunchTitle} onChange={(e) => setRelaunchTitle(e.target.value)} required />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block">Prompt de l'utilisateur</label>
                <textarea className="input w-full h-32 resize-none text-sm" value={relaunchPrompt} onChange={(e) => setRelaunchPrompt(e.target.value)} placeholder="Décrivez votre besoin..." required />
              </div>
              <div>
                <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block">Agent Cible</label>
                <select className="input w-full text-xs" value={relaunchAgentId} onChange={(e) => setRelaunchAgentId(e.target.value)}>
                  <option value="">Sélectionner l&apos;agent idéal</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.kind})</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block">Fournisseur</label>
                <select className="input w-full text-xs" value={relaunchProvider} onChange={(e) => {
                  setRelaunchProvider(e.target.value);
                  setRelaunchIsOllamaCloud(false);
                  loadRelaunchModelsForProvider(e.target.value, false);
                }}>
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI ChatGPT</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="ollama">Ollama</option>
                  <option value="grok">xAI Grok</option>
                </select>
                {relaunchProvider === "ollama" && (
                   <div className="mt-2 flex items-center gap-3">
                      <label className="text-[9px] uppercase font-mono flex items-center gap-1 cursor-pointer">
                        <input type="radio" name="relaunchOllamaMode" checked={!relaunchIsOllamaCloud} onChange={() => { setRelaunchIsOllamaCloud(false); loadRelaunchModelsForProvider("ollama", false); }} /> Local
                      </label>
                      <label className="text-[9px] uppercase font-mono flex items-center gap-1 cursor-pointer">
                        <input type="radio" name="relaunchOllamaMode" checked={relaunchIsOllamaCloud} onChange={() => { setRelaunchIsOllamaCloud(true); loadRelaunchModelsForProvider("ollama", true, relaunchOllamaUrl); }} /> Cloud/Remote
                      </label>
                   </div>
                )}
                {relaunchProvider === "ollama" && relaunchIsOllamaCloud && (
                   <input
                     className="input w-full mt-2 text-[10px]"
                     placeholder="http://votre-ollama:11434"
                     value={relaunchOllamaUrl}
                     onChange={(e) => setRelaunchOllamaUrl(e.target.value)}
                     onBlur={() => loadRelaunchModelsForProvider(relaunchProvider, relaunchIsOllamaCloud, relaunchOllamaUrl)}
                   />
                )}
              </div>
              <div>
                <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block flex justify-between">
                  <span>Modèle d&apos;IA</span>
                  {relaunchIsLoadingModels && <span className="animate-spin">⌛</span>}
                </label>
                <div className="flex gap-1">
                  <select className="input w-full text-xs" value={relaunchModel} onChange={(e) => setRelaunchModel(e.target.value)}>
                    {relaunchDynamicModels.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    <option value="custom">-- Personnalisé --</option>
                  </select>
                  <button type="button" className="btn !p-1 text-[10px]" title="Rafraîchir" onClick={() => loadRelaunchModelsForProvider(relaunchProvider, relaunchIsOllamaCloud, relaunchOllamaUrl)}>🔄</button>
                </div>
                {relaunchModel === "custom" && (
                   <input
                     className="input w-full mt-2 text-xs"
                     placeholder="ID du modèle (ex: llama3.1:70b)"
                     onChange={(e) => setRelaunchModel(e.target.value)}
                   />
                )}
              </div>
              <div>
                <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block">
                  Clé API (Optionnel)
                </label>
                <input
                  type="password"
                  className="input w-full text-xs"
                  placeholder="Laisser vide pour utiliser la clé enregistrée"
                  value={relaunchApiKey}
                  onChange={(e) => setRelaunchApiKey(e.target.value)}
                />
              </div>
              <div className="col-span-2 pt-4 flex gap-3">
                <button type="button" onClick={() => setRelaunchTaskModal(null)} className="btn flex-1">Annuler</button>
                <button type="submit" className="btn primary flex-1" disabled={busy}>🔄 Relancer la tâche</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal - Warning Style */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/80">
          <div className="w-full max-w-md bg-yellow-400 border-4 border-red-500 rounded-xl overflow-hidden shadow-2xl">
            <div className="p-6">
              <div className="flex items-start gap-4">
                {/* Warning Triangle Icon */}
                <div className="shrink-0 w-16 h-16 bg-red-500 rounded-full flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-10 h-10 fill-current text-black" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L2 22h20L12 2zm0 3.5L18.5 20h-13L12 5.5z"/>
                    <text x="12" y="18" textAnchor="middle" className="text-[14px] font-black fill-black">!</text>
                  </svg>
                </div>
                <div className="flex-1">
                  <h2 className="text-red-600 font-black text-lg uppercase tracking-wider mb-2">⚠️ Attention</h2>
                  <p className="text-red-700 font-bold text-sm leading-relaxed">
                    Êtes-vous sûr de vouloir supprimer définitivement cette tâche ?
                  </p>
                  <p className="text-red-800 font-semibold text-xs mt-2">
                    Cette action est irréversible.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4 bg-yellow-500 border-t-2 border-red-500 flex gap-3">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteTargetId(null); }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded border-2 border-red-800 uppercase text-xs tracking-widest transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 bg-black hover:bg-gray-900 text-yellow-400 font-bold py-2 px-4 rounded border-2 border-red-500 uppercase text-xs tracking-widest transition-colors"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
