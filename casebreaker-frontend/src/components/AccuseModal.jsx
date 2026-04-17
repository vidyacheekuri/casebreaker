/**
 * AccuseModal — make final accusation (suspect + reasoning)
 */
import { useState } from "react";
import "./AccuseModal.css";

export default function AccuseModal({
  suspects,
  onAccuse,
  onClose,
  loading,
}) {
  const [selectedId, setSelectedId] = useState("");
  const [reasoning, setReasoning] = useState("");

  const handleSubmit = () => {
    if (selectedId && reasoning.trim()) {
      onAccuse(selectedId, reasoning.trim());
    }
  };

  return (
    <div className="accuse-modal-overlay" onClick={onClose}>
      <div className="accuse-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Make Your Accusation</h3>
        <p className="accuse-hint">Choose the killer and explain your reasoning.</p>
        <div className="accuse-select">
          <label>Suspect</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={loading}
          >
            <option value="">Select...</option>
            {suspects?.map((s) => (
              <option key={s.character_id} value={s.character_id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="accuse-reasoning">
          <label>Your Reasoning</label>
          <textarea
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value)}
            placeholder="Explain why you believe this person is the killer..."
            rows={4}
            disabled={loading}
          />
        </div>
        <div className="accuse-actions">
          <button onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedId || !reasoning.trim() || loading}
            className="accuse-submit"
          >
            {loading ? "Submitting..." : "Accuse"}
          </button>
        </div>
      </div>
    </div>
  );
}
