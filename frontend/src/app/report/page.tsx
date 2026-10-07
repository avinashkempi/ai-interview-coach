"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  apiBaseUrl,
  isInterviewReport,
  parseInterviewSession,
  reportStorageKey,
  sessionChangeEvent,
  sessionStorageKey,
  type InterviewReport,
  type InterviewSession,
} from "@/lib/interview";

function subscribeToSession(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(sessionChangeEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(sessionChangeEvent, onChange);
  };
}

function getSessionSnapshot() {
  try {
    return window.sessionStorage.getItem(sessionStorageKey);
  } catch {
    return null;
  }
}

async function getErrorMessage(response: Response) {
  let message = `The report could not be generated (HTTP ${response.status}).`;
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "detail" in body &&
      typeof body.detail === "string"
    ) {
      message = body.detail;
    }
  } catch {
    // Keep the HTTP status message if the server response is not JSON.
  }
  return message;
}

export default function ReportPage() {
  const saved = useSyncExternalStore(subscribeToSession, getSessionSnapshot, () => null);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const attemptedSession = useRef<string | null>(null);
  const session = parseInterviewSession(saved);

  const generateReport = useCallback(async (interview: InterviewSession) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${apiBaseUrl}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: interview.topic,
          difficulty: interview.difficulty,
          conversation: interview.conversation,
        }),
      });

      if (!response.ok) {
        setError(await getErrorMessage(response));
        return;
      }

      let result: unknown;
      try {
        result = await response.json();
      } catch {
        setError("The server returned an unreadable report. Please try again.");
        return;
      }

      if (!isInterviewReport(result)) {
        setError("The server returned an unexpected report. Please try again.");
        return;
      }

      setReport(result);
    } catch {
      setError(
        `Could not reach the interview server at ${apiBaseUrl}. Make sure the backend is running and try again.`,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session || !session.ended || attemptedSession.current === saved) return;
    attemptedSession.current = saved;
    const timeout = window.setTimeout(() => {
      void generateReport(session);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [generateReport, saved, session]);

  const retry = () => {
    if (!session) return;
    attemptedSession.current = saved;
    void generateReport(session);
  };
  const startNewInterview = () => {
    window.sessionStorage.removeItem(sessionStorageKey);
    window.sessionStorage.removeItem(reportStorageKey);
  };
  const scoreTone = report
    ? report.score >= 70
      ? "good"
      : report.score >= 55
        ? "okay"
        : "weak"
    : "weak";

  if (!session || !session.ended) {
    return (
      <main className="interview-shell">
        <div className="interview-empty">
          <span className="eyebrow">REPORT NOT READY</span>
          <h1>Finish your interview first.</h1>
          <p>Your report will be available once the interviewer has concluded the session.</p>
          <Link className="start-button back-button" href="/interview">
            Return to interview <span className="button-arrow" aria-hidden="true">↗</span>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="interview-shell report-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="AI Interview Coach home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>INTERVIEW<span className="brand-accent">/</span>COACH</span>
        </Link>
        <span className="report-session-label">{session.topic} <span>·</span> {session.difficulty}</span>
      </header>

      <section className="report-content" aria-labelledby="report-title">
        {loading && !report ? (
          <div className="report-loading" role="status">
            <span className="eyebrow"><span className="status-dot" /> INTERVIEW COMPLETE</span>
            <span className="report-spinner" aria-hidden="true" />
            <h1 id="report-title">Reviewing your interview...</h1>
            <p>Putting together feedback based on your answers.</p>
          </div>
        ) : error && !report ? (
          <div className="report-error-panel">
            <span className="eyebrow">REPORT UNAVAILABLE</span>
            <h1 id="report-title">We couldn&apos;t finish your report.</h1>
            <p role="alert">{error}</p>
            <button className="start-button retry-report-button" onClick={retry} type="button">
              Try again <span className="button-arrow" aria-hidden="true">↻</span>
            </button>
          </div>
        ) : report ? (
          <>
            <div className="report-heading">
              <div>
                <span className="eyebrow"><span className="status-dot" /> INTERVIEW COMPLETE</span>
                <h1 id="report-title">Interview Complete</h1>
                <p>{session.topic} <span>·</span> {session.difficulty} difficulty</p>
              </div>
              <span
                className={`verdict-badge ${report.result === "Pass" ? "pass" : "fail"}`}
                aria-label={`Interview result: ${report.result}`}
              >
                {report.result}
              </span>
            </div>

            <div className={`report-score-card score-tone-${scoreTone}`}>
              <div className="score-number">
                <strong>{report.score}</strong><span>/ 100</span>
              </div>
              <div className="score-details">
                <span className="card-kicker">OVERALL PERFORMANCE</span>
                <h2>{report.performance_band}</h2>
              </div>
              <span className="score-tone-label">
                {scoreTone === "good" ? "STRONG" : scoreTone === "okay" ? "DEVELOPING" : "NEEDS WORK"}
              </span>
            </div>

            <div className="report-columns">
              <ReportList title="Strengths" items={report.strengths} kind="positive" />
              <ReportList title="Areas for improvement" items={report.weaknesses} kind="negative" />
            </div>

            <section className="revision-card">
              <span className="card-kicker">YOUR NEXT STEPS</span>
              <h2>Topics to revise</h2>
              {report.topics_to_revise.length > 0 ? (
                <ul>
                  {report.topics_to_revise.map((topic, index) => (
                    <li key={`${topic}-${index}`}>{topic}</li>
                  ))}
                </ul>
              ) : (
                <p>No specific revision topics were identified from this conversation.</p>
              )}
            </section>

            <section className="interviewer-verdict-card">
              <span className="card-kicker">FINAL ASSESSMENT</span>
              <h2>Interviewer&apos;s verdict</h2>
              <p>{report.overall_verdict}</p>
            </section>

            <Link className="start-button new-interview-button" href="/" onClick={startNewInterview}>
              Start New Interview <span className="button-arrow" aria-hidden="true">↗</span>
            </Link>
          </>
        ) : (
          <div className="report-loading" role="status">
            <span className="eyebrow"><span className="status-dot" /> INTERVIEW COMPLETE</span>
            <span className="report-spinner" aria-hidden="true" />
            <h1 id="report-title">Preparing your report...</h1>
          </div>
        )}
      </section>
      <footer className="page-footer">
        <span>AI INTERVIEW COACH</span>
        <span>GROW WITH EVERY ANSWER</span>
      </footer>
    </main>
  );
}

function ReportList({
  title,
  items,
  kind,
}: {
  title: string;
  items: string[];
  kind: "positive" | "negative";
}) {
  return (
    <section className={`report-list-card ${kind}`}>
      <h2>{title}</h2>
      {items.length > 0 ? (
        <ul>
          {items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
        </ul>
      ) : (
        <p>No specific {kind === "positive" ? "strengths" : "weaknesses"} identified.</p>
      )}
    </section>
  );
}
