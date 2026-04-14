import React, { ReactNode } from "react";

type FormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
};

const sizeClasses = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-6xl",
};

export function FormModal({ isOpen, onClose, title, children, size = "md" }: FormModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/80">
      <div
        className={`w-full ${sizeClasses[size]} bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto`}
      >
        <div className="p-4 border-b border-[var(--border-color)] bg-black/20 flex justify-between items-center">
          <h2 className="font-serif text-xl">{title}</h2>
          <button onClick={onClose} className="text-[#888] hover:text-white text-xl">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

type ConfirmModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning";
};

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  variant = "danger",
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const isDanger = variant === "danger";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/80">
      <div className="w-full max-w-md bg-yellow-400 border-4 border-red-500 rounded-xl overflow-hidden shadow-2xl">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-16 h-16 bg-red-500 rounded-full flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="w-10 h-10 fill-current text-black"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M12 2L2 22h20L12 2zm0 3.5L18.5 20h-13L12 5.5z" />
                <text x="12" y="18" textAnchor="middle" className="text-[14px] font-black fill-black">
                  !
                </text>
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-red-600 font-black text-lg uppercase tracking-wider mb-2">
                {title}
              </h2>
              <p className="text-red-700 font-bold text-sm leading-relaxed">{message}</p>
            </div>
          </div>
        </div>
        <div className="p-4 bg-yellow-500 border-t-2 border-red-500 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded border-2 border-red-800 uppercase text-xs tracking-widest transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 bg-black hover:bg-gray-900 text-yellow-400 font-bold py-2 px-4 rounded border-2 border-red-500 uppercase text-xs tracking-widest transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}