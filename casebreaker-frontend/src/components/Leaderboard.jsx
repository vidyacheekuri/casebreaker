/**
 * Leaderboard — daily leaderboard showing top solvers
 */
import { useState, useEffect } from "react";
import { getLeaderboard } from "../api";
import "./Leaderboard.css";

export default function Leaderboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    getLeaderboard()
      .then(setData)
      .catch(() => setData({ leaderboard: [] }));
    const id = setInterval(
      () =>
        getLeaderboard()
          .then(setData)
          .catch(() => {}),
      10000
    );
    return () => clearInterval(id);
  }, []);

  const entries = data?.leaderboard ?? [];

  return (
    <div className="leaderboard">
      <h3>Today's Top Solvers</h3>
      <div className="leaderboard-list">
        {entries.length === 0 ? (
          <p className="leaderboard-empty">No solves yet.</p>
        ) : (
          entries.map((e, i) => (
            <div key={e.session_token} className="leaderboard-entry">
              <span className="rank">#{i + 1}</span>
              <span className="time">{formatTime(e.solve_time_seconds)}</span>
              <span className="accusations">{e.accusation_count} tries</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
