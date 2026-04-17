/**
 * EvidenceResult — shows evidence description + Detective's Instinct when examining
 */
import DetectiveInstinct from "./DetectiveInstinct";
import "./EvidenceResult.css";

export default function EvidenceResult({ evidence, onClose }) {
  if (!evidence) return null;
  return (
    <div className="evidence-result-overlay" onClick={onClose}>
      <div className="evidence-result" onClick={(e) => e.stopPropagation()}>
        <h4>{evidence.name}</h4>
        <p className="evidence-desc">{evidence.description}</p>
        <p className="evidence-location">Found: {evidence.observations}</p>
        {evidence.detective_instinct && (
          <DetectiveInstinct instinct={evidence.detective_instinct} />
        )}
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
