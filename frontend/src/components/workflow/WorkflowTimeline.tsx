"use client";

import React from "react";

type Step = {
  id: number;
  step_type: string;
  content: string;
  agent_name?: string;
  created_at: string;
};

type WorkflowTimelineProps = {
  steps: Step[];
  status: string;
};

const STEP_STYLES: Record<string, string> = {
  analysis: "border-[#ff5c00] text-[#ff5c00]",
  recruitment: "border-[#8b5cf6] text-[#8b5cf6]",
  delegation: "border-[#3b82f6] text-[#3b82f6]",
  execution: "border-[#10b981] text-[#10b981]",
  review: "border-[#f59e0b] text-[#f59e0b]",
};

export default function WorkflowTimeline({ steps, status }: WorkflowTimelineProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-8">
        <h3 className="text-xs font-mono uppercase tracking-[0.3em] text-[#888]">Processus d'Orchestration</h3>
        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
          status === 'completed' ? 'bg-[#10b981]/20 text-[#10b981]' : 'bg-[#ff5c00]/20 text-[#ff5c00]'
        }`}>
          {status}
        </div>
      </div>

      <div className="relative border-l-2 border-[var(--border-color)] ml-4 pl-8 space-y-12">
        {steps.map((step, idx) => (
          <div key={step.id} className="relative">
            {/* Step marker */}
            <div className={`absolute -left-[41px] top-0 w-4 h-4 rounded-full bg-black border-2 ${STEP_STYLES[step.step_type] || 'border-white'}`}></div>
            
            <div className="flex flex-col">
              <div className="flex items-center gap-3 mb-2">
                <span className={`text-[10px] font-mono font-black uppercase tracking-widest ${STEP_STYLES[step.step_type] || 'text-white'}`}>
                  {step.step_type.replace('_', ' ')}
                </span>
                <span className="text-[10px] text-[#444] font-mono">
                  {new Date(step.created_at).toLocaleTimeString()}
                </span>
                {step.agent_name && (
                  <span className="bg-white/5 border border-white/10 px-2 py-0.5 rounded text-[10px] text-[#888] font-mono">
                    Agent: {step.agent_name}
                  </span>
                )}
              </div>
              
              <div className="bg-black/40 border border-white/5 p-4 rounded-lg text-sm text-[#ccc] leading-relaxed whitespace-pre-wrap font-mono">
                {step.content}
              </div>
            </div>
          </div>
        ))}
        
        {status === 'thinking' && (
          <div className="relative animate-pulse">
            <div className="absolute -left-[41px] top-0 w-4 h-4 rounded-full bg-[#ff5c00] shadow-[0_0_10px_#ff5c00]"></div>
            <div className="text-[10px] font-mono font-black uppercase tracking-widest text-[#ff5c00]">
              Réflexion du Manager...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
