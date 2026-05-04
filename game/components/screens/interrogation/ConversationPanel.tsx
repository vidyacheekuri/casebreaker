"use client";

import type { RefObject } from "react";
import type { DetectiveInstinctDto, EvidenceDto } from "@/lib/backend-types";
import type { Message } from "@/lib/store";
import { HistoryMessageBubble, StreamingMessageBubble } from "@/components/ui/MessageBubble";

export interface ConversationPanelProps {
  messages: Message[];
  activeMessage: string;
  isRevealing: boolean;
  suspectName: string;
  stress?: number;
  detectiveInstinct?: DetectiveInstinctDto | null;
  bottomRef?: RefObject<HTMLDivElement | null>;
  evidence: EvidenceDto[];
  contradictsEvidence: (item: EvidenceDto) => boolean;
  streamKey: number | string;
}

export default function ConversationPanel({
  messages,
  activeMessage,
  isRevealing,
  suspectName,
  stress = 0,
  detectiveInstinct,
  bottomRef,
  evidence,
  contradictsEvidence,
  streamKey,
}: ConversationPanelProps) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 border border-[#2a2a3a] bg-[#0a0e1a]/92 p-5 shadow-2xl shadow-black/60 backdrop-blur-md">
      {messages.map((message, index) => (
        <HistoryMessageBubble
          key={`${message.timestamp ?? index}-${index}`}
          message={message}
          index={index}
          allMessages={messages}
          suspectName={suspectName}
          stress={stress}
          evidenceList={evidence}
          contradictsEvidence={contradictsEvidence}
        />
      ))}

      {activeMessage ? (
        <StreamingMessageBubble
          content={activeMessage}
          isRevealing={Boolean(activeMessage && isRevealing)}
          suspectName={suspectName}
          stress={stress}
          evidenceList={evidence}
          contradictsEvidence={contradictsEvidence}
          streamKey={streamKey}
        />
      ) : null}

      {detectiveInstinct ? (
        <div className="max-w-[95%] border border-[#1e3a5f]/70 bg-[#07111e]/85 px-3 py-2 text-body text-[#9EC6E8] backdrop-blur-md transition-all duration-300 hover:shadow-[0_8px_28px_rgba(95,145,230,0.12)]">
          <div className="mb-1 font-mono text-detail uppercase tracking-[2px] text-[#7ea6d6]">Detective Instinct</div>
          <p className="italic">&quot;{detectiveInstinct.quote}&quot;</p>
          <div className="mt-1 text-label text-[#7EAED0]">
            {detectiveInstinct.source_title} · {detectiveInstinct.source_author}
          </div>
        </div>
      ) : null}
      <div ref={bottomRef} />
    </div>
  );
}
