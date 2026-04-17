/**
 * ChatWindow — interrogation chat with atmospheric intro and Detective's Instinct section
 */
import { useState, useRef, useEffect } from "react";
import DetectiveInstinct from "./DetectiveInstinct";
import "./ChatWindow.css";

const ATMOSPHERIC_INTRO =
  "The room falls silent. You take out your notebook. Every word matters now.";

function getSuspectIntro(suspect) {
  if (!suspect) return null;
  return `You are now speaking with ${suspect.name}. Choose your questions carefully—the truth hides behind every answer.`;
}

export default function ChatWindow({
  sessionToken,
  suspects,
  onInterrogate,
  accusationMade,
}) {
  const [selectedSuspect, setSelectedSuspect] = useState(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [latestInstinct, setLatestInstinct] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(scrollToBottom, [messages]);

  // Show atmospheric message on load or when suspect changes
  const showIntro = !accusationMade && (
    messages.length === 0
      ? ATMOSPHERIC_INTRO
      : selectedSuspect
        ? getSuspectIntro(selectedSuspect)
        : null
  );

  const handleSend = async () => {
    if (!message.trim() || !selectedSuspect || !sessionToken || accusationMade) return;
    setLoading(true);
    try {
      const res = await onInterrogate(sessionToken, selectedSuspect.character_id, message.trim());
      setMessages((prev) => [
        ...prev,
        { role: "player", text: message.trim(), characterName: null },
        {
          role: "suspect",
          text: res.response,
          characterName: res.character_name,
          instinct: res.detective_instinct,
        },
      ]);
      setLatestInstinct(res.detective_instinct);
      setMessage("");
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "error", text: err.message || "Failed to send message.", characterName: null },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-window">
      <div className="chat-header">
        <h3>Interrogation</h3>
        {selectedSuspect && (
          <span className="chat-suspect">Speaking with: {selectedSuspect.name}</span>
        )}
      </div>
      <div className="suspect-select">
        {suspects?.map((s) => (
          <button
            key={s.character_id}
            className={`suspect-btn ${selectedSuspect?.character_id === s.character_id ? "active" : ""}`}
            onClick={() => setSelectedSuspect(s)}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div className="chat-messages">
        {showIntro && (
          <div className="chat-msg atmospheric">
            <span className="msg-text atmospheric-text">{showIntro}</span>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            {m.role === "player" && <span className="msg-label">You:</span>}
            {m.role === "suspect" && (
              <span className="msg-label">{m.characterName}:</span>
            )}
            {m.role === "error" && <span className="msg-label">Error:</span>}
            <span className="msg-text">{m.text}</span>
            {m.instinct && <DetectiveInstinct instinct={m.instinct} />}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input">
        <input
          type="text"
          placeholder={
            selectedSuspect
              ? "Type your question..."
              : "Select a suspect first"
          }
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          disabled={!selectedSuspect || loading || accusationMade}
        />
        <button
          onClick={handleSend}
          disabled={!selectedSuspect || !message.trim() || loading || accusationMade}
        >
          Send
        </button>
      </div>
      {latestInstinct && (
        <div className="instinct-section">
          <h4 className="instinct-section-title">Detective's Instinct</h4>
          <DetectiveInstinct instinct={latestInstinct} />
        </div>
      )}
    </div>
  );
}
