"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  apiBaseUrl,
  isInterviewSession,
  saveInterviewSession,
  sessionChangeEvent,
  sessionStorageKey,
  type ConversationMessage,
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

function getMessageResponse(value: unknown): value is { message: string; ended: boolean } {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string" &&
    "ended" in value &&
    typeof value.ended === "boolean"
  );
}

async function getServerError(response: Response, action: string) {
  let message = `The server could not ${action} (HTTP ${response.status}). Please try again.`;
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

export default function InterviewPage() {
  const router = useRouter();
  const saved = useSyncExternalStore(subscribeToSession, getSessionSnapshot, () => null);
  const [answer, setAnswer] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  let session: InterviewSession | null = null;
  if (saved) {
    try {
      const parsed: unknown = JSON.parse(saved);
      if (isInterviewSession(parsed)) session = parsed;
    } catch {
      session = null;
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session?.conversation.length, isThinking]);

  useEffect(() => {
    if (session?.ended) router.replace("/report");
  }, [router, session?.ended]);

  async function submitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || session.ended || isThinking) return;

    const submittedAnswer = answer.trim();
    if (!submittedAnswer) {
      setError("Write an answer before sending.");
      textareaRef.current?.focus();
      return;
    }

    const previousSession = session;
    const candidateMessage: ConversationMessage = {
      role: "candidate",
      content: submittedAnswer,
    };
    const conversationWithAnswer = [...session.conversation, candidateMessage];
    setError("");
    setAnswer("");
    setIsThinking(true);

    try {
      saveInterviewSession({ ...session, conversation: conversationWithAnswer });
    } catch {
      setAnswer(submittedAnswer);
      setIsThinking(false);
      setError("Could not save your answer in this browser. Please try again.");
      return;
    }

    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/interview/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: session.topic,
          difficulty: session.difficulty,
          conversation: conversationWithAnswer,
        }),
      });
    } catch {
      saveInterviewSession(previousSession);
      setAnswer(submittedAnswer);
      setError(
        `Could not reach the interview server at ${apiBaseUrl}. Your answer has been restored; please try again.`,
      );
      setIsThinking(false);
      textareaRef.current?.focus();
      return;
    }

    if (!response.ok) {
      const message = await getServerError(response, "submit your answer");
      saveInterviewSession(previousSession);
      setAnswer(submittedAnswer);
      setError(message);
      setIsThinking(false);
      textareaRef.current?.focus();
      return;
    }

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      saveInterviewSession(previousSession);
      setAnswer(submittedAnswer);
      setError("The server returned an unreadable response. Your answer has been restored.");
      setIsThinking(false);
      textareaRef.current?.focus();
      return;
    }

    if (!getMessageResponse(result) || !result.message.trim()) {
      saveInterviewSession(previousSession);
      setAnswer(submittedAnswer);
      setError("The server returned an unexpected response. Your answer has been restored.");
      setIsThinking(false);
      textareaRef.current?.focus();
      return;
    }

    const nextSession: InterviewSession = {
      ...previousSession,
      conversation: [
        ...conversationWithAnswer,
        { role: "interviewer", content: result.message },
      ],
      ended: result.ended,
    };
    try {
      saveInterviewSession(nextSession);
    } catch {
      setError("The reply arrived, but the session could not be saved in this browser.");
      setIsThinking(false);
      return;
    }

    setIsThinking(false);
    if (result.ended) router.replace("/report");
  }

  function handleAnswerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  if (!session) {
    return (
      <main className="interview-shell">
        <div className="interview-empty">
          <span className="eyebrow">NO ACTIVE SESSION</span>
          <h1>Let&apos;s start with a topic.</h1>
          <p>Your interview session wasn&apos;t found. Start a new one to get your first question.</p>
          <Link className="start-button back-button" href="/">
            Back to setup <span className="button-arrow" aria-hidden="true">↗</span>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="interview-shell chat-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="AI Interview Coach home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>INTERVIEW<span className="brand-accent">/</span>COACH</span>
        </Link>
        <Link className="exit-link" href="/">Exit session <span aria-hidden="true">×</span></Link>
      </header>

      <section className="chat-content" aria-label="Interview conversation">
        <div className="chat-session-header">
          <div>
            <span className="eyebrow"><span className="status-dot" /> INTERVIEW IN PROGRESS</span>
            <h1>{session.topic}</h1>
          </div>
          <span className="session-tag difficulty-tag">{session.difficulty}</span>
        </div>

        <div className="chat-messages" aria-live="polite">
          {session.conversation.map((message, index) => (
            <article
              className={`chat-message ${message.role === "interviewer" ? "interviewer-message" : "candidate-message"}`}
              key={`${index}-${message.role}`}
            >
              {message.role === "interviewer" && (
                <span className="message-avatar" aria-hidden="true">AI</span>
              )}
              <div className="message-body">
                <span className="message-author">
                  {message.role === "interviewer" ? "INTERVIEWER" : "YOU"}
                </span>
                <p>{message.content}</p>
              </div>
              {message.role === "candidate" && (
                <span className="candidate-avatar" aria-hidden="true">YOU</span>
              )}
            </article>
          ))}
          {isThinking && (
            <div className="thinking-indicator" role="status" aria-live="polite">
              <span className="message-avatar" aria-hidden="true">AI</span>
              <div className="thinking-content">
                <span className="message-author">INTERVIEWER</span>
                <span className="thinking-dots" aria-label="AI is thinking">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <span className="thinking-label">Thinking...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {error && (
          <p className="chat-error" role="alert">
            <span aria-hidden="true">!</span>
            {error}
          </p>
        )}

        <form className="answer-composer" onSubmit={submitAnswer}>
          <label className="sr-only" htmlFor="answer">Your answer</label>
          <textarea
            disabled={isThinking}
            id="answer"
            onChange={(event) => {
              setAnswer(event.target.value);
              if (error) setError("");
            }}
            onKeyDown={handleAnswerKeyDown}
            placeholder={isThinking ? "The interviewer is thinking..." : "Type your answer..."}
            ref={textareaRef}
            rows={3}
            value={answer}
          />
          <div className="composer-footer">
            <span>ENTER TO SEND <span className="key-divider">·</span> SHIFT + ENTER FOR A NEW LINE</span>
            <button
              className="send-button"
              disabled={isThinking || !answer.trim()}
              type="submit"
            >
              {isThinking ? "Thinking..." : "Send answer"}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </form>
      </section>
      <footer className="page-footer">
        <span>AI INTERVIEW COACH</span>
        <span>ONE QUESTION AT A TIME</span>
      </footer>
    </main>
  );
}
