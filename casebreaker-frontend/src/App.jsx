import { useState, useEffect } from "react";
import {
  getDailyCase,
  startSession,
  interrogate,
  examine,
  accuse,
} from "./api";
import CaseHeader from "./components/CaseHeader";
import SuspectBoard from "./components/SuspectBoard";
import EvidencePanel from "./components/EvidencePanel";
import ChatWindow from "./components/ChatWindow";
import Timer from "./components/Timer";
import Leaderboard from "./components/Leaderboard";
import AccuseModal from "./components/AccuseModal";
import EvidenceResult from "./components/EvidenceResult";
import "./App.css";

const SESSION_KEY = "casebreaker_session";
const CASE_DATE_KEY = "casebreaker_case_date";
const SESSION_START_KEY = "casebreaker_session_start";

export default function App() {
  const [caseData, setCaseData] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [sessionState, setSessionState] = useState({
    suspects_interrogated: [],
    evidence_examined: [],
    accusation_made: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAccuseModal, setShowAccuseModal] = useState(false);
  const [showEvidenceResult, setShowEvidenceResult] = useState(null);
  const [accuseLoading, setAccuseLoading] = useState(false);
  const [verdict, setVerdict] = useState(null);

  // Load case and session
  useEffect(() => {
    getDailyCase()
      .then((data) => {
        setCaseData(data);
        const saved = localStorage.getItem(SESSION_KEY);
        const savedDate = localStorage.getItem(CASE_DATE_KEY);
        const savedStart = localStorage.getItem(SESSION_START_KEY);
        if (saved && savedDate === data.case_date) {
          setSessionToken(saved);
          setSessionStartTime(savedStart || new Date().toISOString());
        } else {
          return startSession().then((res) => {
            const start = new Date().toISOString();
            setSessionToken(res.session_token);
            setSessionStartTime(start);
            localStorage.setItem(SESSION_KEY, res.session_token);
            localStorage.setItem(CASE_DATE_KEY, data.case_date);
            localStorage.setItem(SESSION_START_KEY, start);
          });
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleInterrogate = async (token, characterId, message) => {
    const res = await interrogate(token, characterId, message);
    setSessionState((s) => ({
      ...s,
      suspects_interrogated: [
        ...new Set([...s.suspects_interrogated, characterId]),
      ],
    }));
    return res;
  };

  const handleExamine = async (token, evidenceId) => {
    const res = await examine(token, evidenceId);
    setShowEvidenceResult({
      name: caseData?.evidence?.find((e) => e.evidence_id === evidenceId)
        ?.name,
      ...res,
    });
    setSessionState((s) => ({
      ...s,
      evidence_examined: [...new Set([...s.evidence_examined, evidenceId])],
    }));
  };

  const handleAccuse = async (characterId, reasoning) => {
    setAccuseLoading(true);
    try {
      const res = await accuse(sessionToken, characterId, reasoning);
      setVerdict(res);
      setSessionState((s) => ({ ...s, accusation_made: true }));
      setShowAccuseModal(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setAccuseLoading(false);
    }
  };

  if (loading) return <div className="app-loading">Loading case...</div>;
  if (error && !caseData)
    return <div className="app-error">Error: {error}</div>;

  return (
    <div className="app">
      <CaseHeader
        caseDate={caseData?.case_date}
        worldSummary={caseData?.world_summary}
      />
      <div className="app-layout">
        <aside className="app-sidebar">
          <SuspectBoard
            suspects={caseData?.suspects}
            suspectsInterrogated={sessionState.suspects_interrogated}
          />
          <EvidencePanel
            evidence={caseData?.evidence}
            evidenceExamined={sessionState.evidence_examined}
            onExamine={handleExamine}
            sessionToken={sessionToken}
            loading={loading}
            accusationMade={sessionState.accusation_made}
          />
          <Timer
            sessionStartTime={sessionStartTime}
            accusationMade={sessionState.accusation_made}
          />
          <Leaderboard />
        </aside>
        <main className="app-main">
          <ChatWindow
            sessionToken={sessionToken}
            suspects={caseData?.suspects}
            onInterrogate={handleInterrogate}
            accusationMade={sessionState.accusation_made}
          />
          {!sessionState.accusation_made && (
            <button
              className="accuse-btn"
              onClick={() => setShowAccuseModal(true)}
            >
              Make Accusation
            </button>
          )}
          {verdict && (
            <div
              className={`verdict ${verdict.correct ? "correct" : "wrong"}`}
            >
              <h3>{verdict.correct ? "Correct!" : "Wrong."}</h3>
              <p>{verdict.explanation}</p>
              {verdict.missed_clues?.length > 0 && (
                <p className="missed">Missed: {verdict.missed_clues.join(", ")}</p>
              )}
              {verdict.true_sequence && (
                <p className="true-seq">{verdict.true_sequence}</p>
              )}
              <p className="solve-time">
                Solved in {Math.floor(verdict.solve_time_seconds / 60)}:
                {(verdict.solve_time_seconds % 60)
                  .toString()
                  .padStart(2, "0")}
              </p>
            </div>
          )}
        </main>
      </div>
      {showAccuseModal && (
        <AccuseModal
          suspects={caseData?.suspects}
          onAccuse={handleAccuse}
          onClose={() => setShowAccuseModal(false)}
          loading={accuseLoading}
        />
      )}
      {showEvidenceResult && (
        <EvidenceResult
          evidence={showEvidenceResult}
          onClose={() => setShowEvidenceResult(null)}
        />
      )}
    </div>
  );
}
