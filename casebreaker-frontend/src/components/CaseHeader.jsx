/**
 * CaseHeader — app title + case brief
 */
import CaseBrief from "./CaseBrief";
import "./CaseHeader.css";

export default function CaseHeader({ caseDate, worldSummary }) {
  return (
    <header className="case-header">
      <h1 className="case-header-title">CaseBreaker AI</h1>
      <CaseBrief caseDate={caseDate} worldSummary={worldSummary} />
    </header>
  );
}
