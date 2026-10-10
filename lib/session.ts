export type Phase =
  | "SETUP"
  | "READY"
  | "OPENING"
  | "DISCUSSION"
  | "CLOSING"
  | "PROCESSING_RESULTS"
  | "COMPLETED"
  | "PAUSED"
  | "ERROR";
const allowed: Record<Phase, Phase[]> = {
  SETUP: ["READY", "SETUP"],
  READY: ["OPENING", "SETUP"],
  OPENING: [
    "DISCUSSION",
    "CLOSING",
    "PAUSED",
    "PROCESSING_RESULTS",
    "ERROR",
    "SETUP",
  ],
  DISCUSSION: ["CLOSING", "PAUSED", "PROCESSING_RESULTS", "ERROR", "SETUP"],
  CLOSING: ["PAUSED", "PROCESSING_RESULTS", "ERROR", "SETUP"],
  PROCESSING_RESULTS: ["COMPLETED", "ERROR"],
  COMPLETED: ["SETUP", "READY"],
  PAUSED: ["DISCUSSION", "CLOSING", "PROCESSING_RESULTS", "ERROR", "SETUP"],
  ERROR: ["READY", "SETUP"],
};
export function transitionPhase(from: Phase, to: Phase): Phase {
  if (from === to) return from;
  if (!allowed[from].includes(to))
    throw new Error("Invalid session phase transition: " + from + " -> " + to);
  return to;
}
export function validParticipantCount(n: number) {
  return Number.isInteger(n) && n >= 3 && n <= 5;
}
export function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
export function estimateShares(
  turns: Array<{ speaker: string; text: string }>,
) {
  const totals: Record<string, number> = {};
  for (const turn of turns)
    totals[turn.speaker] = (totals[turn.speaker] || 0) + countWords(turn.text);
  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  return Object.fromEntries(
    Object.entries(totals).map(([speaker, words]) => [
      speaker,
      sum ? Math.round((words / sum) * 100) : 0,
    ]),
  );
}
export function validateEvidence(
  turns: Array<{ id: string; text: string }>,
  claims: Array<{ turnId: string; quote: string }>,
) {
  return claims.every((c) =>
    turns.some((t) => t.id === c.turnId && t.text === c.quote),
  );
}
export function pickSpeaker<T extends { name: string }>(
  participants: T[],
  spoken: Record<string, number>,
  currentlySpeaking: string | null,
) {
  if (currentlySpeaking || participants.length < 3 || participants.length > 5)
    return null;
  return (
    [...participants].sort(
      (a, b) => (spoken[a.name] || 0) - (spoken[b.name] || 0),
    )[0] || null
  );
}

export type RubricItem = {
  criterion: string;
  score: "Evidence present" | "Insufficient evidence";
  explanation: string;
  supportingTurnIds: string[];
  evidenceQuotes: string[];
  nextStep: string;
};
export function buildRubric(
  turns: Array<{
    id: string;
    speaker: string;
    role: string;
    text: string;
    phase: string;
    interrupted?: boolean;
  }>,
): RubricItem[] {
  const student = turns.filter((t) => t.role === "student"),
    evidence = (predicate: (t: (typeof turns)[number]) => boolean) =>
      student.find(predicate),
    item = (
      criterion: string,
      t: (typeof turns)[number] | undefined,
      explanation: string,
      nextStep: string,
    ): RubricItem => ({
      criterion,
      score: t ? "Evidence present" : "Insufficient evidence",
      explanation,
      supportingTurnIds: t ? [t.id] : [],
      evidenceQuotes: t ? [t.text] : [],
      nextStep,
    });
  const first = student[0],
    opened = first && turns.findIndex((t) => t.id === first.id) <= 2,
    example = evidence((t) =>
      /\b(for example|e\.g\.|such as|example|because)\b|\d/i.test(t.text),
    ),
    listening = evidence((t) =>
      /\b(building on|you mentioned|as .{1,24} said|i agree with|i'd add to)\b/i.test(
        t.text,
      ),
    ),
    long = evidence((t) => t.text.trim().split(/\s+/).length > 0),
    concise = evidence((t) => t.text.trim().split(/\s+/).length <= 45),
    closing = evidence(
      (t) =>
        t.phase === "CLOSING" ||
        /\b(to conclude|in conclusion|to sum up|my closing)\b/i.test(t.text),
    ),
    interruption = evidence((t) => !!t.interrupted);
  return [
    item(
      "Starting the discussion",
      opened ? first : undefined,
      "Evidence is limited to how early your first recorded contribution appears.",
      "Try opening with a clear position and one reason.",
    ),
    item(
      "Quality of ideas",
      long,
      "A contribution is present in the transcript.",
      "Support one main idea with a concrete reason.",
    ),
    item(
      "Use of examples",
      example,
      "Your turn includes an example cue or a concrete number.",
      "Add a specific example to make the point easier to evaluate.",
    ),
    item(
      "Listening and building",
      listening,
      "Your turn explicitly refers to another point.",
      "Name the point you are building on before adding your view.",
    ),
    item(
      "Handling interruption",
      interruption,
      "An AI turn was marked interrupted when you started the mic while it was speaking.",
      "If interrupted, pause briefly and return to your point calmly.",
    ),
    item(
      "Conciseness",
      concise,
      "A recorded contribution contains 45 words or fewer.",
      "Keep each contribution focused on one idea.",
    ),
    item(
      "Closing strongly",
      closing,
      "A recorded contribution was made during the closing phase or uses a closing phrase.",
      "Reserve one concise sentence to summarise your position.",
    ),
  ];
}
