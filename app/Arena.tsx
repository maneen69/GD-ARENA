"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildMockTurn } from "../lib/director";
import { buildRubric, transitionPhase, type Phase } from "../lib/session";
type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult:
    | ((e: {
        results: ArrayLike<
          ArrayLike<{ transcript: string }> & { isFinal: boolean }
        >;
      }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
type Turn = {
  id: string;
  speaker: string;
  role: "student" | "ai" | "moderator";
  text: string;
  at: number;
  method: "speech" | "typed" | "ai" | "moderator";
  phase: string;
  interrupted?: boolean;
};
type Setup = {
  topic: string;
  count: number;
  duration: number;
  voice: boolean;
  patience: number;
  language: string;
  difficulty: string;
  format: string;
};
type SessionMode = "demo" | "mock" | "live";
type Saved = {
  id: string;
  topic: string;
  date: string;
  duration: number;
  score: number;
  transcript: Turn[];
  share: number;
  mode: SessionMode;
};
const topics = [
  "Should AI be regulated in education?",
  "Is a four-day work week practical in India?",
  "Remote work: freedom or isolation?",
  "Can India become a global semiconductor hub?",
  "Should college attendance be mandatory?",
  "Social media: connect or distract?",
  "Is cashless India inclusive?",
  "The future of electric mobility",
  "Should internships be paid?",
  "Will AI create more jobs than it replaces?",
  "Balancing growth and climate action",
  "Is entrepreneurship better than a first job?",
  "Data privacy versus convenience",
  "Should exams be open-book?",
  "The role of sports in education",
  "Does online learning close the skills gap?",
  "A campus with no grades",
  "Should companies hire for skills over degrees?",
  "Can gig work offer career stability?",
  "The impact of quick commerce",
];
const panel = [
  {
    name: "Aarav",
    kind: "Data-driven analyst",
    color: "#7dd3fc",
    say: [
      "We should separate adoption from impact. Without a measurable baseline, the headline numbers tell us very little.",
      "A useful first step is to define who benefits and who carries the cost.",
    ],
  },
  {
    name: "Riya",
    kind: "Collaborative builder",
    color: "#c4b5fd",
    say: [
      "Building on that point, access matters as much as the technology itself.",
      "Could we combine both views by starting with a small, measurable pilot?",
    ],
  },
  {
    name: "Kabir",
    kind: "Confident challenger",
    color: "#fda4af",
    say: [
      "I see the upside, but that assumes the transition is fair to everyone involved.",
      "I respectfully disagree with making that the only measure of success.",
    ],
  },
  {
    name: "Meera",
    kind: "Quiet thinker",
    color: "#86efac",
    say: [
      "One angle we have not covered is who gets left out of the conversation.",
      "The long-term effect may matter more than immediate convenience.",
    ],
  },
  {
    name: "Dev",
    kind: "Occasional tangent",
    color: "#fcd34d",
    say: [
      "That reminds me of how our campus handles change. The first step should stay practical.",
      "Small experiments can reveal what a big plan misses.",
    ],
  },
];
const initial: Setup = {
  topic: topics[0],
  count: 3,
  duration: 8,
  voice: true,
  patience: 1.2,
  language: "English",
  difficulty: "Intermediate",
  format: "Standard GD",
};
const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length,
  uid = () => Math.random().toString(36).slice(2, 10),
  clock = (n: number) =>
    Math.floor(n / 60)
      .toString()
      .padStart(2, "0") +
    ":" +
    (n % 60).toString().padStart(2, "0");
export default function Home({ liveEnabled }: { liveEnabled: boolean }) {
  const [screen, S] = useState<
      "home" | "setup" | "room" | "report" | "history"
    >("home"),
    [cfg, C] = useState(initial),
    [demo, D] = useState(false),
    [phase, setPhase] = useState<Phase>("SETUP"),
    [turns, T] = useState<Turn[]>([]),
    [seconds, Sec] = useState(300),
    [input, I] = useState(""),
    [listening, L] = useState(false),
    [muted, M] = useState(false),
    [speaking, Sp] = useState(""),
    [notice, N] = useState(""),
    [history, H] = useState<Saved[]>([]),
    [filter, F] = useState("All speakers"),
    [focusTurn, Focus] = useState(""),
    [reportMode, SetReportMode] = useState<SessionMode>("mock");
  const P = useCallback(
    (to: Phase | ((p: Phase) => Phase)) =>
      setPhase((current) => {
        const target = typeof to === "function" ? to(current) : to;
        try {
          if (target === "OPENING" && current === "SETUP")
            return transitionPhase(
              transitionPhase(current, "READY"),
              "OPENING",
            );
          if (target === "OPENING" && current === "COMPLETED")
            return transitionPhase(
              transitionPhase(transitionPhase(current, "SETUP"), "READY"),
              "OPENING",
            );
          return transitionPhase(current, target);
        } catch {
          return current;
        }
      }),
    [],
  );
  const turnsRef = useRef<Turn[]>([]),
    phaseRef = useRef<Phase>("SETUP"),
    secondsRef = useRef(300),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    next = useRef<ReturnType<typeof setTimeout> | null>(null),
    recognition = useRef<SpeechRec | null>(null),
    lastAi = useRef(0);
  useEffect(
    () => () => {
      if (next.current) clearTimeout(next.current);
      speechSynthesis?.cancel();
    },
    [],
  );
  const add = useCallback(
    (
      speaker: string,
      role: Turn["role"],
      text: string,
      method: Turn["method"],
    ) => {
      const t: Turn = {
        id: uid(),
        speaker,
        role,
        text: text.slice(0, 1500),
        at: Date.now(),
        method,
        phase: phaseRef.current,
      };
      T((old) => {
        const n = [...old, t].slice(-180);
        turnsRef.current = n;
        return n;
      });
    },
    [],
  );
  const say = useCallback(
    (who: string, text: string) => {
      if (muted || !cfg.voice || !window.speechSynthesis) return;
      speechSynthesis.cancel();
      Sp(who);
      const u = new SpeechSynthesisUtterance(text);
      u.rate = who === "Meera" ? 0.88 : who === "Kabir" ? 1.04 : 0.96;
      const v = speechSynthesis
        .getVoices()
        .find((x) => x.lang.startsWith("en"));
      if (v) u.voice = v;
      u.onend = () => Sp("");
      u.onerror = () => Sp("");
      speechSynthesis.speak(u);
    },
    [muted, cfg.voice],
  );
  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);
  useEffect(() => {
    if (
      screen !== "room" ||
      ["PAUSED", "COMPLETED", "PROCESSING_RESULTS"].includes(phase)
    )
      return;
    timer.current = setInterval(() => {
      Sec((s) => Math.max(0, s - 1));
      if (secondsRef.current <= 61 && phaseRef.current !== "CLOSING") {
        P("CLOSING");
        phaseRef.current = "CLOSING";
        if (next.current) clearTimeout(next.current);
        const closing =
          "We are entering the closing round. Please share one concise final thought.";
        add("Moderator", "moderator", closing, "moderator");
        say("Moderator", closing);
        if (timer.current) clearInterval(timer.current);
      }
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [screen, phase, P, add, say]);
  function schedule(isDemo = demo) {
    if (next.current) clearTimeout(next.current);
    if (
      ["PAUSED", "COMPLETED", "PROCESSING_RESULTS"].includes(phaseRef.current)
    )
      return;
    next.current = setTimeout(
      async () => {
        if (Date.now() - lastAi.current < cfg.patience * 1000) {
          schedule(isDemo);
          return;
        }
        const roster = panel.slice(0, cfg.count);
        const fallback = buildMockTurn({
          topic: cfg.topic,
          transcript: turnsRef.current.map((turn) => ({
            speaker: turn.speaker,
            text: turn.text,
          })),
          participants: roster.map((person) => ({
            name: person.name,
            personality: person.kind,
          })),
        });
        let p =
          roster.find((person) => person.name === fallback.speaker) ||
          roster[0];
        let text = fallback.text;
        if (!isDemo) {
          try {
            const body = JSON.stringify({
              topic: cfg.topic,
              transcript: turnsRef.current
                .slice(-12)
                .map((t) => ({ speaker: t.speaker, text: t.text })),
              participants: roster.map((x) => ({
                name: x.name,
                personality: x.kind,
              })),
              phase: phaseRef.current,
              elapsedSeconds: cfg.duration * 60 - secondsRef.current,
              language: cfg.language,
              difficulty: cfg.difficulty,
              format: cfg.format,
            });
            let response: Response | undefined;
            for (let attempt = 0; attempt < 2; attempt++) {
              try {
                response = await fetch("/api/director", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body,
                  signal: AbortSignal.timeout(20000),
                });
                if (response.ok) break;
                if (attempt === 0 && [502, 503].includes(response.status))
                  continue;
                throw Error("AI service unavailable");
              } catch {
                throw Error("AI request failed");
              }
            }
            if (!response?.ok) throw Error("AI service unavailable");
            const data = await response.json();
            text = data.text;
            p = roster.find((x) => x.name === data.speaker) || p;
          } catch {
            const retryFallback = buildMockTurn({
              topic: cfg.topic,
              transcript: turnsRef.current.map((turn) => ({
                speaker: turn.speaker,
                text: turn.text,
              })),
              participants: roster.map((person) => ({
                name: person.name,
                personality: person.kind,
              })),
            });
            text = retryFallback.text;
            p =
              roster.find((person) => person.name === retryFallback.speaker) ||
              p;
            N(
              "AI connection unavailable. The panel is responding to your latest point in practice mode. Check your API settings for live AI.",
            );
          }
        }
        if (
          ["PAUSED", "COMPLETED", "PROCESSING_RESULTS"].includes(
            phaseRef.current,
          )
        )
          return;
        add(p.name, "ai", text, "ai");
        say(p.name, text);
        lastAi.current = Date.now();
        if (secondsRef.current > 0 && phaseRef.current !== "CLOSING")
          schedule(isDemo);
      },
      cfg.patience * 1000 + 2100,
    );
  }
  function start(isDemo: boolean) {
    D(isDemo);
    T([]);
    turnsRef.current = [];
    Sec(cfg.duration * 60);
    S("room");
    P("OPENING");
    phaseRef.current = "OPENING";
    N("");
    const text =
      "Welcome to the group discussion. Today we are discussing: " +
      cfg.topic +
      " Please keep points concise, build on one another, and make space for every voice.";
    add("Moderator", "moderator", text, "moderator");
    say("Moderator", text);
    setTimeout(() => P((p) => (p === "OPENING" ? "DISCUSSION" : p)), 2200);
    schedule(isDemo);
  }
  function submit(method: "typed" | "speech" = "typed", raw = input) {
    const text = raw.trim();
    if (!text || phase === "PAUSED") return;
    if (wc(text) > 180) {
      N("Keep each contribution under 180 words so everyone gets a turn.");
      return;
    }
    speechSynthesis?.cancel();
    Sp("");
    add("You", "student", text, method);
    I("");
    lastAi.current = Date.now();
    if (phase === "OPENING") P("DISCUSSION");
    schedule(demo);
  }
  function mic() {
    if (listening) {
      recognition.current?.stop();
      L(false);
      return;
    }
    if (speaking) {
      speechSynthesis?.cancel();
      Sp("");
      const last = [...turnsRef.current].reverse().find((t) => t.role === "ai");
      if (last) {
        const updated = turnsRef.current.map((t) =>
          t.id === last.id ? { ...t, interrupted: true } : t,
        );
        turnsRef.current = updated;
        T(updated);
      }
    }
    const w = window as Window & {
        SpeechRecognition?: new () => SpeechRec;
        webkitSpeechRecognition?: new () => SpeechRec;
      },
      Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Rec) {
      N("Speech recognition is unavailable here. Type your response instead.");
      return;
    }
    const r = new Rec();
    recognition.current = r;
    r.continuous = false;
    r.interimResults = true;
    r.lang = "en-IN";
    r.onresult = (e) => {
      let f = "",
        i = "";
      for (let n = 0; n < e.results.length; n++) {
        if (e.results[n].isFinal) f += e.results[n][0].transcript;
        else i += e.results[n][0].transcript;
      }
      if (i) I(i);
      if (f.trim()) submit("speech", f);
    };
    r.onerror = () => {
      N("Microphone unavailable or denied. Continue by typing.");
      L(false);
    };
    r.onend = () => L(false);
    try {
      r.start();
      L(true);
    } catch {
      N("Could not start speech recognition. Type your response.");
    }
  }
  async function testMic() {
    if (!navigator.mediaDevices?.getUserMedia) {
      N(
        "Microphone testing is unavailable in this browser. You can still type.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      N("Microphone access is ready. No audio was recorded or stored.");
    } catch {
      N("Microphone permission was denied. You can continue with typed input.");
    }
  }
  function pause() {
    if (phase === "PAUSED") {
      P("DISCUSSION");
      schedule(demo);
    } else {
      P("PAUSED");
      if (next.current) clearTimeout(next.current);
      speechSynthesis?.cancel();
      Sp("");
    }
  }
  function finish() {
    if (!turnsRef.current.some((t) => t.role === "student")) {
      N("Add at least one spoken or typed response before finishing.");
      return;
    }
    recognition.current?.stop();
    L(false);
    P("PROCESSING_RESULTS");
    if (next.current) clearTimeout(next.current);
    if (timer.current) clearInterval(timer.current);
    speechSynthesis?.cancel();
    setTimeout(() => {
      P("COMPLETED");
      S("report");
      const mode: SessionMode = demo ? "demo" : liveEnabled ? "live" : "mock";
      SetReportMode(mode);
      const u = turnsRef.current
          .filter((t) => t.role === "student")
          .reduce((n, t) => n + wc(t.text), 0),
        all = turnsRef.current.reduce((n, t) => n + wc(t.text), 0),
        share = all ? Math.round((u / all) * 100) : 0,
        x: Saved = {
          id: uid(),
          topic: cfg.topic,
          date: new Date().toISOString(),
          duration: Math.round((cfg.duration * 60 - seconds) / 60),
          score: Math.min(
            95,
            Math.max(
              48,
              58 +
                turnsRef.current.filter((t) => t.role === "student").length *
                  6 +
                Math.min(12, share),
            ),
          ),
          transcript: turnsRef.current,
          share,
          mode,
        };
      H((old) => {
        const n = [x, ...old].slice(0, 30);
        localStorage.setItem("gdarena-history", JSON.stringify(n));
        return n;
      });
    }, 250);
  }
  const rubric = buildRubric(turns);
  const own = turns.filter((t) => t.role === "student"),
    ownWords = own.reduce((n, t) => n + wc(t.text), 0),
    total = turns.reduce((n, t) => n + wc(t.text), 0),
    share = total ? Math.round((ownWords / total) * 100) : 0,
    score = Math.min(
      95,
      Math.max(48, 58 + own.length * 6 + Math.min(12, share)),
    ),
    visible = useMemo(
      () =>
        filter === "All speakers"
          ? turns
          : turns.filter((t) => t.speaker === filter),
      [filter, turns],
    );
  function exportReport() {
    const body =
        "# GD Arena practice report\n\nTopic: " +
        cfg.topic +
        "\nPractice score: " +
        score +
        "/100\nSession mode: " +
        reportMode.toUpperCase() +
        "\nEstimated speaking share: " +
        share +
        "%\n\n## Transcript\n" +
        turns
          .map(
            (t) => "- " + t.speaker + " (" + t.method + "): “" + t.text + "”",
          )
          .join("\n"),
      a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/markdown" }));
    a.download = "gd-arena-report.md";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => S("home")}>
          <span className="brand-mark">G</span>
          <span>
            GD<span className="brand-light">ARENA</span>
          </span>
        </button>
        <nav>
          <button
            className="nav-link"
            onClick={() => {
              try {
                H(JSON.parse(localStorage.getItem("gdarena-history") || "[]"));
              } catch {
                H([]);
              }
              S("history");
            }}
          >
            Your sessions <span className="nav-count">{history.length}</span>
          </button>
          <span className="ai-pill">● AI practice room</span>
        </nav>
      </header>
      {screen === "home" && (
        <section className="landing">
          <div className="hero-grid">
            <div className="hero-copy">
              <div className="eyebrow">—　PLACEMENT PRACTICE, REIMAGINED</div>
              <h1>
                Walk into your next
                <br />
                GD <span>ready.</span>
              </h1>
              <p className="hero-lede">
                A real-feeling group discussion room, whenever you are. Find
                your voice, sharpen your thinking, and get better with every
                round.
              </p>
              <div className="hero-actions">
                <button className="button-primary" onClick={() => S("setup")}>
                  Start a practice GD　↗
                </button>
                <button className="button-demo" onClick={() => start(true)}>
                  ▶　Start demo <small>NO SETUP NEEDED</small>
                </button>
              </div>
              <div className="trust-note">
                ✳ Your panel and moderator are AI. Transcript history stays in
                this browser.
              </div>
            </div>
            <div className="hero-art">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="arena-core">
                <div className="sound-bars">▮ ▮ ▮ ▮ ▮</div>
                <span>
                  YOUR
                  <br />
                  NEXT
                  <br />
                  <b>ROUND</b>
                </span>
                <small>ROOM 01 · OPEN</small>
              </div>
              <div className="float-card fc-top">
                ◉　Aarav <small>Data-led · Speaking</small>
              </div>
              <div className="float-card fc-bottom">
                ◉　Riya <small>Collaborative · Listening</small>
              </div>
              <div className="hero-caption">
                THREE DISTINCT PERSPECTIVES. ONE BETTER YOU.
              </div>
            </div>
          </div>
          <div className="feature-row">
            <article>
              <b>◉　Say it out loud</b>
              <p>Voice practice with live captions. Typing works too.</p>
            </article>
            <article>
              <b>↗　A room that listens</b>
              <p>Different AI personalities build a real conversation.</p>
            </article>
            <article>
              <b>⌁　Feedback with receipts</b>
              <p>Review your actual words after a round.</p>
            </article>
          </div>
          <div className="topic-strip">
            <span>TRY A QUESTION</span>
            {topics.slice(0, 4).map((t) => (
              <span className="topic-chip" key={t}>
                {t}
              </span>
            ))}
          </div>
          <div className="privacy-strip">
            🔒　<b>GD Arena does not store raw audio.</b> Browser speech
            recognition may be processed by your browser provider. Live AI mode
            sends transcript text to your configured provider.
          </div>
        </section>
      )}
      {screen === "setup" && (
        <section className="setup-page">
          <button className="back-link" onClick={() => S("home")}>
            ← Back
          </button>
          <div className="page-heading">
            <div className="eyebrow">—　BUILD YOUR ROOM</div>
            <h1>Set the stage.</h1>
            <p>Choose the topic and challenge you want today.</p>
          </div>
          <div className="setup-grid">
            <div className="setup-main">
              <div className="form-card">
                <label className="field-label" htmlFor="topic">
                  Discussion topic
                </label>
                <select
                  id="topic"
                  value={
                    topics.includes(cfg.topic) ? cfg.topic : "Custom topic"
                  }
                  onChange={(e) =>
                    C({
                      ...cfg,
                      topic:
                        e.target.value === "Custom topic" ? "" : e.target.value,
                    })
                  }
                >
                  {topics.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                  {!topics.includes(cfg.topic) && <option>Custom topic</option>}
                </select>
                <label className="field-label spaced" htmlFor="custom">
                  Or bring your own
                </label>
                <input
                  id="custom"
                  maxLength={140}
                  placeholder="Type a topic you care about…"
                  value={topics.includes(cfg.topic) ? "" : cfg.topic}
                  onChange={(e) => C({ ...cfg, topic: e.target.value })}
                />
                <div className="field-row">
                  <div>
                    <span className="field-label">AI participants</span>
                    <div className="segmented">
                      {[3, 4, 5].map((n) => (
                        <button
                          key={n}
                          className={cfg.count === n ? "selected" : ""}
                          onClick={() => C({ ...cfg, count: n })}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="duration">
                      Duration
                    </label>
                    <select
                      id="duration"
                      value={cfg.duration}
                      onChange={(e) => C({ ...cfg, duration: +e.target.value })}
                    >
                      <option value={5}>5 minutes</option>
                      <option value={8}>8 minutes</option>
                      <option value={10}>10 minutes</option>
                    </select>
                  </div>
                </div>
                <div className="field-row">
                  <div>
                    <label className="field-label" htmlFor="difficulty">
                      Difficulty
                    </label>
                    <select
                      id="difficulty"
                      value={cfg.difficulty}
                      onChange={(e) =>
                        C({ ...cfg, difficulty: e.target.value })
                      }
                    >
                      <option>Beginner</option>
                      <option>Intermediate</option>
                      <option>Advanced</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="format">
                      Format
                    </label>
                    <select
                      id="format"
                      value={cfg.format}
                      onChange={(e) => C({ ...cfg, format: e.target.value })}
                    >
                      <option>Standard GD</option>
                      <option>Case-based</option>
                      <option>Abstract</option>
                      <option>Debate</option>
                    </select>
                  </div>
                </div>{" "}
                <div className="field-row">
                  <div>
                    <label className="field-label" htmlFor="language">
                      Language
                    </label>
                    <select
                      id="language"
                      value={cfg.language}
                      onChange={(e) => C({ ...cfg, language: e.target.value })}
                    >
                      <option>English</option>
                      <option>Hinglish</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="patience">
                      AI pause · {cfg.patience.toFixed(1)}s
                    </label>
                    <input
                      id="patience"
                      type="range"
                      min="0.6"
                      max="3"
                      step="0.2"
                      value={cfg.patience}
                      onChange={(e) => C({ ...cfg, patience: +e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="voice-setting">
                <div>
                  <b>Spoken AI responses</b>
                  <small>
                    Your panel speaks when browser voices are available.
                  </small>
                </div>
                <button
                  className={"toggle " + (cfg.voice ? "on" : "")}
                  aria-pressed={cfg.voice}
                  onClick={() => C({ ...cfg, voice: !cfg.voice })}
                >
                  <i />
                </button>
              </div>
              <div className="mic-test">
                <span>
                  <b>Mic is optional</b>
                  <small>
                    Chrome or Edge recommended. Typing always works.
                  </small>
                </span>
                <button onClick={testMic}>Test mic</button>
              </div>
            </div>
            <aside className="panel-card">
              <div className="panel-head">
                YOUR PANEL <span>● READY</span>
              </div>
              {panel.slice(0, cfg.count).map((p, i) => (
                <div className="person-row" key={p.name}>
                  <span
                    className="avatar"
                    style={{ color: p.color, borderColor: p.color + "55" }}
                  >
                    {p.name[0]}
                  </span>
                  <div>
                    <b>{p.name}</b>
                    <small>{p.kind}</small>
                  </div>
                  <em>0{i + 1}</em>
                </div>
              ))}
              <div className="moderator-row">
                <b>✳　Moderator</b>
                <small>AI · keeps room moving</small>
              </div>
              <div className="ai-disclosure">
                Every panel participant and moderator are AI.
              </div>
              <button
                className="button-primary setup-start"
                onClick={() =>
                  cfg.topic.trim().length < 5
                    ? N("Choose a topic with at least five characters.")
                    : start(false)
                }
              >
                Enter the room　↗
              </button>
              <button className="mock-hint" onClick={() => start(true)}>
                Try demo mode instead →
              </button>
              <div className="mode-badge">
                {liveEnabled
                  ? "LIVE AI · transcript sent to provider"
                  : "DEMO / MOCK · simulated panel"}
              </div>
            </aside>
          </div>
          {notice && <p className="notice">{notice}</p>}
        </section>
      )}
      {screen === "room" && (
        <section className="room-page">
          <div className="room-topline">
            <span className="live-badge">
              ●{" "}
              {demo ? "DEMO SESSION" : liveEnabled ? "LIVE AI" : "MOCK SESSION"}
            </span>
            <b>{cfg.topic}</b>
            <button
              onClick={() => {
                S("home");
                P("SETUP");
                speechSynthesis?.cancel();
              }}
            >
              Exit room ×
            </button>
          </div>
          {!demo && liveEnabled && (
            <div className="privacy-banner">
              Transcript text is sent to your configured AI provider. Mic audio
              stays in your browser.
            </div>
          )}
          <div className="room-heading">
            <div>
              <div className="eyebrow">
                —　
                {phase === "OPENING"
                  ? "MODERATOR OPENING"
                  : phase === "CLOSING"
                    ? "CLOSING ROUND"
                    : phase === "PAUSED"
                      ? "SESSION PAUSED"
                      : "DISCUSSION IN PROGRESS"}
              </div>
              <h1>
                {phase === "OPENING"
                  ? "Welcome to the room."
                  : phase === "CLOSING"
                    ? "Bring it home."
                    : phase === "PAUSED"
                      ? "Take your time."
                      : "Your floor."}
              </h1>
            </div>
            <div className="timer-card">
              <small>TIME REMAINING</small>
              <b>{clock(seconds)}</b>
              <span>
                {phase === "CLOSING" ? "CLOSING ROUND" : "DISCUSSION"}
              </span>
            </div>
          </div>
          <div className="progress-track">
            <i
              style={{
                width:
                  Math.min(
                    100,
                    ((cfg.duration * 60 - seconds) / (cfg.duration * 60)) * 100,
                  ) + "%",
              }}
            />
          </div>
          <div className="room-layout">
            <div className="room-main">
              <div className="panel-stage">
                <div className="stage-label">
                  THE PANEL · {cfg.count} AI PARTICIPANTS
                </div>
                <div className="stage-people">
                  {panel.slice(0, cfg.count).map((p) => (
                    <article
                      className={speaking === p.name ? "is-speaking" : ""}
                      key={p.name}
                    >
                      <span
                        className="stage-avatar"
                        style={{ color: p.color, borderColor: p.color }}
                      >
                        {p.name[0]}
                      </span>
                      <b>{p.name}</b>
                      <small>{p.kind}</small>
                      <em>
                        {speaking === p.name ? "♫ Speaking" : "Listening"}
                      </em>
                    </article>
                  ))}
                </div>
                <div className="moderator-banner">
                  <b>✳　Moderator · AI</b>
                  <small>
                    {turns.find((t) => t.role === "moderator")?.text}
                  </small>
                </div>
              </div>
              <div className="transcript-card">
                <div className="transcript-header">
                  <b>Live transcript</b>
                  <span>● {turns.length} turns</span>
                  <select
                    aria-label="Filter by speaker"
                    value={filter}
                    onChange={(e) => F(e.target.value)}
                  >
                    <option>All speakers</option>
                    {[
                      "Moderator",
                      "You",
                      ...panel.slice(0, cfg.count).map((p) => p.name),
                    ].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div className="transcript-list" aria-live="polite">
                  {visible.length ? (
                    visible.map((t) => (
                      <article
                        className={t.role === "student" ? "student-line" : ""}
                        key={t.id}
                      >
                        <i />
                        <div>
                          <div>
                            <b>{t.speaker}</b>
                            <time>
                              {new Date(t.at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>
                            {t.role === "student" && (
                              <em>
                                {t.method === "typed" ? "TYPED" : "SPOKEN"}
                              </em>
                            )}
                            {t.interrupted && <em>INTERRUPTED</em>}
                          </div>
                          <p>{t.text}</p>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="transcript-empty">
                      <b>The room is opening</b>
                      <p>Speak or type a thought when it is your turn.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <aside className="control-rail">
              <div className="your-turn-card">
                <small>YOUR PARTICIPATION</small>
                <b>{own.length} turns so far</b>
                <div className="share-track">
                  <i style={{ width: share + "%" }} />
                </div>
                <span>Estimated talk share · {share}%</span>
              </div>
              <div className="talk-card">
                <small>TAKE THE FLOOR</small>
                <button
                  className={"mic-button " + (listening ? "mic-active" : "")}
                  onClick={mic}
                >
                  {listening ? "■　Stop speaking" : "◉　Speak"}
                </button>
                <p>
                  {listening
                    ? "Listening · audio stays in browser"
                    : "Speak or type below"}
                </p>
                <textarea
                  aria-label="Type your contribution"
                  placeholder="Add your thought here…"
                  value={input}
                  onChange={(e) => I(e.target.value)}
                  maxLength={1500}
                />
                <button
                  className="button-primary submit-button"
                  disabled={!input.trim()}
                  onClick={() => submit()}
                >
                  Add to discussion　↗
                </button>
                <button
                  className="text-control"
                  onClick={() => {
                    M(!muted);
                    if (!muted) speechSynthesis?.cancel();
                  }}
                >
                  {muted ? "Unmute AI voices" : "Mute AI voices"}
                </button>
                <button className="text-control" onClick={pause}>
                  {phase === "PAUSED"
                    ? "▶ Resume discussion"
                    : "Ⅱ Pause timer & room"}
                </button>
                <button className="finish-button" onClick={finish}>
                  End session & view report →
                </button>
              </div>
              <div className="room-tip">
                ✦　<b>Build on a point.</b> “I’d like to add to what Riya said…”
              </div>
            </aside>
          </div>
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button onClick={() => N("")}>×</button>
            </div>
          )}
        </section>
      )}
      {screen === "report" && (
        <section className="report-page">
          <button className="back-link" onClick={() => S("history")}>
            ← Your sessions
          </button>
          <div className="page-heading">
            <div className="eyebrow">
              —　PRACTICE COMPLETE · {reportMode.toUpperCase()} TRANSCRIPT
            </div>
            <h1>Good work showing up.</h1>
            <p>
              Feedback based on this discussion. Practice guidance only, not a
              hiring decision.
            </p>
          </div>
          <div className="report-grid">
            <div className="score-card">
              <div
                className="score-ring"
                style={{ "--score": score + "%" } as React.CSSProperties}
              >
                <div>
                  <b>{score}</b>
                  <small>/100</small>
                </div>
              </div>
              <small>OVERALL PRACTICE SCORE</small>
              <b>{cfg.topic}</b>
              <div className="score-rule">
                <b>Transparent rubric</b>
                <p>
                  Score reflects your turn count and estimated word share. It is
                  a practice signal, not a judgment about you.
                </p>
              </div>
            </div>
            <div className="report-details">
              <div className="metrics-card">
                <small>ESTIMATED · WORD COUNTS</small>
                <h3>Speaking share</h3>
                {[
                  "Moderator",
                  ...panel.slice(0, cfg.count).map((p) => p.name),
                  "You",
                ].map((n) => {
                  const w = turns
                      .filter((t) => t.speaker === n)
                      .reduce((a, t) => a + wc(t.text), 0),
                    x = total ? Math.round((w / total) * 100) : 0;
                  return (
                    <div className="share-row" key={n}>
                      <span>{n}</span>
                      <div>
                        <i style={{ width: x + "%" }} />
                      </div>
                      <b>{x}%</b>
                    </div>
                  );
                })}
                <small>Speech recognition does not give audio duration.</small>
              </div>
              <div className="feedback-card">
                <small>EVIDENCE FROM THIS SESSION</small>
                <h3>Keep building on these</h3>
                {own.length ? (
                  <>
                    <blockquote>“{own[0].text}”</blockquote>
                    <p>
                      You took {own.length} turn{own.length === 1 ? "" : "s"}.
                      Try connecting a point directly to something a participant
                      said, then add a concrete example.
                    </p>
                  </>
                ) : (
                  <p>No student turns recorded.</p>
                )}
              </div>
              <div className="feedback-card">
                <small>PRACTICE PROMPT</small>
                <h3>What you could have said</h3>
                <p>
                  Try: <em>“Building on that, one example I’d add is…”</em>
                </p>
                <small>
                  Practice advice, not a quotation from your transcript.
                </small>
              </div>
              <div className="feedback-card">
                <small>NEXT-SESSION PLAN</small>
                <h3>Three small goals for your next round</h3>
                <p>
                  Open with a clear position, build on one participant’s point
                  with an example, and save one sentence to close.
                </p>
              </div>{" "}
              <div className="feedback-card rubric-card">
                <small>CODE-COMPUTED RUBRIC · TRANSCRIPT EVIDENCE</small>
                <h3>Discussion criteria</h3>
                {rubric.map((r) => {
                  const evidence = turns.find(
                    (t) => t.id === r.supportingTurnIds[0],
                  );
                  return (
                    <article className="rubric-item" key={r.criterion}>
                      <div>
                        <b>{r.criterion}</b>
                        <span>
                          {typeof r.score === "number"
                            ? r.score + " / 5"
                            : r.score}
                        </span>
                      </div>
                      <p>{r.explanation}</p>
                      {evidence && (
                        <button
                          onClick={() => {
                            Focus(evidence.id);
                            document
                              .getElementById("moment-" + evidence.id)
                              ?.scrollIntoView({
                                behavior: "smooth",
                                block: "center",
                              });
                          }}
                        >
                          View evidence · {evidence.speaker} ↗
                        </button>
                      )}
                      <small>Next step: {r.nextStep}</small>
                    </article>
                  );
                })}
              </div>
              <div className="feedback-card">
                <div className="transcript-header">
                  <b>Session transcript</b>
                  <select
                    aria-label="Filter report transcript by speaker"
                    value={filter}
                    onChange={(e) => F(e.target.value)}
                  >
                    <option>All speakers</option>
                    {[
                      "Moderator",
                      "You",
                      ...panel.slice(0, cfg.count).map((p) => p.name),
                    ].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div className="report-transcript">
                  {visible.map((t) => (
                    <article
                      id={"moment-" + t.id}
                      className={focusTurn === t.id ? "focused-moment" : ""}
                      key={t.id}
                    >
                      <b>{t.speaker}</b>
                      <small>
                        {new Date(t.at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · {t.method}
                      </small>
                      <p>{t.text}</p>
                    </article>
                  ))}
                </div>
              </div>
              <div className="report-actions">
                <button className="button-primary" onClick={() => S("setup")}>
                  Practise again ↗
                </button>
                <button className="secondary" onClick={exportReport}>
                  Export Markdown ↓
                </button>
                <button className="secondary" onClick={() => S("history")}>
                  History
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
      {screen === "history" && (
        <section className="history-page">
          <button className="back-link" onClick={() => S("home")}>
            ← Home
          </button>
          <div className="page-heading">
            <div className="eyebrow">—　YOUR PROGRESS, YOUR DEVICE</div>
            <h1>Every round counts.</h1>
            <p>
              Your history stays in this browser. Delete it whenever you like.
            </p>
          </div>
          <div className="history-tools">
            {history.length} SAVED SESSIONS{" "}
            <button
              disabled={!history.length}
              onClick={() => {
                if (
                  confirm("Delete all saved session history from this browser?")
                ) {
                  localStorage.removeItem("gdarena-history");
                  H([]);
                }
              }}
            >
              Delete history
            </button>
          </div>
          {!history.length ? (
            <div className="empty-history">
              <h3>Your first round starts here.</h3>
              <p>Finish a GD and we’ll save your report here.</p>
              <button className="button-primary" onClick={() => S("setup")}>
                Build your room ↗
              </button>
            </div>
          ) : (
            history.map((h) => (
              <article className="history-item" key={h.id}>
                <span>{new Date(h.date).toLocaleDateString()}</span>
                <div>
                  <b>{h.topic}</b>
                  <small>
                    {h.transcript.length} turns · {h.duration} min · {h.share}%
                    estimated share
                  </small>
                </div>
                <b>{h.score}</b>
                <button
                  onClick={() => {
                    C({ ...initial, topic: h.topic });
                    SetReportMode(h.mode || "mock");
                    D(h.mode === "demo");
                    T(h.transcript);
                    turnsRef.current = h.transcript;
                    S("report");
                  }}
                >
                  Open report →
                </button>
                <button
                  aria-label="Delete session"
                  onClick={() => {
                    const n = history.filter((x) => x.id !== h.id);
                    H(n);
                    localStorage.setItem("gdarena-history", JSON.stringify(n));
                  }}
                >
                  ×
                </button>
              </article>
            ))
          )}
        </section>
      )}
      <footer>
        GD<span className="brand-light">ARENA</span>　·　PRACTICE THE
        CONVERSATION.{" "}
        <span>
          AI participants · Browser-local history · No raw audio stored
        </span>
      </footer>
    </main>
  );
}
