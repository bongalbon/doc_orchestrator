"use client";

import React, { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
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
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);

  async function handleCancel(id: number) {
    if (!confirm("Êtes-vous sûr de vouloir avorter cette orchestration ?")) return;
    try {
      await apiPost(`/workflows/${id}/cancel/`, {});
      await loadWorkflows();
    } catch (err) {
      console.error("Cancel failed", err);
    }
  }

  async function loadWorkflows() {
    try {
      const data = await apiGet<Workflow[]>("/workflows/");
      setWorkflows(data);
    } catch (err) {
      console.error("Failed to load workflows", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWorkflows();
    const interval = setInterval(loadWorkflows, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading && workflows.length === 0) {
    return <div className="p-8 font-mono text-[#ff5c00] animate-pulse">Chargement de l'intelligence collective...</div>;
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-[var(--bg-primary)] h-full">
      {/* List */}
      <div className="w-1/3 border-r border-[var(--border-color)] flex flex-col h-full bg-black/10">
        <header className="p-6 border-b border-[var(--border-color)]">
          <h1 className="text-xl font-serif">Workflows CEO</h1>
          <p className="text-[10px] text-[#888] font-mono uppercase tracking-widest mt-1">Orchestration & Délégation</p>
        </header>
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-color)]">
          {workflows.map(w => (
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
                {['thinking', 'delegating', 'reviewing', 'awaiting_approval'].includes(selectedWorkflow.status) && (
                  <button 
                    onClick={() => handleCancel(selectedWorkflow.id)}
                    className="text-[10px] font-mono text-red-500 border border-red-500/30 px-3 py-1 rounded hover:bg-red-500 hover:text-white transition-all uppercase tracking-widest"
                  >
                    ⏹ Avorter l'orchestration
                  </button>
                )}
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
    </div>
  );
}
