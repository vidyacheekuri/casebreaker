"use client";

import type { KeyboardEvent, RefObject } from "react";

export interface ControlPanelProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  placeholder: string;
  inputRef?: RefObject<HTMLInputElement | null>;
}

export default function ControlPanel({
  value,
  onChange,
  onSubmit,
  isLoading,
  placeholder,
  inputRef,
}: ControlPanelProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="border-t border-[#2a2a3a] bg-[#060910]/95 px-4 py-3 shadow-[0_-18px_46px_rgba(0,0,0,0.45)] backdrop-blur-md">
      <div className="flex gap-4">
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 border border-[#2a2a3a] bg-[#0a0e1a] px-4 py-3 font-mono text-body text-[#e8e8e8] backdrop-blur-sm outline-none transition-[border-color,box-shadow] duration-300 placeholder:text-[#516278] focus:border-[#1e3a5f] focus:shadow-[0_0_0_1px_rgba(30,58,95,0.35),0_8px_24px_rgba(30,58,95,0.12)]"
        />
        <button
          onClick={onSubmit}
          disabled={isLoading || !value.trim()}
          className="border px-6 py-3 font-mono text-caption font-bold uppercase tracking-[2px] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_34px_rgba(184,134,11,0.26),0_0_24px_rgba(184,134,11,0.12)] disabled:pointer-events-none disabled:opacity-45"
          style={{
            borderColor: "rgba(184,134,11,.62)",
            background: "linear-gradient(135deg, rgba(184,134,11,.28), rgba(10,14,26,.95))",
            color: "#d5b15a",
            boxShadow: "0 0 22px rgba(184,134,11,.12)",
          }}
        >
          {isLoading ? "Thinking..." : "Send"}
        </button>
      </div>
    </div>
  );
}
