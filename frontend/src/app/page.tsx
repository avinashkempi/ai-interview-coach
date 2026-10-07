"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  apiBaseUrl,
  pendingSetupStorageKey,
  saveInterviewSession,
  type Difficulty,
  type InterviewLength,
  type InterviewPersona,
  type InterviewSettings,
} from "@/lib/interview";
import { getRolePreset, rolePresets } from "@/lib/plans";

function isInterviewStartResponse(value: unknown): value is {
  message: string;
  ended: boolean;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string" &&
    "ended" in value &&
    typeof value.ended === "boolean"
  );
}

export default function Home() {
  const router = useRouter();
  const [topic, setTopic] = useState(rolePresets[0].topics[0]);
  const [role, setRole] = useState(rolePresets[0].role);
  const [isCustomRole, setIsCustomRole] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [length, setLength] = useState<InterviewLength>("10 min");
  const [persona, setPersona] = useState<InterviewPersona>("Supportive");
  const [adaptiveDifficulty, setAdaptiveDifficulty] = useState(true);
  const [feedbackEnabled, setFeedbackEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [resumeContext, setResumeContext] = useState("");
  const [resumeError, setResumeError] = useState("");
  const [isResumeExpanded, setIsResumeExpanded] = useState(false);
  const [error, setError] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const rolePreset = getRolePreset(role);
  const matchingTopics = rolePreset.topics.filter((suggestion) =>
    !topic.trim() || suggestion.toLowerCase().includes(topic.trim().toLowerCase()),
  );
  const sampleQuestion = topic.trim() &&
    !(isCustomRole && topic.trim() === rolePreset.topics[0])
    ? rolePresets.find((preset) => preset.topics.includes(topic.trim()))?.sampleQuestion ??
      `Explain a core concept in ${topic.trim()} and describe when you would use it.`
    : rolePreset.sampleQuestion;

  useEffect(() => {
    try {
      const pending = window.sessionStorage.getItem(pendingSetupStorageKey);
      if (!pending) return;
      const value: unknown = JSON.parse(pending);
      if (typeof value !== "object" || value === null) return;
      if ("role" in value && typeof value.role === "string") {
        const pendingRole = value.role;
        const matchingRole = rolePresets.find((preset) => preset.role === pendingRole);
        window.setTimeout(() => {
          setRole(pendingRole);
          setIsCustomRole(!matchingRole);
          if (matchingRole) setTopic(matchingRole.topics[0]);
        }, 0);
      }
      if ("topic" in value && typeof value.topic === "string") {
        const pendingTopic = value.topic;
        window.setTimeout(() => setTopic(pendingTopic), 0);
      }
      window.sessionStorage.removeItem(pendingSetupStorageKey);
    } catch {
      window.sessionStorage.removeItem(pendingSetupStorageKey);
    }
  }, []);

  async function readResumeFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/\.(txt|md)$/i.test(file.name)) {
      setResumeError("Choose a plain-text .txt or .md resume file.");
      event.target.value = "";
      return;
    }
    if (file.size > 12_000) {
      setResumeError("Resume text must be 12 KB or smaller.");
      event.target.value = "";
      return;
    }
    try {
      setResumeContext((await file.text()).slice(0, 12_000));
      setResumeError("");
    } catch {
      setResumeError("Could not read that file. Paste your resume text instead.");
    }
  }

  async function startInterview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTopic = topic.trim();
    const trimmedRole = role.trim();

    if (!trimmedRole) {
      setError("Enter a target role to get started.");
      return;
    }
    if (!trimmedTopic) {
      setError("Enter an interview topic to get started.");
      return;
    }

    setError("");
    setIsStarting(true);

    if (!apiBaseUrl) {
      setError(
        "The backend URL is not configured. Set NEXT_PUBLIC_API_URL and restart the frontend.",
      );
      setIsStarting(false);
      return;
    }

    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/interview/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: trimmedTopic,
          difficulty,
          settings: {
            role: trimmedRole,
            length,
            persona,
            adaptive_difficulty: adaptiveDifficulty,
            feedback_enabled: feedbackEnabled,
            voice_enabled: voiceEnabled,
            resume_context: resumeContext.trim(),
            plan_topics: rolePreset.topics,
          } satisfies InterviewSettings,
        }),
      });
    } catch {
      setError(
        `Could not reach the interview server at ${apiBaseUrl}. Make sure the backend is running and try again.`,
      );
      setIsStarting(false);
      return;
    }

    if (!response.ok) {
      let message = `The server could not start the interview (HTTP ${response.status}). Please try again.`;
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
        // Keep the status-based message when the server returns a non-JSON error.
      }
      setError(message);
      setIsStarting(false);
      return;
    }

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      setError("The server returned an unreadable response. Please try again.");
      setIsStarting(false);
      return;
    }

    if (!isInterviewStartResponse(result)) {
      setError("The server returned an unexpected response. Please try again.");
      setIsStarting(false);
      return;
    }

    try {
      saveInterviewSession({
        id: crypto.randomUUID(),
        topic: trimmedTopic,
        difficulty,
        conversation: [{ role: "interviewer", content: result.message }],
        ended: result.ended,
        settings: {
          role: trimmedRole,
          length,
          persona,
          adaptive_difficulty: adaptiveDifficulty,
          feedback_enabled: feedbackEnabled,
          voice_enabled: voiceEnabled,
          resume_context: resumeContext.trim(),
          plan_topics: rolePreset.topics,
        },
      });
      router.push("/interview");
    } catch {
      setError("Could not save the interview session in this browser. Please try again.");
      setIsStarting(false);
    }
  }

  return (
    <main className="landing-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="AI Interview Coach home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>INTERVIEW<span className="brand-accent">/</span>COACH</span>
        </Link>
        <nav className="topbar-actions" aria-label="Main navigation">
          <Link className="dashboard-link" href="/dashboard">Your progress <span aria-hidden="true">↗</span></Link>
          <span className="topbar-note"><span className="status-dot" /> YOUR NEXT ROLE STARTS HERE</span>
        </nav>
      </header>

      <section className="hero" aria-labelledby="page-title">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-line" />
            PRACTICE WITH PURPOSE
          </div>
          <h1 id="page-title">
            AI Interview
            <br />
            <span>Coach</span>
          </h1>
          <p className="tagline">
            Practice for the role you want. Get sharper with every answer.
          </p>

          <div className="hero-footnote">
            <span className="footnote-rule" />
            <span>REALISTIC QUESTIONS. USEFUL FEEDBACK. YOUR PACE.</span>
          </div>
        </div>

        <form className="setup-card" onSubmit={startInterview} noValidate>
          <div className="card-heading">
            <div>
              <p className="card-kicker">LET&apos;S GET STARTED</p>
              <h2>Start practicing</h2>
            </div>
          </div>

          <label className="field-label" htmlFor="role">Target role</label>
          <select
            className="setup-select"
            id="role"
            onChange={(event) => {
              const nextRole = event.target.value;
              const customRoleSelected = nextRole === "__custom__";
              setIsCustomRole(customRoleSelected);
              if (customRoleSelected) {
                setRole("");
                setTopic(getRolePreset("").topics[0]);
              } else {
                setRole(nextRole);
                setTopic(getRolePreset(nextRole).topics[0]);
              }
              if (error) setError("");
            }}
            value={isCustomRole ? "__custom__" : role}
          >
            {rolePresets.map((preset) => <option key={preset.role}>{preset.role}</option>)}
            <option value="__custom__">Other — enter a role</option>
          </select>
          {isCustomRole && (
            <>
              <label className="field-label" htmlFor="custom-role">Your target role</label>
              <input
                autoComplete="off"
                className="setup-select"
                id="custom-role"
                maxLength={100}
                onChange={(event) => {
                  setRole(event.target.value);
                  if (error) setError("");
                }}
                placeholder="e.g. Product Manager, UX Researcher"
                type="text"
                value={role}
              />
            </>
          )}

          <label className="field-label" htmlFor="topic">
            Interview topic
          </label>
          <div className="topic-search">
            <span className="search-icon" aria-hidden="true" />
            <input
              autoComplete="off"
              className="topic-input"
              id="topic"
              maxLength={200}
              onChange={(event) => {
                setTopic(event.target.value);
                if (error) setError("");
              }}
              placeholder="e.g. React, system design, or your own topic"
              type="search"
              value={topic}
            />
          </div>

          {matchingTopics.length > 0 &&
            topic.trim().toLowerCase() !== rolePreset.topics[0].toLowerCase() && (
            <div className="topic-picker" aria-label="Suggested topics for this role">
              <span className="topic-picker-heading">SUGGESTED TOPICS</span>
              <div className="topic-suggestions">
                {matchingTopics.map((suggestion) => (
                  <button
                    aria-pressed={topic.trim().toLowerCase() === suggestion.toLowerCase()}
                    className={`topic-suggestion${topic.trim().toLowerCase() === suggestion.toLowerCase() ? " active" : ""}`}
                    key={suggestion}
                    onClick={() => {
                      setTopic(suggestion);
                      if (error) setError("");
                    }}
                    type="button"
                  >
                    {suggestion}
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <details className="optional-settings">
            <summary>
              <span>Customize your session</span>
              <span className="optional-settings-hint">Optional</span>
            </summary>
            <div className="optional-settings-content">
              <label className="field-label" htmlFor="difficulty">
                Difficulty
                <select
                  className="setup-select"
                  id="difficulty"
                  onChange={(event) => setDifficulty(event.target.value as Difficulty)}
                  value={difficulty}
                >
                  <option>Easy</option>
                  <option>Medium</option>
                  <option>Hard</option>
                </select>
              </label>

              <div className="setup-extra-grid">
                <label className="field-label" htmlFor="length">
                  Session length
                  <select
                    className="setup-select"
                    id="length"
                    onChange={(event) => setLength(event.target.value as InterviewLength)}
                    value={length}
                  >
                    <option>5 min</option>
                    <option>10 min</option>
                    <option>15 min</option>
                  </select>
                </label>
                <label className="field-label" htmlFor="persona">
                  Interviewer style
                  <select
                    className="setup-select"
                    id="persona"
                    onChange={(event) => setPersona(event.target.value as InterviewPersona)}
                    value={persona}
                  >
                    <option>Supportive</option>
                    <option>Direct</option>
                    <option>Challenging</option>
                  </select>
                </label>
              </div>

              <div className="feature-toggles">
                <label className="feature-toggle">
                  <input checked={adaptiveDifficulty} onChange={(event) => setAdaptiveDifficulty(event.target.checked)} type="checkbox" />
                  <span><strong>Adaptive difficulty</strong><small>Questions respond to how you&apos;re doing</small></span>
                </label>
                <label className="feature-toggle">
                  <input checked={feedbackEnabled} onChange={(event) => setFeedbackEnabled(event.target.checked)} type="checkbox" />
                  <span><strong>Coach me after each answer</strong><small>See actionable feedback and a model answer</small></span>
                </label>
                <label className="feature-toggle">
                  <input checked={voiceEnabled} onChange={(event) => setVoiceEnabled(event.target.checked)} type="checkbox" />
                  <span><strong>Voice mode</strong><small>Read questions aloud; dictate answers when supported</small></span>
                </label>
              </div>

              <section className="resume-panel">
                <button
                  aria-expanded={isResumeExpanded}
                  className="resume-toggle"
                  onClick={() => setIsResumeExpanded(!isResumeExpanded)}
                  type="button"
                >
                  <span><strong>Tailor to my experience</strong><small>Optional · add resume text for role-specific questions</small></span>
                  <span aria-hidden="true">{isResumeExpanded ? "−" : "+"}</span>
                </button>
                {isResumeExpanded && (
                  <div className="resume-content">
                    <label className="field-label" htmlFor="resume-context">Resume or experience notes</label>
                    <textarea
                      id="resume-context"
                      maxLength={12000}
                      onChange={(event) => setResumeContext(event.target.value)}
                      placeholder="Paste relevant experience, projects, and skills here..."
                      rows={4}
                      value={resumeContext}
                    />
                    <label className="resume-file-label">
                      Or upload a text resume
                      <input accept=".txt,.md,text/plain,text/markdown" onChange={readResumeFile} type="file" />
                    </label>
                    <p className="privacy-note">Resume text is sent with this interview&apos;s AI requests and kept in this browser&apos;s active session only—not in progress history. Clear it here when finished.</p>
                    {resumeError && <p className="form-error" role="alert">{resumeError}</p>}
                  </div>
                )}
              </section>

              <details className="sample-question">
                <summary><span>Preview a sample question</span><span aria-hidden="true">＋</span></summary>
                <p>{sampleQuestion}</p>
              </details>
            </div>
          </details>

          {error && (
            <p className="form-error" role="alert">
              <span aria-hidden="true">!</span>
              {error}
            </p>
          )}

          <button className="start-button" disabled={isStarting} type="submit">
            {isStarting ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Starting your interview...
              </>
            ) : (
              <>
                Start interview
                <span className="button-arrow" aria-hidden="true">↗</span>
              </>
            )}
          </button>
          <p className="privacy-note">
            No pressure. Just practice. Your session starts when you&apos;re ready.
          </p>
        </form>
      </section>

      <footer className="page-footer">
        <span>AI INTERVIEW COACH</span>
        <span>SHOW UP CURIOUS. LEAVE MORE CONFIDENT.</span>
      </footer>
    </main>
  );
}
