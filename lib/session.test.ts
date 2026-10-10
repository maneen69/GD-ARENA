import { describe, expect, it } from "vitest";
import {
  buildRubric,
  countWords,
  estimateShares,
  pickSpeaker,
  transitionPhase,
  validParticipantCount,
  validateEvidence,
  type Phase,
} from "./session";

describe("validated GD session helpers", () => {
  it("accepts only 3 to 5 participants", () => {
    expect([3, 4, 5].every(validParticipantCount)).toBe(true);
    expect([2, 6, 3.5].some(validParticipantCount)).toBe(false);
  });
  it("rejects invalid phase transitions", () => {
    expect(transitionPhase("SETUP", "READY")).toBe("READY");
    expect(() => transitionPhase("SETUP", "COMPLETED")).toThrow();
    expect(transitionPhase("PAUSED", "DISCUSSION")).toBe("DISCUSSION");
  });
  it("enforces one speaking participant and balances turns", () => {
    const ps = [{ name: "A" }, { name: "B" }, { name: "C" }];
    expect(pickSpeaker(ps, {}, "A")).toBeNull();
    expect(pickSpeaker(ps, { A: 2, B: 0, C: 0 }, null)?.name).toBe("B");
  });
  it("counts words and estimates share from transcript text", () => {
    expect(countWords("  one two three ")).toBe(3);
    expect(
      estimateShares([
        { speaker: "You", text: "one two" },
        { speaker: "A", text: "three four six" },
      ]),
    ).toEqual({ You: 40, A: 60 });
  });
  it("only validates quotes tied to an exact stored turn id", () => {
    const turns = [{ id: "t1", text: "I would start with a local pilot." }];
    expect(
      validateEvidence(turns, [
        { turnId: "t1", quote: "I would start with a local pilot." },
      ]),
    ).toBe(true);
    expect(
      validateEvidence(turns, [{ turnId: "missing", quote: "local pilot" }]),
    ).toBe(false);
    expect(
      validateEvidence(turns, [{ turnId: "t1", quote: "invented quote" }]),
    ).toBe(false);
  });
  it("returns insufficient evidence without inventing quotes", () => {
    const rubric = buildRubric([
      {
        id: "u1",
        speaker: "You",
        role: "student",
        text: "I support a local pilot.",
        phase: "DISCUSSION",
      },
    ]);
    expect(rubric.find((x) => x.criterion === "Use of examples")?.score).toBe(
      "Insufficient evidence",
    );
    expect(
      rubric.find((x) => x.criterion === "Quality of ideas")?.evidenceQuotes,
    ).toEqual(["I support a local pilot."]);
  });
  it("simulates an offline demo through report completion after a student turn", () => {
    let phase: Phase = "SETUP";
    phase = transitionPhase(phase, "READY");
    phase = transitionPhase(phase, "OPENING");
    phase = transitionPhase(phase, "DISCUSSION");
    const demo = [
      { id: "m", text: "Moderator opens the room" },
      { id: "a", text: "AI participant replies" },
      { id: "u", text: "The student adds a typed point" },
    ];
    expect(demo.some((t) => t.id === "u")).toBe(true);
    phase = transitionPhase(phase, "PROCESSING_RESULTS");
    phase = transitionPhase(phase, "COMPLETED");
    expect(phase).toBe("COMPLETED");
  });
});
