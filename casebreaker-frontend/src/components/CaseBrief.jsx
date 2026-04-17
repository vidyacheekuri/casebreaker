/**
 * CaseBrief — prominent case file card showing victim and scene details
 * Parses world_summary: "Setting — Victim Name — Cause of death"
 */
import "./CaseBrief.css";

function parseWorldSummary(worldSummary) {
  if (!worldSummary) return { setting: "—", victimName: "—", causeOfDeath: "—" };
  const parts = worldSummary.split(" — ");
  return {
    setting: parts[0]?.trim() || "—",
    victimName: parts[1]?.trim() || "—",
    causeOfDeath: parts[2]?.trim() || "—",
  };
}

export default function CaseBrief({ caseDate, worldSummary }) {
  const { setting, victimName, causeOfDeath } = parseWorldSummary(worldSummary);

  return (
    <div className="case-brief">
      <div className="case-brief-header">
        <h2 className="case-brief-title">Case File</h2>
        <span className="case-brief-date">{caseDate}</span>
      </div>
      <div className="case-brief-content">
        <div className="case-brief-row">
          <span className="case-brief-label">Setting</span>
          <span className="case-brief-value">{setting}</span>
        </div>
        <div className="case-brief-row case-brief-victim">
          <span className="case-brief-label">Victim</span>
          <span className="case-brief-value">{victimName}</span>
        </div>
        <div className="case-brief-row">
          <span className="case-brief-label">Age</span>
          <span className="case-brief-value">—</span>
        </div>
        <div className="case-brief-row">
          <span className="case-brief-label">Occupation</span>
          <span className="case-brief-value">—</span>
        </div>
        <div className="case-brief-row">
          <span className="case-brief-label">How Found</span>
          <span className="case-brief-value">—</span>
        </div>
        <div className="case-brief-row case-brief-cause">
          <span className="case-brief-label">Cause of Death</span>
          <span className="case-brief-value">{causeOfDeath}</span>
        </div>
      </div>
    </div>
  );
}
