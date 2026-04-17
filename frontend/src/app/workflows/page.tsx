"use client";

import React, { useEffect, useMemo, useState, useCallback, FormEvent } from "react";
import { apiGet, apiPost, apiFetch } from "../../lib/api";
import WorkflowTimeline from "../../components/workflow/WorkflowTimeline";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Step = {
  id: number;
  step_type: string;
  content: string;
  agent_name?: string;
  created_at: string;
};

type Workflow = {
  id: number;
  title: string;
  initial_prompt: string;
  status: string;
  final_result: string;
  steps: Step[];
  manager_agent_name: string;
  created_at: string;
};

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);

  // Cancel confirmation modal state
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<number | null>(null);

  // Delete confirmation modal state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Relaunch modal state - all workflow creation fields
  const [showRelaunchModal, setShowRelaunchModal] = useState(false);
  const [relaunchTitle, setRelaunchTitle] = useState("");
  const [relaunchPrompt, setRelaunchPrompt] = useState("");
  const [relaunchManagerId, setRelaunchManagerId] = useState<string>("");
  const [relaunchProvider, setRelaunchProvider] = useState("gemini");
  const [relaunchModel, setRelaunchModel] = useState("gemini-2.0-flash");
  const [relaunchApiKey, setRelaunchApiKey] = useState("");
  const [relaunchIsOllamaCloud, setRelaunchIsOllamaCloud] = useState(false);
  const [relaunchOllamaUrl, setRelaunchOllamaUrl] = useState("http://localhost:11434");
  const [relaunchDynamicModels, setRelaunchDynamicModels] = useState<string[]>([]);
  const [relaunchIsLoadingModels, setRelaunchIsLoadingModels] = useState(false);
  const [isRelaunching, setIsRelaunching] = useState(false);

  const PROVIDER_MODELS_FALLBACK: Record<string, string[]> = {
    ollama: ["llama3.3:latest", "llama3.2:latest", "llama3.1:8b"],
    openai: ["gpt-4o", "gpt-4o-mini", "o1-mini"],
    gemini: ["gemini-3.1-pro", "gemini-3.0-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    anthropic: ["claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022"],
    grok: ["grok-2-1212", "grok-beta"],
  };

  // Agents for manager selection
  const [agents, setAgents] = useState<{id: number; name: string; kind: string}[]>([]);

  const loadAgents = useCallback(async () => {
    try {
      const data = await apiGet<any>("/agents/");
      const agentList = Array.isArray(data) ? data : (data?.results || []);
      setAgents(agentList.filter((a: any) => a.kind === "primary"));
    } catch (err) {
      console.error("Failed to load agents", err);
    }
  }, []);

  const loadWorkflows = useCallback(async () => {
    try {
      setError(null);
      const data = await apiGet<any>("/workflows/");
      setWorkflows(Array.isArray(data) ? data : (data?.results || []));
    } catch (err: any) {
      console.error("Failed to load workflows", err);
      const msg = err?.message || "";
      if (msg.includes("Network error") || msg.includes("Unable to connect")) {
        setError(msg);
      } else {
        setError("Impossible de charger les workflows. Vérifiez que le backend est démarré.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const openCancelConfirm = useCallback((id: number) => {
    setCancelTargetId(id);
    setShowCancelConfirm(true);
  }, []);

  const handleCancel = useCallback(async () => {
    if (!cancelTargetId) return;
    try {
      await apiPost(`/workflows/${cancelTargetId}/cancel/`, {});
      await loadWorkflows();
      setShowCancelConfirm(false);
      setCancelTargetId(null);
    } catch (err) {
      console.error("Cancel failed", err);
    }
  }, [cancelTargetId, loadWorkflows]);

  const openDeleteConfirm = useCallback((id: number) => {
    setDeleteTargetId(id);
    setShowDeleteConfirm(true);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteTargetId) return;
    try {
      await apiFetch(`/workflows/${deleteTargetId}/`, { method: "DELETE" });
      await loadWorkflows();
      if (selectedWorkflow?.id === deleteTargetId) {
        setSelectedWorkflow(null);
      }
      setShowDeleteConfirm(false);
      setDeleteTargetId(null);
    } catch (err) {
      console.error("Delete failed", err);
      alert("Erreur lors de la suppression du workflow");
    }
  }, [deleteTargetId, loadWorkflows, selectedWorkflow]);

  const loadRelaunchModelsForProvider = useCallback(async (p: string, isCloud: boolean, cloudUrl?: string) => {
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
  }, [relaunchModel]);

  const openRelaunchModal = useCallback((workflow: Workflow) => {
    setRelaunchTitle(workflow.title);
    setRelaunchPrompt(workflow.initial_prompt);
    setRelaunchManagerId("");
    setRelaunchProvider("gemini");
    setRelaunchModel("gemini-2.0-flash");
    setRelaunchApiKey("");
    setRelaunchIsOllamaCloud(false);
    setRelaunchOllamaUrl("http://localhost:11434");
    setRelaunchDynamicModels(PROVIDER_MODELS_FALLBACK["gemini"]);
    setShowRelaunchModal(true);
    loadRelaunchModelsForProvider("gemini", false);
  }, []);

  const handleRelaunch = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedWorkflow) return;

    setIsRelaunching(true);
    try {
      const payload: Record<string, unknown> = {
        title: relaunchTitle,
        prompt: relaunchPrompt,
        manager_agent_id: relaunchManagerId ? Number(relaunchManagerId) : null,
        provider: relaunchProvider,
        model_name: relaunchModel,
        api_key: relaunchApiKey || "",
      };

      if (relaunchProvider === "ollama" && relaunchIsOllamaCloud) {
        payload.ollama_url = relaunchOllamaUrl;
      }

      await apiPost("/workflows/", payload);
      setShowRelaunchModal(false);
      await loadWorkflows();
    } catch (err) {
      console.error("Relaunch failed", err);
      alert("Erreur lors du relancement du workflow");
    } finally {
      setIsRelaunching(false);
    }
  }, [selectedWorkflow, relaunchTitle, relaunchPrompt, relaunchManagerId, relaunchProvider, relaunchModel, relaunchApiKey, relaunchIsOllamaCloud, relaunchOllamaUrl, showRelaunchModal, loadWorkflows]);

  useEffect(() => {
    loadWorkflows();
    loadAgents();
    const interval = setInterval(loadWorkflows, 10000);
    return () => clearInterval(interval);
  }, []);

  // Filter workflows based on search and status
  const filteredWorkflows = useMemo(() => {
    const safeWorkflows = Array.isArray(workflows) ? workflows : [];
    return safeWorkflows.filter(w => {
      const matchesSearch = searchQuery.trim() === "" ||
        w.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.initial_prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.manager_agent_name?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === "all" || w.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [workflows, searchQuery, statusFilter]);

  if (loading && workflows.length === 0) {
    return <div className="p-8 font-mono text-[#ff5c00] animate-pulse">Chargement de l'intelligence collective...</div>;
  }

  if (error) return (
    <div className="p-8">
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 max-w-2xl">
        <h2 className="text-red-500 font-mono text-sm uppercase tracking-widest mb-4">Erreur de connexion</h2>
        <p className="text-red-400/80 text-xs whitespace-pre-wrap font-mono leading-relaxed mb-4">
          Impossible de se connecter au backend. Vérifiez que le serveur est démarré et accessible.
        </p>
        {error && (
          <div className="bg-red-500/20 border-l-2 border-red-500/40 pl-3 pr-4 my-4 text-red-400 text-xs font-mono whitespace-pre-wrap">
            Détail technique : {error}
          </div>
        )}
        <div className="flex justify-end pt-4">
          <button
            onClick={() => { setLoading(true); loadWorkflows(); }}
            className="mt-4 btn border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white transition-all"
          >
            Réessayer
          </button>
          <button
            onClick={() => setError(null)}
            className="ml-4 btn border-transparent text-[#888] hover:bg-[#888]/20 hover:text-white transition-all"
          >
            Ignorer
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex overflow-hidden bg-[var(--bg-primary)] h-full">
      {/* List */}
      <div className="w-1/3 border-r border-[var(--border-color)] flex flex-col h-full bg-black/10">
        <header className="p-6 border-b border-[var(--border-color)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-serif">Workflows CEO</h1>
              <p className="text-[10px] text-[#888] font-mono uppercase tracking-widest mt-1">{filteredWorkflows.length} orchestration{filteredWorkflows.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          {/* Search Bar */}
          <div className="relative mb-3">
            <input
              type="text"
              placeholder="Rechercher..."
              className="input w-full !py-2 !pl-9 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]">🔍</span>
          </div>
          {/* Status Filter & Reset */}
          <div className="flex gap-2">
            <select
              className="flex-1 bg-[#1a1a1a] border border-[var(--border-color)] text-[11px] uppercase font-mono tracking-widest px-3 py-2 rounded text-white"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all" className="bg-[#1a1a1a] text-white">📋 Tous les statuts</option>
              <option value="thinking" className="bg-[#1a1a1a] text-white">🧠 En réflexion</option>
              <option value="delegating" className="bg-[#1a1a1a] text-white">⚡ En délégation</option>
              <option value="reviewing" className="bg-[#1a1a1a] text-white">👁 En révision</option>
              <option value="awaiting_approval" className="bg-[#1a1a1a] text-white">⏳ En attente</option>
              <option value="completed" className="bg-[#1a1a1a] text-[#10b981]">✅ Terminé</option>
              <option value="failed" className="bg-[#1a1a1a] text-red-400">❌ Échoué</option>
              <option value="cancelled" className="bg-[#1a1a1a] text-[#888]">🚫 Annulé</option>
            </select>
            {(searchQuery || statusFilter !== "all") && (
              <button
                onClick={() => { setSearchQuery(""); setStatusFilter("all"); }}
                className="px-3 py-2 bg-[#ff5c00]/20 hover:bg-[#ff5c00]/30 border border-[#ff5c00]/50 rounded text-[#ff5c00] text-xs font-mono uppercase tracking-widest transition-colors"
                title="Réinitialiser les filtres"
              >
                ✕
              </button>
            )}
          </div>
        </header>
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-color)]">
          {filteredWorkflows.length === 0 && (
            <div className="p-8 text-center text-[#666]">
              <div className="text-4xl mb-4">🔍</div>
              <p className="text-xs font-mono uppercase tracking-widest">Aucun workflow ne correspond</p>
            </div>
          )}
          {filteredWorkflows.map(w => (
            <button 
              key={w.id}
              onClick={() => setSelectedWorkflow(w)}
              className={`w-full p-6 text-left hover:bg-white/5 transition-all outline-none ${selectedWorkflow?.id === w.id ? 'bg-[#ff5c00]/5 border-r-2 border-[#ff5c00]' : ''}`}
            >
              <div className="flex justify-between items-center mb-2">
                <span className={`text-[9px] uppercase font-mono px-2 py-0.5 rounded font-black ${
                  w.status === 'completed' ? 'bg-[#10b981]/10 text-[#10b981]' : 'bg-[#ff5c00]/10 text-[#ff5c00]'
                }`}>{w.status}</span>
                <span className="text-[10px] text-[#555] font-mono">#{w.id}</span>
              </div>
              <h3 className={`font-serif text-lg mb-1 ${selectedWorkflow?.id === w.id ? 'text-[#ff5c00]' : 'text-white'}`}>{w.title}</h3>
              <p className="text-xs text-[#666] line-clamp-2 italic">“{w.initial_prompt}”</p>
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 overflow-y-auto p-10">
        {selectedWorkflow ? (
          <div>
            <div className="flex justify-between items-start mb-12 border-b border-[var(--border-color)] pb-8">
              <div>
                <h2 className="text-3xl font-serif mb-2">{selectedWorkflow.title}</h2>
                <div className="flex items-center gap-4 text-xs font-mono text-[#888]">
                  <span>Manager: <b className="text-[#ff5c00]">@{selectedWorkflow.manager_agent_name}</b></span>
                  <span>Lancé le {new Date(selectedWorkflow.created_at).toLocaleString()}</span>
                </div>
              </div>
              <div className="text-right flex flex-col items-end gap-3">
                <div>
                  <span className="block text-[10px] text-[#555] uppercase font-mono tracking-widest mb-1">Status Actuel</span>
                  <span className="text-lg font-serif text-[#ff5c00]">{selectedWorkflow.status}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {['thinking', 'delegating', 'reviewing', 'awaiting_approval'].includes(selectedWorkflow.status) && (
                    <button 
                      onClick={() => openCancelConfirm(selectedWorkflow.id)}
                      className="text-[10px] font-mono text-red-500 border border-red-500/30 px-3 py-1 rounded hover:bg-red-500 hover:text-white transition-all uppercase tracking-widest"
                    >
                      ⏹ Avorter l'orchestration
                    </button>
                  )}
                  {['completed', 'failed', 'cancelled'].includes(selectedWorkflow.status) && (
                    <button
                      onClick={() => openRelaunchModal(selectedWorkflow)}
                      className="text-[10px] font-mono text-[#ff5c00] border border-[#ff5c00]/30 px-3 py-1 rounded hover:bg-[#ff5c00] hover:text-white transition-all uppercase tracking-widest"
                    >
                      🔄 Relancer
                    </button>
                  )}
                  <button
                    onClick={() => openDeleteConfirm(selectedWorkflow.id)}
                    className="text-[10px] font-mono text-red-400 border border-red-400/30 px-3 py-1 rounded hover:bg-red-400 hover:text-white transition-all uppercase tracking-widest"
                  >
                    🗑 Supprimer
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <section>
                <WorkflowTimeline steps={selectedWorkflow.steps} status={selectedWorkflow.status} />
              </section>

              <section>
                <h3 className="text-xs font-mono uppercase tracking-[0.3em] text-[#888] mb-8">Dernier Livrable</h3>
                {selectedWorkflow.final_result ? (
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] p-8 rounded-xl prose prose-invert prose-sm max-w-none shadow-2xl">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedWorkflow.final_result}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="p-20 text-center border-2 border-dashed border-[var(--border-color)] rounded-xl opacity-20">
                    <div className="text-4xl mb-4">⏳</div>
                    <div className="text-xs font-mono uppercase tracking-widest">En attente de finalisation</div>
                  </div>
                )}
              </section>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center opacity-10">
            <div className="text-9xl mb-8">⚡</div>
            <p className="text-3xl font-serif">Sélectionnez une orchestration pour voir les coulisses</p>
          </div>
        )}
      </div>

      {/* Cancel Confirmation Modal - Warning Style */}
      {showCancelConfirm && (
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
                    Êtes-vous sûr de vouloir avorter cette orchestration ?
                  </p>
                  <p className="text-red-800 font-semibold text-xs mt-2">
                    Cette action arrêtera immédiatement le workflow en cours.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4 bg-yellow-500 border-t-2 border-red-500 flex gap-3">
              <button
                onClick={() => { setShowCancelConfirm(false); setCancelTargetId(null); }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded border-2 border-red-800 uppercase text-xs tracking-widest transition-colors"
              >
                Non, continuer
              </button>
              <button
                onClick={handleCancel}
                className="flex-1 bg-black hover:bg-gray-900 text-yellow-400 font-bold py-2 px-4 rounded border-2 border-red-500 uppercase text-xs tracking-widest transition-colors"
              >
                Oui, avorter
              </button>
            </div>
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
                    Êtes-vous sûr de vouloir supprimer définitivement ce workflow ?
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

      {/* Relaunch Modal */}
      {showRelaunchModal && selectedWorkflow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/80">
          <div className="w-full max-w-2xl bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-[var(--border-color)] bg-black/20 flex justify-between items-center">
              <h2 className="font-serif text-xl">🔄 Relancer l'orchestration</h2>
              <button onClick={() => setShowRelaunchModal(false)} className="text-[#888] hover:text-white">✕</button>
            </div>
            <form onSubmit={handleRelaunch} className="p-6 space-y-6">
              <div>
                <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block">Titre</label>
                <input
                  className="input w-full"
                  value={relaunchTitle}
                  onChange={(e) => setRelaunchTitle(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block">Prompt initial</label>
                <textarea
                  className="input w-full h-32 resize-none text-sm"
                  value={relaunchPrompt}
                  onChange={(e) => setRelaunchPrompt(e.target.value)}
                  placeholder="Décrivez votre besoin..."
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block">Manager Agent (Optionnel)</label>
                  <select
                    className="input w-full text-xs"
                    value={relaunchManagerId}
                    onChange={(e) => setRelaunchManagerId(e.target.value)}
                  >
                    <option value="">Auto-sélection</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block">Fournisseur IA</label>
                  <select
                    className="input w-full text-xs"
                    value={relaunchProvider}
                    onChange={(e) => {
                      setRelaunchProvider(e.target.value);
                      setRelaunchIsOllamaCloud(false);
                      loadRelaunchModelsForProvider(e.target.value, false);
                    }}
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="openai">OpenAI ChatGPT</option>
                    <option value="anthropic">Anthropic Claude</option>
                    <option value="ollama">Ollama</option>
                    <option value="grok">xAI Grok</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block flex justify-between">
                    <span>Modèle IA</span>
                    {relaunchIsLoadingModels && <span className="animate-spin">⌛</span>}
                  </label>
                  <div className="flex gap-1">
                    <select
                      className="input w-full text-xs"
                      value={relaunchModel}
                      onChange={(e) => setRelaunchModel(e.target.value)}
                    >
                      {relaunchDynamicModels.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                      <option value="custom">-- Personnalisé --</option>
                    </select>
                    <button
                      type="button"
                      className="btn !p-1 text-[10px]"
                      title="Rafraîchir"
                      onClick={() => loadRelaunchModelsForProvider(relaunchProvider, relaunchIsOllamaCloud, relaunchOllamaUrl)}
                    >
                      🔄
                    </button>
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
              </div>
              {relaunchProvider === "ollama" && (
                <div className="p-3 bg-[#ff5c00]/5 border border-[#ff5c00]/20 rounded-lg space-y-3">
                  <div className="flex items-center gap-3">
                    <label className="text-[9px] uppercase font-mono flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="relaunchOllamaMode"
                        checked={!relaunchIsOllamaCloud}
                        onChange={() => {
                          setRelaunchIsOllamaCloud(false);
                          loadRelaunchModelsForProvider("ollama", false);
                        }}
                      /> Local
                    </label>
                    <label className="text-[9px] uppercase font-mono flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="relaunchOllamaMode"
                        checked={relaunchIsOllamaCloud}
                        onChange={() => {
                          setRelaunchIsOllamaCloud(true);
                          loadRelaunchModelsForProvider("ollama", true, relaunchOllamaUrl);
                        }}
                      /> Cloud/Remote
                    </label>
                  </div>
                  {relaunchIsOllamaCloud && (
                    <input
                      className="input w-full text-[10px]"
                      placeholder="http://votre-ollama:11434"
                      value={relaunchOllamaUrl}
                      onChange={(e) => setRelaunchOllamaUrl(e.target.value)}
                      onBlur={() => loadRelaunchModelsForProvider("ollama", true, relaunchOllamaUrl)}
                    />
                  )}
                </div>
              )}
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowRelaunchModal(false)}
                  className="btn flex-1"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn primary flex-1"
                  disabled={isRelaunching}
                >
                  {isRelaunching ? "Lancement..." : "Lancer l'Orchestration ⚡"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
