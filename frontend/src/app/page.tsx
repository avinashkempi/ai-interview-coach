"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiBaseUrl, saveInterviewSession, type Difficulty } from "@/lib/interview";

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

const difficulties: {
  value: Difficulty;
  description: string;
}[] = [
  { value: "Easy", description: "Core concepts & recall" },
  { value: "Medium", description: "Applied problem solving" },
  { value: "Hard", description: "Trade-offs & system thinking" },
];

export default function Home() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [error, setError] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  async function startInterview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTopic = topic.trim();

    if (!trimmedTopic) {
      setError("Enter a technical topic to get started.");
      return;
    }

    setError("");
    setIsStarting(true);

    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/interview/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: trimmedTopic, difficulty }),
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
        topic: trimmedTopic,
        difficulty,
        conversation: [{ role: "interviewer", content: result.message }],
        ended: result.ended,
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
        <span className="topbar-note">
          <span className="status-dot" />
          YOUR NEXT ROLE STARTS HERE
        </span>
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
            Practice technical interviews. Build confidence one answer at a time.
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
              <h2>Set up your session</h2>
            </div>
            <span className="step-indicator">01 <span>/ 01</span></span>
          </div>

          <label className="field-label" htmlFor="topic">
            Technical topic
          </label>
          <input
            autoComplete="off"
            className="topic-input"
            id="topic"
            maxLength={200}
            onChange={(event) => {
              setTopic(event.target.value);
              if (error) setError("");
            }}
            placeholder="e.g. System design, React, databases"
            value={topic}
          />

          <fieldset className="difficulty-fieldset">
            <legend className="field-label">Choose your difficulty</legend>
            <div className="difficulty-options">
              {difficulties.map((option, index) => (
                <label
                  className={`difficulty-option${difficulty === option.value ? " selected" : ""}`}
                  key={option.value}
                >
                  <input
                    checked={difficulty === option.value}
                    name="difficulty"
                    onChange={() => setDifficulty(option.value)}
                    type="radio"
                    value={option.value}
                  />
                  <span className="difficulty-topline">
                    <span className="difficulty-number">0{index + 1}</span>
                    <span className="radio-indicator" aria-hidden="true" />
                  </span>
                  <span className="difficulty-name">{option.value}</span>
                  <span className="difficulty-description">{option.description}</span>
                </label>
              ))}
            </div>
          </fieldset>

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
