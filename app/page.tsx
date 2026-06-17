"use client";

import { useEffect, useMemo, useState } from "react";
import type { AuditResult, CategoryReport, Checklist, Finding, Rag } from "@/lib/audit";

const NAVY = "#00264D";
const TEAL = "#54BDB8";
const MINT = "#A6FAE8";
const ORANGE = "#F09600";
const RED = "#EF4444";

type Stage = "hero" | "loading" | "gate" | "report";

const CHECKLIST_QUESTIONS: { key: keyof Checklist; label: string; help: string }[] = [
  { key: "hasPrivatePage", label: "Do you clearly state that you accept privately funded clients?", help: "Self-funders often look for this before anything else." },
  { key: "pricingVisible", label: "Are your prices or a price guide shown anywhere?", help: "Even a 'from £X/hour' builds trust with private payers." },
  { key: "recentPrivateTestimonials", label: "Do you show real reviews or testimonials from families?", help: "Social proof is the single biggest driver of enquiries." },
  { key: "clearCtaAboveFold", label: "Is there an obvious way to enquire on every page?", help: "Phone number, form or chat, visible without scrolling." },
  { key: "publishesCoverageAreas", label: "Have you published the towns or postcodes you cover?", help: "Families search for care in their area. Listing your coverage helps them, and helps local SEO." },
];

function ragFromScore(score: number): Rag {
  if (score >= 75) return "green";
  if (score >= 45) return "amber";
  return "red";
}
function ragInfo(score: number) {
  if (score >= 75) return { key: "green" as const, label: "On track", color: TEAL, navyColor: MINT, soft: "rgba(84,189,184,0.16)" };
  if (score >= 45) return { key: "amber" as const, label: "Needs work", color: ORANGE, navyColor: "#F4B03F", soft: "rgba(240,150,0,0.13)" };
  return { key: "red" as const, label: "Urgent", color: RED, navyColor: "#FF7A7A", soft: "rgba(239,68,68,0.11)" };
}
function findingRag(f: Finding): Rag {
  return f.status;
}
function ragColor(r: Rag) {
  if (r === "green") return TEAL;
  if (r === "amber") return ORANGE;
  return RED;
}
function normUrl(u: string) {
  return (u || "").replace(/^https?:\/\//, "").replace(/\/$/, "") || "your-website.co.uk";
}
function today() {
  const d = new Date();
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/* ============================================================================
   PAGE
   ============================================================================ */
export default function Page() {
  const defaultChecklist: Checklist = {
    hasPrivatePage: false,
    pricingVisible: false,
    recentPrivateTestimonials: false,
    clearCtaAboveFold: false,
    publishesCoverageAreas: false,
  };
  const [stage, setStage] = useState<Stage>("hero");
  const [url, setUrl] = useState("");
  const [checklist, setChecklist] = useState<Checklist>(defaultChecklist);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [stage]);

  async function runAudit() {
    setError(null);
    setStage("loading");
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, checklist }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStage("hero");
    }
  }

  function reset() {
    setStage("hero");
    setResult(null);
    setError(null);
    setUrl("");
    setChecklist(defaultChecklist);
  }

  if (stage === "hero") {
    // Wrap setUrl so any keystroke clears the previous API error — prevents
    // stacking ("Please enter a valid website address" plus a stale "not a
    // homecare site" message from the prior submit).
    const handleUrlChange = (v: string) => {
      setUrl(v);
      if (error) setError(null);
    };
    return (
      <Hero
        url={url}
        setUrl={handleUrlChange}
        checklist={checklist}
        setChecklist={setChecklist}
        onRun={runAudit}
        error={error}
      />
    );
  }
  if (stage === "loading") {
    return <Loading url={url} ready={!!result} onDone={() => setStage("gate")} />;
  }
  if (stage === "gate" && result) {
    return <LeadGate result={result} onUnlock={() => setStage("report")} onBack={reset} />;
  }
  if (stage === "report" && result) {
    return <Report result={result} onBack={reset} />;
  }
  return null;
}

/* ============================================================================
   Chrome
   ============================================================================ */
function Header({ right }: { right?: React.ReactNode }) {
  return (
    <div
      data-no-print
      style={{
        background: NAVY,
        padding: "15px 5vw",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <img src="/logo-birdie-white.png" alt="Birdie" style={{ height: 23, display: "block" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <span className="hide-sm" style={{ color: "rgba(255,255,255,0.62)", fontSize: 13, fontWeight: 500 }}>
          Free website audit for homecare agencies
        </span>
        {right}
      </div>
    </div>
  );
}
function Footer() {
  return (
    <div
      data-no-print
      style={{
        background: NAVY,
        padding: "22px 5vw",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <img src="/logo-birdie-white.png" alt="Birdie" style={{ height: 20, display: "block" }} />
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, whiteSpace: "nowrap" }}>© 2026 Birdie Care Ltd</span>
      </div>
      <div style={{ display: "flex", gap: 22 }}>
        <a href="#" style={{ color: "rgba(255,255,255,0.7)", fontSize: 12.5, textDecoration: "none" }}>Privacy</a>
        <a href="https://www.birdie.care" style={{ color: "rgba(255,255,255,0.7)", fontSize: 12.5, textDecoration: "none" }}>birdie.care</a>
      </div>
    </div>
  );
}

/* ============================================================================
   Icons (outlined, 1.75 stroke)
   ============================================================================ */
const PATHS: Record<string, string[]> = {
  check: ["M20 6 9 17l-5-5"],
  "chevron-down": ["m6 9 6 6 6-6"],
  globe: [
    "M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0-20 0",
    "M2 12h20",
    "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
  ],
  lock: [
    "M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z",
    "M8 11V7a4 4 0 0 1 8 0v4",
  ],
  "arrow-right": ["M5 12h14", "m12 5 7 7-7 7"],
  download: ["M12 3v12", "m7 10 5 5 5-5", "M5 21h14"],
  bulb: ["M9 18h6", "M10 22h4", "M12 2a7 7 0 0 0-4 12.6c.7.5 1 1.3 1 2.4h6c0-1.1.3-1.9 1-2.4A7 7 0 0 0 12 2z"],
  flag: ["M4 21V4", "M4 4h11l-1.5 4L15 12H4"],
  spark: ["M12 3v18", "M3 12h18", "m6 6 12 12", "m18 6-12 12"],
  pound: ["M16 7a4 4 0 0 0-8 0c0 5-1.5 6-3 7h11", "M7 14h6"],
  grid: ["M4 4h7v7H4z", "M13 4h7v7h-7z", "M4 13h7v7H4z", "M13 13h7v7h-7z"],
  shield: ["M12 3 5 6v6c0 4 3 6.5 7 8 4-1.5 7-4 7-8V6z", "m9 12 2 2 4-4"],
  chat: ["M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"],
  phone: ["M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"],
  smartphone: ["M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z", "M11 19h2"],
};

function Icon({
  name,
  size = 24,
  stroke = 1.75,
  color = "currentColor",
}: {
  name: string;
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const d = PATHS[name] || [];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

const CATEGORY_ICONS: Record<string, string> = {
  "private-pay": "pound",
  services: "grid",
  trust: "shield",
  clarity: "chat",
  contact: "phone",
  mobile: "smartphone",
};
function iconForCategory(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("private")) return "pound";
  if (lower.includes("service")) return "grid";
  if (lower.includes("trust")) return "shield";
  if (lower.includes("clarity") || lower.includes("messag")) return "chat";
  if (lower.includes("contact")) return "phone";
  if (lower.includes("mobile") || lower.includes("speed")) return "smartphone";
  return "grid";
}

/* ============================================================================
   Score visualisations
   ============================================================================ */
function ScoreMeter({ score, onDark = false, width = 280 }: { score: number; onDark?: boolean; width?: number }) {
  const r = ragInfo(score);
  const pct = Math.max(0, Math.min(100, score));
  const col = onDark ? r.navyColor : r.color;
  return (
    <div className="bk-meter" style={{ width }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
        <span style={{ fontFamily: "var(--font-hero)", fontWeight: 700, fontSize: 40, lineHeight: 1, color: col }}>{score}</span>
        <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", color: onDark ? "rgba(255,255,255,0.6)" : "#7F92A6" }}>
          / 100 · {r.label}
        </span>
      </div>
      <div className="bk-meter__rail">
        <div className="bk-meter__track">
          <div className="bk-meter__seg" style={{ width: "45%", background: onDark ? "#FF7A7A" : RED }} />
          <div className="bk-meter__seg" style={{ width: "30%", background: ORANGE }} />
          <div className="bk-meter__seg" style={{ width: "25%", background: onDark ? MINT : TEAL }} />
        </div>
        <div className="bk-meter__pin" style={{ left: `${pct}%`, background: onDark ? "#fff" : NAVY }} />
      </div>
      <div className="bk-meter__labels" style={{ color: onDark ? "rgba(255,255,255,0.5)" : undefined }}>
        <span>Urgent</span>
        <span>Needs work</span>
        <span>On track</span>
      </div>
    </div>
  );
}
function StatusPill({ score, onDark = false }: { score: number; onDark?: boolean }) {
  const r = ragInfo(score);
  const c = onDark ? r.navyColor : r.color;
  return (
    <span className="bk-status-pill" style={{ background: onDark ? "rgba(255,255,255,0.1)" : r.soft, color: onDark ? c : r.color }}>
      <span className="bk-dot" style={{ width: 8, height: 8, background: c }} />
      {r.label}
    </span>
  );
}

/* ============================================================================
   1 · HERO (variant B: centred, light)
   ============================================================================ */
function Hero({
  url,
  setUrl,
  checklist,
  setChecklist,
  onRun,
  error,
}: {
  url: string;
  setUrl: (v: string) => void;
  checklist: Checklist;
  setChecklist: (c: Checklist) => void;
  onRun: () => void;
  error: string | null;
}) {
  const [touched, setTouched] = useState(false);
  const valid = normUrl(url).includes(".");
  // When the URL changes (user typing), clear the format-error display so the
  // old red text disappears the moment they start correcting it.
  useEffect(() => {
    setTouched(false);
  }, [url]);
  return (
    <div className="bk stage-in" style={{ minHeight: "100vh", background: "var(--audit-bg)" }}>
      <Header />
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 64px", textAlign: "center" }}>
        <img
          src="/cal-flying-above.png"
          alt=""
          className="bk-bob"
          style={{ width: 104, display: "block", margin: "0 auto 14px" }}
        />
        <div className="bk-eyebrow bk-eyebrow--teal" style={{ marginBottom: 14 }}>
          For UK homecare agency owners
        </div>
        {/* (Eyebrow renders in sentence case — Birdie brand rule, no uppercase.) */}
        <h1
          style={{
            fontSize: "clamp(34px, 6vw, 48px)",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            margin: "0 0 16px",
            fontWeight: 700,
          }}
        >
          Is your website <span style={{ color: ORANGE }}>actually winning</span> private clients?
        </h1>
        <p
          style={{
            fontSize: 17,
            lineHeight: 1.55,
            color: "var(--birdie-navy-75)",
            maxWidth: 520,
            margin: "0 auto 28px",
          }}
        >
          A free 60-second audit of the 6 things self-funding families look for, with a clear list of what to fix first.
        </p>
        <div className="bk-card" style={{ padding: 28, textAlign: "left" }}>
          <label className="bk-label">Your website address</label>
          <div className="bk-field-wrap">
            <span className="bk-globe"><Icon name="globe" size={18} stroke={1.6} /></span>
            <input
              className="bk-field"
              style={{ paddingLeft: 42 }}
              value={url}
              spellCheck={false}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="oakwoodhomecare.co.uk"
            />
          </div>
          {touched && !valid && (
            <div style={{ color: RED, fontSize: 12.5, marginTop: 7 }}>Please enter a valid website address.</div>
          )}
          {error && (
            <div
              style={{
                background: "rgba(239,68,68,0.08)",
                color: RED,
                border: "1px solid rgba(239,68,68,0.25)",
                padding: "10px 14px",
                borderRadius: 10,
                fontSize: 13,
                marginTop: 10,
              }}
            >
              {error}
            </div>
          )}
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--birdie-navy-75)", margin: "22px 0 4px" }}>
            Answer 5 quick questions
          </div>
          {CHECKLIST_QUESTIONS.map((q) => {
            const on = checklist[q.key];
            return (
              <div
                key={q.key}
                className="bk-check"
                data-on={on ? "1" : "0"}
                onClick={() => setChecklist({ ...checklist, [q.key]: !on })}
              >
                <span className="bk-check__box"><Icon name="check" size={14} stroke={3} /></span>
                <div>
                  <div className="bk-check__label">{q.label}</div>
                  <div className="bk-check__help">{q.help}</div>
                </div>
              </div>
            );
          })}
          <button
            className="bk-btn bk-btn--orange bk-btn--lg bk-btn--block"
            style={{ marginTop: 20 }}
            onClick={() => {
              setTouched(true);
              if (valid) onRun();
            }}
          >
            Run my audit
          </button>
          <div style={{ textAlign: "center", fontSize: 12.5, color: "var(--birdie-navy-50)", marginTop: 12 }}>
            No code. Instant results. No card needed.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   2 · LOADING (variant B: navy, progress ring + signal checklist)
   ============================================================================ */
function Loading({ url, ready, onDone }: { url: string; ready: boolean; onDone: () => void }) {
  const [pct, setPct] = useState(0);
  const PAGES = 8;
  useEffect(() => {
    const id = setInterval(() => {
      setPct((p) => {
        const cap = ready ? 100 : 92;
        const step = p < 72 ? 4 : 2.5;
        const next = Math.min(cap, p + step);
        if (next >= 100) {
          clearInterval(id);
          setTimeout(onDone, 700);
        }
        return next;
      });
    }, 70);
    return () => clearInterval(id);
  }, [ready, onDone]);

  const signals = [
    "Private-pay readiness",
    "Services & specialisms",
    "Trust & credibility",
    "Clarity & messaging",
    "Contactability",
    "Mobile & speed",
  ];
  const done = Math.min(signals.length, Math.floor((pct / 100) * signals.length + 0.001));
  const page = Math.min(PAGES, Math.max(1, Math.ceil((pct / 100) * PAGES)));

  return (
    <div
      className="bk stage-in"
      style={{ minHeight: "100vh", background: NAVY, display: "grid", placeItems: "center", padding: 40 }}
    >
      <div style={{ textAlign: "center", width: "min(480px, 90vw)" }}>
        <div
          className="bk-ring"
          style={{
            width: 132,
            height: 132,
            margin: "0 auto",
            background: `conic-gradient(${MINT} ${pct * 3.6}deg, rgba(255,255,255,0.12) 0)`,
            transition: "background .15s linear",
          }}
        >
          <div className="bk-ring__hole" style={{ width: 104, height: 104, background: NAVY }}>
            <div style={{ fontFamily: "var(--font-hero)", fontWeight: 700, fontSize: 30, color: "#fff", lineHeight: 1 }}>
              {Math.round(pct)}%
            </div>
          </div>
        </div>
        <div style={{ fontFamily: "var(--font-hero)", fontWeight: 600, fontSize: 21, color: "#fff", marginTop: 22 }}>
          {pct < 100 ? `Crawling page ${page} of ${PAGES}` : "Building your report"}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
          {normUrl(url)}
        </div>
        <div
          className="bk-card"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "none",
            padding: "8px 22px",
            marginTop: 26,
            textAlign: "left",
          }}
        >
          {signals.map((s, i) => {
            const ok = i < done;
            return (
              <div
                key={s}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "11px 0",
                  borderTop: i ? "1px solid rgba(255,255,255,0.08)" : "none",
                  fontSize: 14,
                  color: ok ? "#fff" : "rgba(255,255,255,0.55)",
                }}
              >
                {ok ? (
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      background: MINT,
                      display: "grid",
                      placeItems: "center",
                      flex: "0 0 auto",
                    }}
                  >
                    <Icon name="check" size={12} stroke={3} color={NAVY} />
                  </span>
                ) : (
                  <span className="bk-tick" style={{ borderColor: "rgba(255,255,255,0.25)", borderTopColor: MINT }} />
                )}
                {s}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   3 · LEAD GATE (variant B: split, value-led)
   ============================================================================ */
function NativeField({
  label,
  ph,
  value,
  onChange,
  err,
  required,
  type = "text",
}: {
  label: string;
  ph: string;
  value: string;
  onChange: (v: string) => void;
  err?: boolean;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="bk-label">
        {label}
        {required && <span style={{ color: ORANGE, marginLeft: 2 }}>*</span>}
      </label>
      <input
        className="bk-field"
        type={type}
        placeholder={ph}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={err ? { borderColor: RED, boxShadow: "0 0 0 3px rgba(239,68,68,0.12)" } : undefined}
      />
    </div>
  );
}

const HUBSPOT_PORTAL_ID = "4789280";
const HUBSPOT_FORM_ID = "3182ee67-ea33-4945-b1be-1da4d67a9980";
// We submit directly to HubSpot's public Forms API rather than using their
// embed scripts. Both forms/embed/<portalId>.js and forms/v2.js now render
// the form inside a cross-origin iframe, which can't be styled from the
// parent page. Submitting via the API lets us build a native form with
// Birdie styling while still sending leads to the same HubSpot form.
const HUBSPOT_SUBMIT_URL = `https://api.hsforms.com/submissions/v3/integration/submit/${HUBSPOT_PORTAL_ID}/${HUBSPOT_FORM_ID}`;

function LeadGate({
  result,
  onUnlock,
  onBack,
}: {
  result: AuditResult;
  onUnlock: () => void;
  onBack: () => void;
}) {
  const weakest = useMemo(
    () => [...result.categories].sort((a, b) => a.score - b.score)[0],
    [result],
  );

  // Count actual actionable fixes (findings with a 'fix' field). The lead-gate
  // teaser used to hardcode "12 specific fixes" — now it reflects reality.
  const fixCount = useMemo(
    () =>
      result.categories.reduce(
        (n, c) => n + c.findings.filter((f) => f.fix).length,
        0,
      ),
    [result],
  );

  const inside: [string, string, string][] = [
    ["flag", "Your weakest category", `Right now that is ${weakest.name.toLowerCase()}.`],
    ["spark", `${fixCount} specific ${fixCount === 1 ? "fix" : "fixes"}`, "Ranked by impact, tagged quick win or dev needed."],
    ["download", "A shareable PDF", "Hand it straight to your web person."],
  ];

  const [f, setF] = useState({ first: "", last: "", email: "", title: "", agency: "", crs: "" });
  const [consent, setConsent] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));
  const emailOk = /.+@.+\..+/.test(f.email);
  // number_of_crs is required by HubSpot. Allow integers only; treat empty/0 as missing.
  const crsNum = Number(f.crs);
  const crsOk = Number.isInteger(crsNum) && crsNum > 0;
  const formOk = f.first.trim() && emailOk && crsOk && consent;

  async function submit() {
    setTouched(true);
    if (!formOk) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(HUBSPOT_SUBMIT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: [
            { name: "firstname", value: f.first },
            { name: "lastname", value: f.last },
            { name: "email", value: f.email },
            { name: "jobtitle", value: f.title },
            { name: "company", value: f.agency },
            { name: "website", value: result.url },
            { name: "number_of_crs", value: String(crsNum) },
          ],
          context: {
            pageUri: window.location.href,
            pageName: document.title,
          },
          // GDPR consent — recorded in HubSpot's legalConsentOptions block.
          // Lawful basis owner should confirm wording / policy version.
          legalConsentOptions: {
            consent: {
              consentToProcess: true,
              text: "I agree to allow Birdie to store and process my personal data so they can contact me about my audit results and Birdie products.",
            },
          },
        }),
      });
      // HubSpot returns 200 with { inlineMessage } on success, or 400 with
      // { errors: [...] } if fields fail validation. We unlock either way
      // if the email looked valid — but show any HubSpot error message.
      if (!res.ok) {
        const data: { message?: string; errors?: { message: string }[] } = await res
          .json()
          .catch(() => ({}));
        const msg = data.errors?.[0]?.message || data.message || "Submission failed. Try again?";
        setErr(msg);
        return;
      }
      onUnlock();
    } catch {
      setErr("Submission failed. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bk stage-in" style={{ minHeight: "100vh", background: "var(--audit-bg)" }}>
      <Header
        right={
          <button
            className="bk-btn bk-btn--ghost"
            style={{ color: "rgba(255,255,255,0.8)" }}
            onClick={onBack}
          >
            ← Start over
          </button>
        }
      />
      <div className="gate-grid" style={{ maxWidth: 1024, margin: "0 auto", padding: "48px 5vw 56px", alignItems: "center" }}>
        <div>
          <div className="bk-card" style={{ padding: "22px 26px", marginBottom: 22 }}>
            <ScoreMeter score={result.overallScore} width={320} />
          </div>
          <h2 style={{ fontSize: 30, fontWeight: 700, margin: "0 0 12px", letterSpacing: "-0.01em", lineHeight: 1.1 }}>
            Your report is ready
          </h2>
          <p style={{ fontSize: 15, color: "var(--birdie-navy-75)", lineHeight: 1.55, margin: "0 0 22px" }}>
            We audited <b style={{ color: NAVY }}>{normUrl(result.url)}</b> across 6 categories. Here's what's in the full report:
          </p>
          {inside.map(([ic, t, d]) => (
            <div key={t} style={{ display: "flex", gap: 13, marginBottom: 15 }}>
              <span
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 11,
                  background: "#fff",
                  boxShadow: "var(--shadow-xs)",
                  display: "grid",
                  placeItems: "center",
                  flex: "0 0 auto",
                }}
              >
                <Icon name={ic} size={19} color={NAVY} stroke={1.8} />
              </span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>{t}</div>
                <div style={{ fontSize: 13, color: "var(--birdie-navy-75)", marginTop: 2, lineHeight: 1.45 }}>{d}</div>
              </div>
            </div>
          ))}
          <img src="/cal-tilt-right.png" alt="" style={{ width: 92, display: "block", marginTop: 8 }} />
        </div>
        <div className="bk-card" style={{ padding: 28 }}>
          <div style={{ fontFamily: "var(--font-hero)", fontWeight: 600, fontSize: 18, marginBottom: 16 }}>
            Unlock your full report
          </div>
          {/* Native form. Fields styled with .bk-field; submission POSTs to
              HubSpot's Forms API so the lead still lands in the same HubSpot
              form ID. This is the only way to keep full styling control —
              HubSpot's embed scripts render inside a cross-origin iframe
              that can't be styled by the parent page. */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <NativeField label="First name" ph="Jane" value={f.first} onChange={set("first")} err={touched && !f.first.trim()} required />
            <NativeField label="Last name" ph="Okafor" value={f.last} onChange={set("last")} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <NativeField label="Work email" ph="jane@oakwoodhomecare.co.uk" type="email" value={f.email} onChange={set("email")} err={touched && !emailOk} required />
          </div>
          <div style={{ marginBottom: 14 }}>
            <NativeField label="Job title" ph="Registered Manager" value={f.title} onChange={set("title")} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <NativeField label="Agency name" ph="Oakwood Home Care" value={f.agency} onChange={set("agency")} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <NativeField
              label="Number of clients you support"
              ph="e.g. 45"
              type="number"
              value={f.crs}
              onChange={set("crs")}
              err={touched && !crsOk}
              required
            />
          </div>
          {/* GDPR consent — explicit, unticked by default. HubSpot lawful-basis
              owner should confirm copy + policy version before launch. */}
          <div
            className="bk-check"
            data-on={consent ? "1" : "0"}
            style={{ cursor: "pointer", padding: "12px 0", borderTop: "1px solid var(--border-soft)" }}
            onClick={() => setConsent((c) => !c)}
            role="checkbox"
            aria-checked={consent}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                setConsent((c) => !c);
              }
            }}
          >
            <span className="bk-check__box"><Icon name="check" size={14} stroke={3} /></span>
            <div className="bk-check__label" style={{ fontWeight: 500, fontSize: 13, lineHeight: 1.45 }}>
              I agree to allow Birdie to store and process my personal data so they can contact me about my audit results and Birdie products.
            </div>
          </div>
          {touched && !consent && (
            <div style={{ color: RED, fontSize: 12.5, marginTop: 4 }}>Please tick the consent box to continue.</div>
          )}
          {err && (
            <div style={{ color: RED, fontSize: 13, marginTop: 10, marginBottom: 4 }} role="alert">{err}</div>
          )}
          <button
            className="bk-btn bk-btn--orange bk-btn--lg bk-btn--block"
            disabled={submitting}
            onClick={submit}
            style={{ marginTop: 14 }}
          >
            {submitting ? "Sending…" : "Show me my results"}
          </button>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontSize: 12.5,
              color: "var(--birdie-navy-50)",
              marginTop: 14,
            }}
          >
            <Icon name="lock" size={13} stroke={1.8} /> We won't spam you. Unsubscribe any time.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   4 · REPORT (variant A: stacked, RAG-meter header)
   ============================================================================ */
function MeterHeader({ result }: { result: AuditResult }) {
  const PAGES = result.pagesCrawled || 8;
  return (
    <div className="audit-navy" style={{ background: NAVY, padding: "40px 5vw 30px" }}>
      <div style={{ maxWidth: 1024, margin: "0 auto" }}>
        <div className="mh-row" style={{ display: "flex", gap: 32, alignItems: "center" }}>
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 14,
              padding: "22px 26px",
              width: 360,
              flex: "0 0 auto",
            }}
          >
            <ScoreMeter score={result.overallScore} onDark width={308} />
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <StatusPill score={result.overallScore} onDark />
            <h2
              style={{
                color: "#fff",
                fontSize: "clamp(24px, 3.2vw, 30px)",
                fontWeight: 700,
                margin: "12px 0 8px",
                letterSpacing: "-0.01em",
                lineHeight: 1.12,
              }}
            >
              {result.headline}
            </h2>
            <p style={{ color: "rgba(255,255,255,0.76)", fontSize: 15, lineHeight: 1.55, margin: 0, maxWidth: 560 }}>
              {result.summary}
            </p>
            <div
              style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: 12.5,
                marginTop: 14,
                fontFamily: "var(--font-mono)",
              }}
            >
              Audited {normUrl(result.url)} · {PAGES} pages crawled · {today()}
            </div>
          </div>
        </div>
        <div
          className="mh-mini"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, minmax(0,1fr))",
            gap: 4,
            marginTop: 26,
            borderTop: "1px solid rgba(255,255,255,0.12)",
            paddingTop: 6,
          }}
        >
          {result.categories.map((c) => (
            <div key={c.key} className="bk-mini">
              <div className="bk-mini__name">{c.name}</div>
              <div className="bk-mini__score" data-rag={ragFromScore(c.score)}>{c.score}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FindingItem({ f }: { f: Finding }) {
  const [open, setOpen] = useState(false);
  const r = findingRag(f);
  const dot = ragColor(r);
  return (
    <div className="bk-finding">
      <div className="bk-finding__head">
        <span className="bk-dot" style={{ background: dot, marginTop: 6 }} />
        <div className="bk-finding__body">
          <div className="bk-finding__top">
            <span className="bk-finding__label">{f.label}</span>
            {f.easyWin && <span className="bk-tag bk-tag--win">Quick win</span>}
            {f.techHelp && <span className="bk-tag bk-tag--dev">Dev needed</span>}
          </div>
          <div className="bk-finding__detail">{f.detail}</div>
          {f.fix && (
            <div className="bk-fix">
              <Icon name="bulb" size={16} stroke={1.8} />
              <div>
                <b style={{ fontWeight: 600 }}>Fix · </b>
                {f.fix}
              </div>
            </div>
          )}
          {f.howTo && (
            <>
              <button
                className="bk-howto-btn"
                data-open={open ? "1" : "0"}
                data-no-print
                onClick={() => setOpen((o) => !o)}
              >
                How to do this <Icon name="chevron-down" size={14} stroke={2.2} />
              </button>
              {open && (
                <div className="bk-howto" data-no-print>
                  <ol>
                    {f.howTo.split(/\n+/).filter(Boolean).map((s, i) => (
                      <li key={i}>{s.replace(/^\d+[\.\)]\s*/, "")}</li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryCardView({ cat }: { cat: CategoryReport }) {
  const r = ragInfo(cat.score);
  return (
    <div className="bk-card" style={{ padding: 26 }}>
      <div className="bk-cat__head">
        <div style={{ display: "flex", gap: 14 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 13,
              background: "var(--birdie-mint-25)",
              display: "grid",
              placeItems: "center",
              flex: "0 0 auto",
            }}
          >
            <Icon name={iconForCategory(cat.name)} size={24} color={NAVY} stroke={1.75} />
          </div>
          <div>
            <div className="bk-cat__name">{cat.name}</div>
            <div className="bk-cat__blurb" style={{ maxWidth: "none" }}>{cat.blurb}</div>
          </div>
        </div>
        <div style={{ textAlign: "right", flex: "0 0 auto" }}>
          <div className="bk-scorebadge" style={{ fontSize: 30, color: r.color }}>{cat.score}</div>
          <StatusPill score={cat.score} />
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        {cat.findings.map((f) => (
          <FindingItem key={f.id} f={f} />
        ))}
      </div>
    </div>
  );
}

function NextStep({ result }: { result: AuditResult }) {
  const weakest = [...result.categories].sort((a, b) => a.score - b.score)[0];
  return (
    <div style={{ background: NAVY, borderRadius: "var(--radius-lg)", padding: 32 }}>
      <div className="bk-eyebrow bk-eyebrow--mint">Your next step</div>
      <h3
        style={{
          color: "#fff",
          fontSize: 26,
          fontWeight: 700,
          margin: "10px 0 22px",
          letterSpacing: "-0.01em",
        }}
      >
        Start with {weakest.name.toLowerCase()}
      </h3>
      <div className="ns-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 14,
            padding: 22,
          }}
        >
          <div style={{ fontFamily: "var(--font-hero)", fontWeight: 600, fontSize: 17, color: "#fff" }}>
            Fix it yourself
          </div>
          <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.7)", lineHeight: 1.5, margin: "8px 0 16px" }}>
            Most fixes in this report are quick wins you can do without a developer. Work down the list, top to bottom.
          </p>
          <button className="bk-btn bk-btn--hollow-w bk-btn--sm" onClick={() => window.print()}>
            Download the checklist
          </button>
        </div>
        <div style={{ background: MINT, borderRadius: 14, padding: 22 }}>
          <div style={{ fontFamily: "var(--font-hero)", fontWeight: 600, fontSize: 17, color: NAVY }}>
            See how Birdie helps
          </div>
          <p style={{ fontSize: 13.5, color: NAVY, opacity: 0.8, lineHeight: 1.5, margin: "8px 0 16px" }}>
            Birdie helps care agencies evidence quality and win more private clients with less admin.
          </p>
          <button
            className="bk-btn bk-btn--navy bk-btn--sm"
            onClick={() => window.open("https://www.birdie.care/private-pay-hub", "_blank")}
          >
            Visit the private-pay hub <Icon name="arrow-right" size={16} stroke={2} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Report({ result, onBack }: { result: AuditResult; onBack: () => void }) {
  return (
    <div className="bk audit-app stage-in" style={{ minHeight: "100vh", background: "var(--audit-bg)" }}>
      <div data-no-print>
        <Header
          right={
            <button className="bk-btn bk-btn--ghost" style={{ color: "rgba(255,255,255,0.8)" }} onClick={onBack}>
              ← Start over
            </button>
          }
        />
      </div>
      <div className="print-only print-head">
        <img src="/logo-birdie-navy.png" alt="Birdie" style={{ height: 18, display: "block" }} />
        <span style={{ fontSize: 10, color: "var(--birdie-navy-75)", fontFamily: "var(--font-mono)" }}>
          Website audit · {normUrl(result.url)} · {today()}
        </span>
      </div>
      <MeterHeader result={result} />
      <div
        style={{
          maxWidth: 1024,
          margin: "0 auto",
          padding: "30px 5vw 48px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {result.categories.map((c) => (
          <div key={c.key} className="report-card">
            <CategoryCardView cat={c} />
          </div>
        ))}
        <div className="report-card">
          <NextStep result={result} />
        </div>
        <div
          className="bk-card"
          data-no-print
          style={{
            padding: 22,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontFamily: "var(--font-hero)", fontWeight: 600, fontSize: 16 }}>Save this report</div>
            <div style={{ fontSize: 13, color: "var(--birdie-navy-75)", marginTop: 3 }}>
              Download a PDF to keep, print or hand to your web person.
            </div>
          </div>
          <button className="bk-btn bk-btn--navy" onClick={() => window.print()}>
            <Icon name="download" size={16} stroke={2} /> Download as PDF
          </button>
        </div>
      </div>
      <Footer />
    </div>
  );
}
