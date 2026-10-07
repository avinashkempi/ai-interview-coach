"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  pendingSetupStorageKey,
  progressChangeEvent,
  readInterviewProgress,
  type InterviewProgress,
} from "@/lib/interview";
import { getRolePreset } from "@/lib/plans";

export default function DashboardPage() {
  const router = useRouter();
  const [progress, setProgress] = useState<InterviewProgress[]>([]);

  useEffect(() => {
    const refresh = () => setProgress(readInterviewProgress());
    refresh();
    window.addEventListener(progressChangeEvent, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(progressChangeEvent, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const averageScore = progress.length
    ? Math.round(progress.reduce((total, item) => total + item.score, 0) / progress.length)
    : 0;
  const bestScore = progress.reduce((best, item) => Math.max(best, item.score), 0);
  const latest = progress[0];
  const activePlan = useMemo(() => {
    if (!latest?.plan_topics.length) return null;
    const completed = new Set(
      progress
        .filter((item) => item.role === latest.role)
        .map((item) => item.topic.toLowerCase()),
    );
    const nextTopic = latest.plan_topics.find((topic) => !completed.has(topic.toLowerCase()));
    return { topics: latest.plan_topics, nextTopic, role: latest.role };
  }, [latest, progress]);

  function continuePlan(topic: string, role: string) {
    const preset = getRolePreset(role);
    try {
      window.sessionStorage.setItem(
        pendingSetupStorageKey,
        JSON.stringify({ topic, role, plan_topics: preset.topics }),
      );
      router.push("/");
    } catch {
      router.push("/");
    }
  }

  return (
    <main className="interview-shell dashboard-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="AI Interview Coach home">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>INTERVIEW<span className="brand-accent">/</span>COACH</span>
        </Link>
        <Link className="exit-link" href="/">New practice <span aria-hidden="true">↗</span></Link>
      </header>

      <section className="dashboard-content" aria-labelledby="dashboard-title">
        <div className="dashboard-heading">
          <div>
            <span className="eyebrow"><span className="status-dot" /> YOUR PRACTICE, AT A GLANCE</span>
            <h1 id="dashboard-title">Progress that adds up.</h1>
            <p>Every session is a step closer to interview-ready.</p>
          </div>
          <Link className="start-button dashboard-start" href="/">Start a session <span className="button-arrow" aria-hidden="true">↗</span></Link>
        </div>

        <div className="dashboard-stats">
          <article><span>SESSIONS</span><strong>{progress.length}</strong><small>completed practices</small></article>
          <article><span>AVERAGE SCORE</span><strong>{progress.length ? `${averageScore}%` : "—"}</strong><small>across all sessions</small></article>
          <article><span>PERSONAL BEST</span><strong>{progress.length ? `${bestScore}%` : "—"}</strong><small>your highest score</small></article>
        </div>

        {activePlan && (
          <section className="dashboard-plan">
            <div className="dashboard-section-heading">
              <div><span className="card-kicker">YOUR ROLE ROADMAP</span><h2>{activePlan.role}</h2></div>
              <span className="plan-progress-count">{activePlan.topics.filter((topic) =>
                progress.some((item) => item.role === activePlan.role && item.topic.toLowerCase() === topic.toLowerCase()),
              ).length} / {activePlan.topics.length} explored</span>
            </div>
            <div className="plan-steps">
              {activePlan.topics.map((topic, index) => {
                const complete = progress.some(
                  (item) => item.role === activePlan.role && item.topic.toLowerCase() === topic.toLowerCase(),
                );
                return (
                  <div className={`plan-step${complete ? " complete" : ""}`} key={topic}>
                    <span className="plan-step-number">{complete ? "✓" : `0${index + 1}`}</span>
                    <span>{topic}</span>
                  </div>
                );
              })}
            </div>
            {activePlan.nextTopic ? (
              <button
                className="start-button plan-continue"
                onClick={() => continuePlan(activePlan.nextTopic!, activePlan.role)}
                type="button"
              >
                Continue with {activePlan.nextTopic} <span className="button-arrow" aria-hidden="true">↗</span>
              </button>
            ) : (
              <p className="plan-complete-note">Roadmap complete. Choose another role to keep building range.</p>
            )}
          </section>
        )}

        <section className="dashboard-history">
          <div className="dashboard-section-heading">
            <div><span className="card-kicker">YOUR TRACK RECORD</span><h2>Recent sessions</h2></div>
            {progress.length > 0 && <span className="plan-progress-count">Latest first</span>}
          </div>
          {progress.length ? (
            <div className="history-list">
              {progress.slice(0, 12).map((item) => (
                <article className="history-item" key={item.id}>
                  <div className="history-topic">
                    <strong>{item.topic}</strong>
                    <span>{item.role} · {item.difficulty} · {new Date(item.date).toLocaleDateString()}</span>
                  </div>
                  <span className={`history-band${item.score >= 70 ? " positive" : ""}`}>{item.performance_band}</span>
                  <strong className="history-score">{item.score}<small>/100</small></strong>
                </article>
              ))}
            </div>
          ) : (
            <div className="dashboard-empty">
              <span aria-hidden="true">✳</span>
              <h3>Your first win starts here.</h3>
              <p>Complete a practice interview and your scores, strengths, and next steps will show up here.</p>
              <Link href="/" className="dashboard-empty-link">Pick your first topic <span aria-hidden="true">↗</span></Link>
            </div>
          )}
        </section>
      </section>

      <footer className="page-footer"><span>AI INTERVIEW COACH</span><span>SMALL WINS. STRONGER ANSWERS.</span></footer>
    </main>
  );
}
