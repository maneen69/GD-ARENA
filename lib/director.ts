export type DirectorLine = { speaker: string; text: string };
export type DirectorParticipant = { name: string; personality: string };

const stopWords = new Set([
  "about",
  "after",
  "also",
  "because",
  "could",
  "from",
  "have",
  "into",
  "just",
  "more",
  "most",
  "should",
  "that",
  "their",
  "there",
  "these",
  "they",
  "this",
  "those",
  "very",
  "what",
  "when",
  "which",
  "while",
  "would",
  "your",
  "with",
  "will",
  "than",
  "then",
  "them",
  "some",
  "only",
  "much",
  "many",
  "think",
  "people",
  "really",
  "like",
  "make",
  "being",
  "been",
  "were",
  "were",
  "the",
  "and",
  "for",
  "you",
  "are",
  "but",
  "not",
  "can",
  "our",
  "out",
  "its",
  "who",
  "how",
  "why",
  "all",
  "one",
  "two",
  "too",
  "any",
  "get",
  "got",
  "has",
  "had",
  "was",
  "use",
  "using",
  "used",
  "does",
  "did",
  "let",
  "say",
  "said",
  "they're",
  "it's",
]);

const replyTemplates = [
  (point: string) =>
    `You mentioned “${point}.” What would count as evidence for that? A small pilot could give us a concrete way to compare the outcomes.`,
  (point: string) =>
    `Your point about “${point}” raises the question of access. How can we make sure the people most affected can benefit too?`,
  (point: string) =>
    `I see the case around “${point},” though the transition may create costs. Who should carry those costs, and how do we keep it fair?`,
  (point: string) =>
    `Let’s make “${point}” practical: what is one step a college or company could try this year, and how should it measure success?`,
  (point: string) =>
    `Building on “${point},” what might change over the next five years? The long-term effect could look different from the immediate one.`,
  (point: string) =>
    `We have heard your view on “${point}.” What is the strongest counterargument we should consider before reaching a conclusion?`,
];

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function anchorFrom(text: string, fallback: string) {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' -]+/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
  const anchor = words.slice(0, 4).join(" ");
  if (anchor) return anchor.slice(0, 60);
  return fallback.trim().split(/\s+/).slice(0, 4).join(" ").slice(0, 60);
}

export function buildMockTurn(input: {
  topic: string;
  transcript: DirectorLine[];
  participants: DirectorParticipant[];
}) {
  const aiSpeakers = new Set(input.participants.map((person) => person.name));
  const priorAi = input.transcript.filter((turn) =>
    aiSpeakers.has(turn.speaker),
  );
  const lastSpeaker = [...priorAi].reverse()[0]?.speaker;
  const preferred =
    input.participants[priorAi.length % input.participants.length];
  const speaker =
    preferred.name === lastSpeaker && input.participants.length > 1
      ? input.participants[(priorAi.length + 1) % input.participants.length]
      : preferred;
  const lastUserText = [...input.transcript]
    .reverse()
    .find((turn) => turn.speaker === "You")?.text;
  const anchor = anchorFrom(lastUserText ?? "", input.topic);
  const recentReplies = new Set(
    priorAi.slice(-6).map((turn) => normalize(turn.text)),
  );
  let templateIndex = priorAi.length % replyTemplates.length;
  let text = replyTemplates[templateIndex](anchor);
  for (
    let attempt = 0;
    recentReplies.has(normalize(text)) && attempt < replyTemplates.length;
    attempt++
  ) {
    templateIndex = (templateIndex + 1) % replyTemplates.length;
    text = replyTemplates[templateIndex](anchor);
  }
  return {
    speaker: speaker.name,
    text,
    intent: "Respond to the latest contribution with a new discussion angle",
  };
}
