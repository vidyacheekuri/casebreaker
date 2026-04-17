/**
 * Timer — session timer showing elapsed time
 */
import { useState, useEffect } from "react";
import "./Timer.css";

export default function Timer({ sessionStartTime, accusationMade }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!sessionStartTime) return;
    const start = new Date(sessionStartTime).getTime();
    const tick = () => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sessionStartTime]);

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="timer">
      <span className="timer-label">Time</span>
      <span className="timer-value">{formatTime(elapsed)}</span>
    </div>
  );
}
