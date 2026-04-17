/**
 * DetectiveInstinct — Layer 2 RAG card
 * Renders literary quote + attribution when triggered by evidence/interrogation
 */
import "./DetectiveInstinct.css";

export default function DetectiveInstinct({ instinct }) {
  if (!instinct) return null;
  return (
    <div className="detective-instinct">
      <div className="instinct-quote">"{instinct.quote}"</div>
      <div className="instinct-attribution">
        — {instinct.source_title}, {instinct.source_author}
      </div>
    </div>
  );
}
