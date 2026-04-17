/**
 * EvidencePanel — evidence items with location under name
 */
import "./EvidencePanel.css";

export default function EvidencePanel({
  evidence,
  evidenceExamined,
  onExamine,
  sessionToken,
  loading,
  accusationMade,
}) {
  return (
    <div className="evidence-panel">
      <h3>Evidence</h3>
      <div className="evidence-list">
        {evidence?.map((e) => {
          const examined = evidenceExamined?.includes(e.evidence_id);
          return (
            <button
              key={e.evidence_id}
              className={`evidence-item ${examined ? "examined" : ""}`}
              onClick={() =>
                !loading &&
                !accusationMade &&
                sessionToken &&
                onExamine(sessionToken, e.evidence_id)
              }
              disabled={loading || accusationMade}
            >
              <div className="evidence-info">
                <span className="evidence-name">{e.name}</span>
                <span className="evidence-location">{e.location || "—"}</span>
              </div>
              {examined && <span className="evidence-check">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
