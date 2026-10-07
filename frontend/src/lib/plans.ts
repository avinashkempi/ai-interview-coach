export type RolePreset = {
  role: string;
  category: string;
  topics: string[];
  sampleQuestion: string;
};

export const rolePresets: RolePreset[] = [
  {
    role: "Frontend Engineer",
    category: "Frontend",
    topics: ["React", "JavaScript", "Web performance", "Accessibility"],
    sampleQuestion: "How would you keep a large React page responsive as its data grows?",
  },
  {
    role: "Backend Engineer",
    category: "Backend",
    topics: ["APIs & REST", "Databases", "Caching", "System design"],
    sampleQuestion: "How would you design an API that remains reliable during traffic spikes?",
  },
  {
    role: "Full-stack Engineer",
    category: "Full stack",
    topics: ["React", "APIs & REST", "SQL", "System design"],
    sampleQuestion: "Walk through how you would build and secure a user sign-in flow end to end.",
  },
  {
    role: "Data Scientist",
    category: "Data & AI",
    topics: ["SQL", "Machine learning", "Statistics", "Python"],
    sampleQuestion: "How would you evaluate whether a classifier is useful for an imbalanced dataset?",
  },
  {
    role: "Mobile Engineer",
    category: "Mobile",
    topics: ["Mobile architecture", "Offline-first design", "Performance", "Accessibility"],
    sampleQuestion: "How would you make a mobile feature reliable when connectivity is intermittent?",
  },
  {
    role: "Platform Engineer",
    category: "Infrastructure",
    topics: ["System design", "Distributed systems", "Observability", "Databases"],
    sampleQuestion: "How would you investigate rising latency across a distributed service?",
  },
  {
    role: "SDET",
    category: "Quality Engineering",
    topics: ["Playwright", "Automation testing", "Test strategy", "API testing", "CI/CD"],
    sampleQuestion: "How would you build a reliable Playwright test strategy for a flaky web app without slowing down release quality?",
  },
];

export const topicCategories = [
  {
    name: "Frontend",
    topics: ["React", "JavaScript", "TypeScript", "Web performance", "Accessibility"],
  },
  {
    name: "Backend",
    topics: ["Python", "APIs & REST", "Databases", "SQL", "Caching"],
  },
  {
    name: "Algorithms",
    topics: ["Data structures & algorithms", "Problem solving", "Big O notation"],
  },
  {
    name: "Data & AI",
    topics: ["Machine learning", "Statistics", "Data modeling", "SQL"],
  },
  {
    name: "Systems",
    topics: ["System design", "Distributed systems", "Networking", "Security"],
  },
  {
    name: "Quality Engineering",
    topics: ["Playwright", "Automation testing", "Test strategy", "API testing", "CI/CD"],
  },
];

export const dailyChallenges = [
  {
    topic: "System design",
    prompt: "Design a notification service that handles retries without sending duplicates.",
  },
  {
    topic: "Data structures & algorithms",
    prompt: "Explain how you would find the longest substring with no repeated characters.",
  },
  {
    topic: "React",
    prompt: "When would you move state up, and when would you keep it local?",
  },
  {
    topic: "SQL",
    prompt: "How would you find the top three products by revenue for each category?",
  },
  {
    topic: "Python",
    prompt: "What trade-offs do generators offer when processing a large data stream?",
  },
  {
    topic: "APIs & REST",
    prompt: "How should an API make a payment-creation request safe to retry?",
  },
  {
    topic: "Machine learning",
    prompt: "How do you choose a metric when false negatives are especially costly?",
  },
];

export function getDailyChallenge(date: Date) {
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const dayNumber = Math.floor(date.getTime() / 86_400_000);
  return {
    ...dailyChallenges[((dayNumber % dailyChallenges.length) + dailyChallenges.length) % dailyChallenges.length],
    dateKey,
  };
}

export function getRolePreset(role: string): RolePreset {
  const preset = rolePresets.find((item) => item.role === role);
  if (preset) return preset;

  const customRole = role.trim();
  return {
    role: customRole || "Your target role",
    category: "Custom",
    topics: [
      "Role-specific fundamentals",
      "Problem solving",
      "Communication",
      "Scenario-based questions",
    ],
    sampleQuestion: customRole
      ? `What skills are most important for a ${customRole}, and how would you demonstrate them?`
      : "What skills are most important for your target role, and how would you demonstrate them?",
  };
}
