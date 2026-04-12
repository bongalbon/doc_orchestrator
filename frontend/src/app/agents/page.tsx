"use client";

import React, { FormEvent, useEffect, useState } from "react";
import { apiGet, apiPost, apiFetch } from "../../lib/api";

type Agent = {
  id: number;
  name: string;
  kind: "primary" | "sub";
  specialty: string;
  parent: number | null;
  is_active: boolean;
  system_prompt: string;
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Creation State
  const [agentName, setAgentName] = useState("");
  const [agentKind, setAgentKind] = useState<"primary" | "sub">("sub");
  const [specialty, setSpecialty] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [systemPrompt, setSystemPrompt] = useState("");

  // Editing State
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  async function loadAgents() {
    try {
      const data = await apiGet<Agent[]>("/agents/");
      setAgents(data);
    } catch (err) {
      console.error("Failed to load agents", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAgents();
  }, []);

  async function createAgent(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiPost<Agent>("/agents/", {
        name: agentName,
        kind: agentKind,
        specialty,
        parent: agentKind === "sub" && parentId ? Number(parentId) : null,
        system_prompt: systemPrompt || `You are ${agentName}, specialist in ${specialty || "general tasks"}.`,
      });
      setAgentName("");
      setSpecialty("");
      setParentId("");
      setSystemPrompt("");
      await loadAgents();
    } catch (err: any) {
      console.error("Agent creation failed", err);
      alert("Échec du recrutement : " + (err.message || "Erreur inconnue. Vérifiez si ce nom d'agent existe déjà."));
    } finally {
      setBusy(false);
    }
  }

  async function updateAgent(e: FormEvent) {
    e.preventDefault();
    if (!editingAgent) return;
    setBusy(true);
    try {
      await apiFetch<Agent>(`/agents/${editingAgent.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingAgent),
      });
      setEditingAgent(null);
      await loadAgents();
    } finally {
      setBusy(false);
    }
  }

  async function deleteAgent(id: number) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cet agent ?")) return;
    try {
      await apiFetch(`/agents/${id}/`, { method: "DELETE" });
      await loadAgents();
    } catch (err: any) {
      console.error("Delete failed", err);
      alert("Échec de la suppression : " + (err.message || "Vérifiez vos permissions."));
    }
  }

  const primaryAgents = agents.filter(a => a.kind === "primary");

  if (loading) return <div className="p-8 font-mono text-[#ff5c00] animate-pulse">Chargement de la flotte d'agents...</div>;

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-[var(--bg-primary)]">
      <header className="mb-10 flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-serif mb-2">Gestion des Agents</h1>
          <p className="text-[#888] font-mono uppercase tracking-widest text-xs">Configurez votre flotte d'intelligence artificielle</p>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Creation Form */}
        <section className="xl:col-span-1">
          <div className="panel border border-[var(--border-color)] p-6 rounded-xl bg-[var(--bg-secondary)] sticky top-8">
            <h2 className="text-xl font-serif mb-6 text-[#ff5c00]">Nouveaux Recrutement</h2>
            <form onSubmit={createAgent} className="space-y-4">
              <div>
                <label className="text-[10px] text-[#888] mb-1 block uppercase tracking-widest font-mono">Nom de l'Agent</label>
                <input className="input w-full" value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="Ex: Analyste Strategique" required />
              </div>
              <div>
                <label className="text-[10px] text-[#888] mb-1 block uppercase tracking-widest font-mono">Type</label>
                <select className="input w-full" value={agentKind} onChange={(e) => setAgentKind(e.target.value as "primary" | "sub")}>
                  <option value="sub">Sous-agent (Spécialisé)</option>
                  <option value="primary">Agent Principal (Manager)</option>
                </select>
              </div>
              {agentKind === "sub" && (
                <div>
                  <label className="text-[10px] text-[#888] mb-1 block uppercase tracking-widest font-mono">Parent (Optionnel)</label>
                  <select className="input w-full" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                    <option value="">Aucun parent</option>
                    {primaryAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-[10px] text-[#888] mb-1 block uppercase tracking-widest font-mono">Spécialité</label>
                <input className="input w-full" value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Ex: Analyse de données financières" />
              </div>
              <div>
                <label className="text-[10px] text-[#888] mb-1 block uppercase tracking-widest font-mono">Prompt Système (Optionnel)</label>
                <textarea className="input w-full h-24 resize-none" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="Instructions spécifiques de comportement..." />
              </div>
              <button type="submit" className="btn primary w-full py-3 mt-4" disabled={busy}>ENRÔLER L'AGENT</button>
            </form>
          </div>
        </section>

        {/* Agents List */}
        <section className="xl:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agents.map((agent) => (
              <div key={agent.id} className="panel border border-[var(--border-color)] p-5 rounded-xl bg-[var(--bg-secondary)] hover:border-[#ff5c00]/30 transition-all group">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${agent.is_active ? 'bg-[#10b981]' : 'bg-[#333]'}`}></div>
                    <h3 className="text-lg font-serif">{agent.name}</h3>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEditingAgent(agent)} className="text-[#888] hover:text-[#ff5c00] text-xs font-mono uppercase tracking-widest">Éditer</button>
                    <button onClick={() => deleteAgent(agent.id)} className="text-[#888] hover:text-[#ef4444] text-xs font-mono uppercase tracking-widest">Suppr.</button>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-[10px] font-mono tracking-widest uppercase">
                    <span className="text-[#666]">Rôle</span>
                    <span className={agent.kind === 'primary' ? 'text-[#ff5c00]' : 'text-[#888]'}>{agent.kind}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-mono tracking-widest uppercase">
                    <span className="text-[#666]">Spécialité</span>
                    <span className="text-white text-right">{agent.specialty || "Généraliste"}</span>
                  </div>
                  {agent.parent && (
                    <div className="flex justify-between items-center text-[10px] font-mono tracking-widest uppercase">
                      <span className="text-[#666]">Rapporte à</span>
                      <span className="text-white italic">{agents.find(a => a.id === agent.parent)?.name}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {agents.length === 0 && (
            <div className="text-center py-20 border-2 border-dashed border-[var(--border-color)] rounded-xl text-[#555]">
              <p className="text-lg mb-2">Aucun agent configuré</p>
              <p className="text-sm">Utilisez le formulaire à gauche pour commencer.</p>
            </div>
          )}
        </section>
      </div>

      {/* Edit Modal */}
      {editingAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/80">
          <div className="w-full max-w-2xl bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-[var(--border-color)] bg-black/20 flex justify-between items-center">
              <h2 className="font-serif text-xl">Modifier l'Agent : {editingAgent.name}</h2>
              <button onClick={() => setEditingAgent(null)} className="text-[#888] hover:text-white">✕</button>
            </div>
            <form onSubmit={updateAgent} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block">Nom de l'Agent</label>
                  <input 
                    className="input w-full" 
                    value={editingAgent.name} 
                    onChange={(e) => setEditingAgent({...editingAgent, name: e.target.value})} 
                    required 
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block">Type</label>
                  <select 
                    className="input w-full" 
                    value={editingAgent.kind} 
                    onChange={(e) => setEditingAgent({...editingAgent, kind: e.target.value as "primary" | "sub", parent: e.target.value === "primary" ? null : editingAgent.parent})}
                  >
                    <option value="sub">Sous-agent</option>
                    <option value="primary">Agent Principal</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block">Spécialité</label>
                  <input 
                    className="input w-full" 
                    value={editingAgent.specialty} 
                    onChange={(e) => setEditingAgent({...editingAgent, specialty: e.target.value})} 
                  />
                </div>
                {editingAgent.kind === "sub" && (
                  <div className="col-span-2">
                    <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block">Parent (Manager)</label>
                    <select 
                      className="input w-full" 
                      value={editingAgent.parent || ""} 
                      onChange={(e) => setEditingAgent({...editingAgent, parent: e.target.value ? Number(e.target.value) : null})}
                    >
                      <option value="">Aucun parent</option>
                      {primaryAgents.filter(a => a.id !== editingAgent.id).map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono">Prompt Système</label>
                <textarea 
                  className="input w-full h-32 mt-1 resize-none font-mono text-sm" 
                  value={editingAgent.system_prompt} 
                  onChange={(e) => setEditingAgent({...editingAgent, system_prompt: e.target.value})} 
                />
              </div>

              <div className="flex items-center gap-3 p-3 bg-black/30 rounded border border-[var(--border-color)]">
                <input 
                  type="checkbox" 
                  id="active-check-edit"
                  className="accent-[#ff5c00]"
                  checked={editingAgent.is_active} 
                  onChange={(e) => setEditingAgent({...editingAgent, is_active: e.target.checked})} 
                />
                <label htmlFor="active-check-edit" className="text-sm cursor-pointer select-none">Agent Actif / Disponible</label>
              </div>

              <div className="flex gap-3 pt-4 border-t border-[var(--border-color)]">
                <button type="button" onClick={() => setEditingAgent(null)} className="btn flex-1">Annuler</button>
                <button type="submit" className="btn primary flex-1" disabled={busy}>Mettre à jour l'Agent 💾</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
