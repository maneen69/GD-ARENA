import { NextResponse } from "next/server";
import { z } from "zod";
const Input = z.object({
  topic: z.string().trim().min(5).max(140),
  transcript: z
    .array(
      z.object({ speaker: z.string().max(30), text: z.string().max(1000) }),
    )
    .max(12),
  participants: z
    .array(
      z.object({ name: z.string().max(30), personality: z.string().max(100) }),
    )
    .min(3)
    .max(5),
  phase: z.enum(["OPENING", "DISCUSSION", "CLOSING", "PAUSED"]),
  elapsedSeconds: z.number().min(0).max(3600),
  language: z.enum(["English", "Hinglish"]),
  difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]),
  format: z.enum(["Standard GD", "Case-based", "Abstract", "Debate"]),
});
const Output = z.object({
  speaker: z.string(),
  text: z.string().trim().min(3).max(360),
  intent: z.string().max(120),
});
const requests = new Map<string, { start: number; count: number }>();
function live() {
  return process.env.MOCK_LLM !== "true" && !!process.env.LLM_API_KEY;
}
export async function GET() {
  return NextResponse.json({ mode: live() ? "live" : "mock" });
}
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (raw.length > 20000)
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const b = Input.parse(JSON.parse(raw));
    const key = req.headers.get("x-forwarded-for")?.split(",")[0] || "local",
      now = Date.now(),
      r = requests.get(key);
    if (r && now - r.start < 60000 && r.count >= 30)
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    requests.set(
      key,
      !r || now - r.start >= 60000
        ? { start: now, count: 1 }
        : { ...r, count: r.count + 1 },
    );
    if (!live()) {
      const p =
        b.participants[Math.floor(Math.random() * b.participants.length)];
      return NextResponse.json({
        speaker: p.name,
        text: "We should look at both the immediate opportunity and who might be left out. A practical first step is to test this on a small scale.",
        intent: "Add a balanced perspective",
        mode: "mock",
      });
    }
    const url =
        (
          process.env.LLM_BASE_URL ||
          "https://generativelanguage.googleapis.com/v1beta/openai"
        ).replace(/\/$/, "") + "/chat/completions",
      response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer " + process.env.LLM_API_KEY,
        },
        body: JSON.stringify({
          model: process.env.LLM_MODEL || "gemini-2.5-flash",
          temperature: 0.7,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Direct a realistic student group discussion in the requested language, difficulty, and format. Return JSON {speaker,text,intent}. speaker must exactly match a panel name. text is one to three spoken sentences, at most 40 words. React to recent transcript, never fabricate sources or statistics, and stay respectful. Panel: " +
                b.participants
                  .map((p) => p.name + " — " + p.personality)
                  .join("; "),
            },
            {
              role: "user",
              content: JSON.stringify({
                topic: b.topic,
                recentTranscript: b.transcript,
                phase: b.phase,
                elapsedSeconds: b.elapsedSeconds,
                language: b.language,
                difficulty: b.difficulty,
                format: b.format,
              }),
            },
          ],
        }),
        signal: AbortSignal.timeout(8000),
      });
    if (!response.ok)
      return NextResponse.json(
        { error: "AI service unavailable" },
        { status: 502 },
      );
    const payload = await response.json();
    let decoded;
    try {
      decoded = JSON.parse(payload.choices?.[0]?.message?.content);
    } catch {
      return NextResponse.json(
        { error: "Invalid AI response" },
        { status: 502 },
      );
    }
    const out = Output.safeParse(decoded);
    if (
      !out.success ||
      !b.participants.some((p) => p.name === out.data.speaker)
    )
      return NextResponse.json(
        { error: "AI response did not match the panel" },
        { status: 502 },
      );
    return NextResponse.json({ ...out.data, mode: "live" });
  } catch (e) {
    if (e instanceof z.ZodError)
      return NextResponse.json(
        { error: "Invalid request", details: e.issues.map((i) => i.message) },
        { status: 400 },
      );
    if (e instanceof Error && e.name === "TimeoutError")
      return NextResponse.json(
        { error: "AI request timed out" },
        { status: 504 },
      );
    return NextResponse.json(
      { error: "Could not generate a response" },
      { status: 400 },
    );
  }
}
