"use client";

import { motion } from "framer-motion";

export interface SuggestedQuestionsProps {
  questions: string[];
  onSelect: (question: string) => void;
  isLoading: boolean;
}

export default function SuggestedQuestions({ questions, onSelect, isLoading }: SuggestedQuestionsProps) {
  const listKey = questions.join("\u0001");

  return (
    <div className="border-t border-[#2a2a3a] bg-[#060910]/92 px-4 py-2 font-mono shadow-[0_-12px_36px_rgba(0,0,0,0.32)] backdrop-blur-md">
      <div className="text-[9px] uppercase tracking-[2px] text-[#7d8796]">Suggested lines of questioning</div>
      <motion.div
        key={listKey}
        className="mt-2 flex flex-wrap gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {questions.map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => onSelect(question)}
            disabled={isLoading}
            className="border border-[#2a2a3a] bg-[#0a0e1a] px-2 py-1 text-[10px] text-[#8a96a6] backdrop-blur-sm transition-[border-color,color,box-shadow] duration-300 hover:border-[#b8860b]/50 hover:text-[#b8860b] hover:shadow-[0_8px_20px_rgba(184,134,11,0.08)] disabled:opacity-45"
          >
            {question}
          </button>
        ))}
      </motion.div>
    </div>
  );
}
