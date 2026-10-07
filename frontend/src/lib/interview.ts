export type Difficulty = "Easy" | "Medium" | "Hard";
export type InterviewLength = "5 min" | "10 min" | "15 min";
export type InterviewPersona = "Supportive" | "Direct" | "Challenging";

export type InterviewSettings = {
  role: string;
  length: InterviewLength;
  persona: InterviewPersona;
  adaptive_difficulty: boolean;
  feedback_enabled: boolean;
  voice_enabled: boolean;
  resume_context: string;
  plan_topics: string[];
};

export type ConversationMessage = {
  role: "interviewer" | "candidate";
  content: string;
};

export type InterviewFeedbackEntry = {
  question: string;
  answer: string;
  what_went_well: string[];
  improve_next: string[];
  example_answer: string;
};

export type InterviewSession = {
  id?: string;
  topic: string;
  difficulty: Difficulty;
  conversation: ConversationMessage[];
  ended: boolean;
  settings?: InterviewSettings;
  feedback?: InterviewFeedbackEntry[];
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

export type InterviewProgress = {
  id: string;
  date: string;
  topic: string;
  role: string;
  difficulty: Difficulty;
  score: number;
  performance_band: InterviewReport["performance_band"];
  result: InterviewReport["result"];
  strengths: string[];
  weaknesses: string[];
  topics_to_revise: string[];
  plan_topics: string[];
};

export const sessionStorageKey = "ai-interview-coach-session";
export const reportStorageKey = "ai-interview-coach-report";
export const sessionChangeEvent = "ai-interview-coach-session-change";
export const progressStorageKey = "ai-interview-coach-progress";
export const progressChangeEvent = "ai-interview-coach-progress-change";
export const activePlanStorageKey = "ai-interview-coach-active-plan";
export const pendingSetupStorageKey = "ai-interview-coach-pending-setup";
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
    typeof session.ended === "boolean" &&
    (session.id === undefined || typeof session.id === "string") &&
    (session.settings === undefined || isInterviewSettings(session.settings)) &&
    (session.feedback === undefined ||
      (Array.isArray(session.feedback) && session.feedback.every(isInterviewFeedbackEntry)))
  );
}

function isInterviewFeedbackEntry(value: unknown): value is InterviewFeedbackEntry {
  if (!value || typeof value !== "object") return false;
  const feedback = value as Partial<InterviewFeedbackEntry>;
  return (
    typeof feedback.question === "string" &&
    typeof feedback.answer === "string" &&
    Array.isArray(feedback.what_went_well) &&
    feedback.what_went_well.every((item) => typeof item === "string") &&
    Array.isArray(feedback.improve_next) &&
    feedback.improve_next.every((item) => typeof item === "string") &&
    typeof feedback.example_answer === "string"
  );
}

export function isInterviewSettings(value: unknown): value is InterviewSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as Partial<InterviewSettings>;
  return (
    typeof settings.role === "string" &&
    (settings.length === "5 min" ||
      settings.length === "10 min" ||
      settings.length === "15 min") &&
    (settings.persona === "Supportive" ||
      settings.persona === "Direct" ||
      settings.persona === "Challenging") &&
    typeof settings.adaptive_difficulty === "boolean" &&
    typeof settings.feedback_enabled === "boolean" &&
    typeof settings.voice_enabled === "boolean" &&
    typeof settings.resume_context === "string" &&
    Array.isArray(settings.plan_topics) &&
    settings.plan_topics.every((topic) => typeof topic === "string")
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

export function readInterviewProgress(): InterviewProgress[] {
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(progressStorageKey) ?? "[]",
    );
    if (!Array.isArray(value)) return [];
    return value.filter(isInterviewProgress);
  } catch {
    return [];
  }
}

function isInterviewProgress(value: unknown): value is InterviewProgress {
  if (!value || typeof value !== "object") return false;
  const progress = value as Partial<InterviewProgress>;
  return (
    typeof progress.id === "string" &&
    typeof progress.date === "string" &&
    typeof progress.topic === "string" &&
    typeof progress.role === "string" &&
    (progress.difficulty === "Easy" ||
      progress.difficulty === "Medium" ||
      progress.difficulty === "Hard") &&
    typeof progress.score === "number" &&
    (progress.performance_band === "Excellent" ||
      progress.performance_band === "Good" ||
      progress.performance_band === "Adequate" ||
      progress.performance_band === "Weak") &&
    (progress.result === "Pass" || progress.result === "Fail") &&
    Array.isArray(progress.strengths) &&
    progress.strengths.every((item) => typeof item === "string") &&
    Array.isArray(progress.weaknesses) &&
    progress.weaknesses.every((item) => typeof item === "string") &&
    Array.isArray(progress.topics_to_revise) &&
    progress.topics_to_revise.every((item) => typeof item === "string") &&
    Array.isArray(progress.plan_topics) &&
    progress.plan_topics.every((item) => typeof item === "string")
  );
}

export function saveInterviewProgress(
  session: InterviewSession,
  report: InterviewReport,
) {
  const id = session.id ?? `${session.topic}-${Date.now()}`;
  const progress: InterviewProgress = {
    id,
    date: new Date().toISOString(),
    topic: session.topic,
    role: session.settings?.role ?? "Software Engineer",
    difficulty: session.difficulty,
    score: report.score,
    performance_band: report.performance_band,
    result: report.result,
    strengths: report.strengths,
    weaknesses: report.weaknesses,
    topics_to_revise: report.topics_to_revise,
    plan_topics: session.settings?.plan_topics ?? [],
  };
  const history = readInterviewProgress().filter((item) => item.id !== id);
  window.localStorage.setItem(
    progressStorageKey,
    JSON.stringify([progress, ...history].slice(0, 100)),
  );
  window.dispatchEvent(new Event(progressChangeEvent));
}
