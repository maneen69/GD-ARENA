import { describe, expect, it, afterEach } from "vitest";
import { POST, GET } from "./route";
const valid = {
  topic: "AI in education",
  transcript: [],
  participants: [
    { name: "Aarav", personality: "analyst" },
    { name: "Riya", personality: "builder" },
    { name: "Kabir", personality: "challenger" },
  ],
  phase: "DISCUSSION",
  elapsedSeconds: 15,
  language: "English",
  difficulty: "Intermediate",
  format: "Standard GD",
};
describe("director route", () => {
  afterEach(() => {
    delete process.env.MOCK_LLM;
    delete process.env.LLM_API_KEY;
  });
  it("identifies mock mode without revealing secrets", async () => {
    delete process.env.LLM_API_KEY;
    const response = await GET();
    expect(await response.json()).toEqual({ mode: "mock" });
  });
  it("validates requests and bounds panel size", async () => {
    const response = await POST(
      new Request("http://local/api/director", {
        method: "POST",
        body: JSON.stringify({ ...valid, participants: [] }),
      }),
    );
    expect(response.status).toBe(400);
  });
  it("returns a clearly marked mock director turn without credentials", async () => {
    process.env.MOCK_LLM = "true";
    const response = await POST(
      new Request("http://local/api/director", {
        method: "POST",
        body: JSON.stringify(valid),
      }),
    );
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.mode).toBe("mock");
    expect(valid.participants.map((p) => p.name)).toContain(data.speaker);
  });
  it("responds to the user's point and varies reply and speaker on the next turn", async () => {
    process.env.MOCK_LLM = "true";
    const transcript = [
      {
        speaker: "You",
        text: "Scholarships for rural students need reliable transport too.",
      },
    ];
    const request = (turns: typeof transcript) =>
      POST(
        new Request("http://local/api/director", {
          method: "POST",
          body: JSON.stringify({ ...valid, transcript: turns }),
        }),
      );
    const firstResponse = await request(transcript);
    const first = await firstResponse.json();
    const secondResponse = await request([
      ...transcript,
      { speaker: first.speaker, text: first.text },
    ]);
    const second = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(first.text.toLowerCase()).toContain("scholarships");
    expect(second.text).not.toBe(first.text);
    expect(second.speaker).not.toBe(first.speaker);
  });
});
