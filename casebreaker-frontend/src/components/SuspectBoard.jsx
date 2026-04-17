/**
 * SuspectBoard — suspect status panel with occupation and relationship
 */
import "./SuspectBoard.css";

export default function SuspectBoard({ suspects, suspectsInterrogated }) {
  return (
    <div className="suspect-board">
      <h3>Suspects</h3>
      <div className="suspect-list">
        {suspects?.map((s) => {
          const interrogated = suspectsInterrogated?.includes(s.character_id);
          return (
            <div
              key={s.character_id}
              className={`suspect-card ${interrogated ? "interrogated" : ""}`}
            >
              <div className="suspect-info">
                <span className="suspect-name">{s.name}</span>
                <span className="suspect-meta">
                  {s.occupation || "—"} · {s.relationship_to_victim || "—"}
                </span>
              </div>
              {interrogated && <span className="status-dot" title="Interrogated" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
