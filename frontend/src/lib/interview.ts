export type Difficulty = "Easy" | "Medium" | "Hard";

export type ConversationMessage = {
  role: "interviewer" | "candidate";
  content: string;
};

export type InterviewSession = {
  topic: string;
  difficulty: Difficulty;
  conversation: ConversationMessage[];
  ended: boolean;
};

export type InterviewReport = {
  score: number;
  performance_band: "Excellent" | "Good" | "Adequate" | "Weak";
  strengths: string[];
  weaknesses: string[];
  topics_to_revise: string[];
  overall_verdict: string;
  result: "Pass" | "Fail";
};

export const sessionStorageKey = "ai-interview-coach-session";
export const reportStorageKey = "ai-interview-coach-report";
export const sessionChangeEvent = "ai-interview-coach-session-change";
export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ?? "";

export function isInterviewSession(value: unknown): value is InterviewSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<InterviewSession>;
  return (
    typeof session.topic === "string" &&
    (session.difficulty === "Easy" ||
      session.difficulty === "Medium" ||
      session.difficulty === "Hard") &&
    Array.isArray(session.conversation) &&
    session.conversation.length > 0 &&
    session.conversation.every(
      (message) =>
        message !== null &&
        typeof message === "object" &&
        (message.role === "interviewer" || message.role === "candidate") &&
        typeof message.content === "string",
    ) &&
    typeof session.ended === "boolean"
  );
}

export function isInterviewReport(value: unknown): value is InterviewReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<InterviewReport>;
  return (
    typeof report.score === "number" &&
    report.score >= 0 &&
    report.score <= 100 &&
    (report.performance_band === "Excellent" ||
      report.performance_band === "Good" ||
      report.performance_band === "Adequate" ||
      report.performance_band === "Weak") &&
    Array.isArray(report.strengths) &&
    report.strengths.every((item) => typeof item === "string") &&
    Array.isArray(report.weaknesses) &&
    report.weaknesses.every((item) => typeof item === "string") &&
    Array.isArray(report.topics_to_revise) &&
    report.topics_to_revise.every((item) => typeof item === "string") &&
    typeof report.overall_verdict === "string" &&
    (report.result === "Pass" || report.result === "Fail")
  );
}

export function saveInterviewSession(session: InterviewSession) {
  window.sessionStorage.setItem(sessionStorageKey, JSON.stringify(session));
  window.dispatchEvent(new Event(sessionChangeEvent));
}

export function parseInterviewSession(value: string | null): InterviewSession | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isInterviewSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
