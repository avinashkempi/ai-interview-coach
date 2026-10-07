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
  parseInterviewSession,
  saveInterviewSession,
  sessionChangeEvent,
  sessionStorageKey,
  type ConversationMessage,
  type InterviewFeedbackEntry,
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

type SpeechRecognitionResultLike = {
  0: { transcript: string };
  isFinal: boolean;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

function isInterviewFeedback(value: unknown): value is Omit<InterviewFeedbackEntry, "question" | "answer"> {
  if (!value || typeof value !== "object") return false;
  const feedback = value as Partial<InterviewFeedbackEntry>;
  return (
    Array.isArray(feedback.what_went_well) &&
    feedback.what_went_well.every((item) => typeof item === "string") &&
    Array.isArray(feedback.improve_next) &&
    feedback.improve_next.every((item) => typeof item === "string") &&
    typeof feedback.example_answer === "string"
  );
}

function isHintResponse(value: unknown): value is { hint: string } {
  return typeof value === "object" && value !== null && "hint" in value && typeof value.hint === "string";
}

export default function InterviewPage() {
  const router = useRouter();
  const saved = useSyncExternalStore(subscribeToSession, getSessionSnapshot, () => null);
  const [answer, setAnswer] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [isGettingHint, setIsGettingHint] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [isGettingFeedback, setIsGettingFeedback] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const lastSpokenMessageRef = useRef("");
  let session: InterviewSession | null = null;
  if (saved) {
    try {
      const parsed: unknown = JSON.parse(saved);
      if (isInterviewSession(parsed)) session = parsed;
    } catch {
      session = null;
    }
  }
  const latestMessage = session?.conversation.at(-1);
  const latestMessageContent = latestMessage?.content;
  const latestMessageRole = latestMessage?.role;
  const voiceEnabled = session?.settings?.voice_enabled ?? false;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session?.conversation.length, isThinking]);

  useEffect(() => {
    if (session?.ended) router.replace("/report");
  }, [router, session?.ended]);

  useEffect(() => {
    if (!voiceEnabled || latestMessageRole !== "interviewer" || !latestMessageContent) return;
    if (!("speechSynthesis" in window) || lastSpokenMessageRef.current === latestMessageContent) return;
    lastSpokenMessageRef.current = latestMessageContent;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(latestMessageContent));
    return () => window.speechSynthesis.cancel();
  }, [latestMessageContent, latestMessageRole, voiceEnabled]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
  }, []);

  async function requestFeedback(question: string, submittedAnswer: string, sessionId?: string) {
    setFeedbackError("");
    setIsGettingFeedback(true);
    try {
      const response = await fetch(`${apiBaseUrl}/interview/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: session?.topic, question, answer: submittedAnswer }),
      });
      if (!response.ok) {
        setFeedbackError(await getServerError(response, "get answer feedback"));
        return;
      }
      const result: unknown = await response.json();
      if (!isInterviewFeedback(result)) {
        setFeedbackError("The server returned unexpected answer feedback.");
        return;
      }
      const latestSession = parseInterviewSession(window.sessionStorage.getItem(sessionStorageKey));
      if (!latestSession || latestSession.id !== sessionId) return;
      const entry: InterviewFeedbackEntry = {
        question,
        answer: submittedAnswer,
        what_went_well: result.what_went_well,
        improve_next: result.improve_next,
        example_answer: result.example_answer,
      };
      saveInterviewSession({
        ...latestSession,
        feedback: [...(latestSession.feedback ?? []), entry],
      });
    } catch {
      setFeedbackError("Could not reach the coaching service. Your interview answer was saved.");
    } finally {
      setIsGettingFeedback(false);
    }
  }

  async function getHint() {
    if (!session || isThinking || isGettingHint) return;
    if (!apiBaseUrl) {
      setFeedbackError(
        "The backend URL is not configured. Set NEXT_PUBLIC_API_URL and restart the frontend.",
      );
      return;
    }
    const question = [...session.conversation].reverse().find((message) => message.role === "interviewer");
    if (!question) return;
    setHint("");
    setFeedbackError("");
    setIsGettingHint(true);
    try {
      const response = await fetch(`${apiBaseUrl}/interview/hint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: session.topic,
          question: question.content,
          answer: answer.trim(),
        }),
      });
      if (!response.ok) {
        setFeedbackError(await getServerError(response, "get a hint"));
        return;
      }
      const result: unknown = await response.json();
      if (!isHintResponse(result) || !result.hint.trim()) {
        setFeedbackError("The server returned an unexpected hint.");
        return;
      }
      setHint(result.hint);
    } catch {
      setFeedbackError("Could not reach the coaching service. Please try again.");
    } finally {
      setIsGettingHint(false);
    }
  }

  function toggleDictation() {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError("Voice typing is not available in this browser. You can still type your answer.");
      return;
    }
    setVoiceError("");
    const recognition = new Recognition();
    recognition.lang = window.navigator.language || "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const finalTranscripts: string[] = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal && result[0].transcript.trim()) {
          finalTranscripts.push(result[0].transcript.trim());
        }
      }
      const transcript = finalTranscripts.join(" ");
      if (transcript) setAnswer((current) => [current.trim(), transcript].filter(Boolean).join(" "));
    };
    recognition.onerror = () => {
      setVoiceError("Microphone access failed. Check your browser permission and try again.");
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setVoiceError("Could not start voice typing. You can still type your answer.");
    }
  }

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

    if (!apiBaseUrl) {
      setAnswer(submittedAnswer);
      setIsThinking(false);
      setError(
        "The backend URL is not configured. Set NEXT_PUBLIC_API_URL and restart the frontend.",
      );
      return;
    }

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
          settings: session.settings,
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

    setHint("");
    if (previousSession.settings?.feedback_enabled !== false) {
      const question = previousSession.conversation.at(-1);
      if (question?.role === "interviewer") {
        await requestFeedback(question.content, submittedAnswer, previousSession.id);
      }
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
            <p className="chat-role-line">{session.settings?.role ?? "Software Engineer"} <span>·</span> {session.settings?.persona ?? "Supportive"} interviewer</p>
          </div>
          <div className="chat-session-tags">
            <span className="session-tag difficulty-tag">{session.difficulty}{session.settings?.adaptive_difficulty ? " · adaptive" : ""}</span>
            {session.settings?.length && <span className="session-tag">{session.settings.length}</span>}
          </div>
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
              {message.role === "candidate" && session.feedback?.find(
                (item) => item.answer === message.content && session.conversation[index - 1]?.content === item.question,
              ) && (
                <div className="answer-feedback-card">
                  <span className="card-kicker">COACH NOTES</span>
                  <strong>What worked</strong>
                  <ul>
                    {session.feedback.find((item) => item.answer === message.content && session.conversation[index - 1]?.content === item.question)?.what_went_well.map((item, itemIndex) => <li key={`good-${itemIndex}`}>{item}</li>)}
                  </ul>
                  <strong>Try next</strong>
                  <ul>
                    {session.feedback.find((item) => item.answer === message.content && session.conversation[index - 1]?.content === item.question)?.improve_next.map((item, itemIndex) => <li key={`next-${itemIndex}`}>{item}</li>)}
                  </ul>
                  <details>
                    <summary>See a stronger example</summary>
                    <p>{session.feedback.find((item) => item.answer === message.content && session.conversation[index - 1]?.content === item.question)?.example_answer}</p>
                  </details>
                </div>
              )}
            </article>
          ))}
          {isGettingFeedback && (
            <p className="feedback-loading" role="status">Coach is reviewing your last answer…</p>
          )}
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
        {feedbackError && <p className="feedback-error" role="alert">{feedbackError}</p>}
        {hint && <div className="hint-card"><span className="card-kicker">A SMALL NUDGE</span><p>{hint}</p></div>}
        {voiceError && <p className="feedback-error" role="alert">{voiceError}</p>}

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
            <div className="composer-actions">
              <button className="composer-utility-button" disabled={isThinking || isGettingHint} onClick={() => void getHint()} type="button">
                {isGettingHint ? "Finding a hint…" : "Need a hint?"}
              </button>
              {session.settings?.voice_enabled && (
                <button aria-pressed={isListening} className={`composer-utility-button voice-button${isListening ? " active" : ""}`} onClick={toggleDictation} type="button">
                  {isListening ? "Stop mic" : "Dictate"}
                </button>
              )}
              <button className="send-button" disabled={isThinking || !answer.trim()} type="submit">
                {isThinking ? "Thinking..." : "Send answer"} <span aria-hidden="true">↗</span>
              </button>
            </div>
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
