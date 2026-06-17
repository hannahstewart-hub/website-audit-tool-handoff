import * as cheerio from "cheerio";

export type Rag = "red" | "amber" | "green";

export type Finding = {
  id: string;
  label: string;
  status: Rag;
  detail: string;
  fix?: string;
  // easyWin: low-effort change that can be done without a developer
  easyWin?: boolean;
  // techHelp: needs a developer or hosting change
  techHelp?: boolean;
  // howTo: plain-English step-by-step for a non-techy owner
  howTo?: string;
};

export type CategoryReport = {
  key: string;
  name: string;
  blurb: string;
  score: number;
  rag: Rag;
  findings: Finding[];
};

export type Checklist = {
  hasPrivatePage: boolean;
  pricingVisible: boolean;
  recentPrivateTestimonials: boolean;
  clearCtaAboveFold: boolean;
  publishesCoverageAreas: boolean;
};

export type AuditResult = {
  url: string;
  fetchedAt: string;
  pagesCrawled: number;
  pagesSampled: string[];
  overallScore: number;
  overallRag: Rag;
  headline: string;
  summary: string;
  categories: CategoryReport[];
  signals: Record<string, string | number | boolean | null>;
};

const UA =
  "Mozilla/5.0 (compatible; BirdieWebsiteAudit/1.0; +https://birdie.care)";

const MAX_PAGES = 10;
const CONCURRENCY = 3;
const PER_PAGE_TIMEOUT_MS = 9000;

const PRIVATE_KEYWORDS = [
  "private",
  "self-fund",
  "self fund",
  "privately fund",
  "private client",
  "private pay",
];
const PRICING_HINTS = [
  "£",
  "per hour",
  "/hour",
  "hourly rate",
  "from £",
  "starting from",
  "our fees",
  "our prices",
];
const TESTIMONIAL_HINTS = [
  "testimonial",
  "what our families",
  "what our clients",
  "reviews",
  "homecare.co.uk",
  "google reviews",
];
const CQC_HINTS = ["cqc", "care quality commission", "regulated by"];
const UK_POSTCODE_RX = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;
const UK_PHONE_RX = /(?:\+44\s?|0)(?:\d\s?){9,10}/;

const SERVICES: { key: string; label: string; needles: string[] }[] = [
  { key: "personal", label: "Personal care", needles: ["personal care"] },
  { key: "dementia", label: "Dementia / Alzheimer's care", needles: ["dementia", "alzheimer"] },
  { key: "livein", label: "Live-in care", needles: ["live-in care", "live in care", "livein care"] },
  { key: "respite", label: "Respite care", needles: ["respite"] },
  { key: "palliative", label: "Palliative / end-of-life care", needles: ["palliative", "end-of-life", "end of life"] },
  { key: "companionship", label: "Companionship", needles: ["companionship"] },
  { key: "overnight", label: "Overnight / waking-night care", needles: ["overnight", "waking night"] },
  { key: "complex", label: "Complex care", needles: ["complex care"] },
  { key: "domestic", label: "Domestic support / housekeeping", needles: ["housekeeping", "domestic help", "meal preparation"] },
  { key: "medication", label: "Medication support", needles: ["medication support", "medication management"] },
];

type FetchedPage = {
  url: string;
  ok: boolean;
  status: number;
  html: string;
  ms: number;
  $: cheerio.CheerioAPI;
  text: string;
};

function ragFromScore(score: number): Rag {
  if (score >= 75) return "green";
  if (score >= 45) return "amber";
  return "red";
}

function normaliseUrl(input: string): string {
  let u = input.trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

async function fetchOne(url: string): Promise<{
  status: number;
  finalUrl: string;
  html: string;
  ms: number;
}> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), PER_PAGE_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      signal: controller.signal,
    });
    const ct = res.headers.get("content-type") || "";
    const html = ct.includes("text/html") || ct === "" ? await res.text() : "";
    return {
      status: res.status,
      finalUrl: res.url,
      html,
      ms: Date.now() - started,
    };
  } finally {
    clearTimeout(t);
  }
}

async function loadPage(url: string): Promise<FetchedPage | null> {
  try {
    const r = await fetchOne(url);
    if (!r.html) return null;
    const $ = cheerio.load(r.html);
    return {
      url: r.finalUrl,
      ok: r.status >= 200 && r.status < 400,
      status: r.status,
      html: r.html,
      ms: r.ms,
      $,
      text: $("body").text().replace(/\s+/g, " ").trim(),
    };
  } catch {
    return null;
  }
}

// Score a URL path by how likely it is to contain useful audit signals.
function pathPriority(url: string): number {
  const p = url.toLowerCase();
  const keys = [
    "service", "our-service", "care", "private", "self-fund",
    "pric", "fee", "cost", "about", "contact", "area", "coverage",
    "review", "testimonial", "dementia", "live-in", "respite",
    "palliat", "companion", "personal-care", "overnight",
  ];
  let score = 0;
  keys.forEach((k, i) => {
    if (p.includes(k)) score += 100 - i;
  });
  return score;
}

async function crawlSite(startUrl: string): Promise<FetchedPage[]> {
  const home = await loadPage(startUrl);
  if (!home) throw new Error("Couldn't load the homepage");

  const origin = new URL(home.url).origin;
  const seen = new Set<string>([home.url]);
  const candidates = new Set<string>();

  home.$("a[href]").each((_, el) => {
    const href = home.$(el).attr("href");
    if (!href) return;
    try {
      const u = new URL(href, home.url);
      if (u.origin !== origin) return;
      u.hash = "";
      u.search = "";
      const clean = u.toString().replace(/\/$/, "");
      if (/\.(pdf|zip|jpg|jpeg|png|gif|svg|webp|mp4|mp3)$/i.test(clean)) return;
      if (!seen.has(clean)) candidates.add(clean);
    } catch {
      /* ignore bad hrefs */
    }
  });

  const sorted = Array.from(candidates).sort(
    (a, b) => pathPriority(b) - pathPriority(a)
  );
  const toFetch = sorted.slice(0, MAX_PAGES - 1);

  const queue = [...toFetch];
  const others: FetchedPage[] = [];

  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      if (!url) return;
      const page = await loadPage(url);
      if (page && page.ok) others.push(page);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  return [home, ...others];
}

function anyTextHas(pages: FetchedPage[], needles: string[]): boolean {
  const lower = needles.map((n) => n.toLowerCase());
  return pages.some((p) => {
    const t = p.text.toLowerCase();
    return lower.some((n) => t.includes(n));
  });
}

function pagesMatching(
  pages: FetchedPage[],
  needles: string[]
): FetchedPage[] {
  const lower = needles.map((n) => n.toLowerCase());
  return pages.filter((p) => {
    const t = p.text.toLowerCase();
    return lower.some((n) => t.includes(n));
  });
}

function urlsMatching(pages: FetchedPage[], parts: string[]): FetchedPage[] {
  const lower = parts.map((n) => n.toLowerCase());
  return pages.filter((p) => lower.some((n) => p.url.toLowerCase().includes(n)));
}

// Phrases that identify a UK homecare-agency site. We only match these against
// the HOMEPAGE's <title>, <meta description>, and <h1> — i.e. what the site
// says it's about, not what it happens to mention. Aggregating across all body
// text is unreliable because news sites (e.g. bbc.co.uk) and council pages
// mention "homecare", "carer", "personal care" etc. in passing.
const HOMECARE_IDENTITY_TERMS = [
  "homecare",
  "home care",
  "home-care",
  "domiciliary care",
  "live-in care",
  "live in care",
  "respite care",
  "personal care",
  "care at home",
  "care services",
  "care agency",
  "care company",
  "elderly care",
  "dementia care",
  "private care",
  "carer",
];

export class NotHomecareError extends Error {
  constructor() {
    super("This doesn't look like a UK homecare agency website. The audit is built for UK homecare providers — try a site that offers personal care, live-in care, domiciliary care, or similar.");
    this.name = "NotHomecareError";
  }
}

export async function runAudit(
  inputUrl: string,
  checklist: Checklist
): Promise<AuditResult> {
  const startUrl = normaliseUrl(inputUrl);
  const pages = await crawlSite(startUrl);
  const home = pages[0];
  const $ = home.$;

  // Relevance gate — before scoring, confirm this is actually a homecare site.
  // Only inspect homepage identifiers (title / meta description / h1), not body
  // content, so news sites that mention "carer" in passing get refused.
  const homeTitle = ($("title").first().text() || "").toLowerCase();
  const homeDesc = ($('meta[name="description"]').attr("content") || "").toLowerCase();
  const homeH1 = ($("h1").first().text() || "").toLowerCase();
  const identityText = `${homeTitle} ${homeDesc} ${homeH1}`;
  const matchedIdentity = HOMECARE_IDENTITY_TERMS.some((t) => identityText.includes(t));
  if (!matchedIdentity) {
    throw new NotHomecareError();
  }

  // Homepage-scoped signals
  const title = ($("title").first().text() || "").trim();
  const metaDesc = ($('meta[name="description"]').attr("content") || "").trim();
  const h1Count = $("h1").length;
  const firstH1 = ($("h1").first().text() || "").trim();
  const viewport = $('meta[name="viewport"]').attr("content") || "";
  const hasMobileViewport = /width\s*=\s*device-width/i.test(viewport);
  const isHttps = home.url.startsWith("https://");

  // Site-wide signals (aggregated across crawled pages)
  const mentionsPrivate = anyTextHas(pages, PRIVATE_KEYWORDS);
  const pagesWithPricing = pagesMatching(pages, PRICING_HINTS);
  const mentionsPricing = pagesWithPricing.length > 0;
  const mentionsTestimonials = anyTextHas(pages, TESTIMONIAL_HINTS);
  const mentionsCqc = anyTextHas(pages, CQC_HINTS);
  const privateSpecificPages = urlsMatching(pages, [
    "private",
    "self-fund",
    "self-funded",
  ]);

  // Services coverage
  const servicesDetected = SERVICES.filter((s) => anyTextHas(pages, s.needles));
  const servicePages = urlsMatching(pages, [
    "service",
    "care",
    "dementia",
    "live-in",
    "respite",
    "palliat",
    "companion",
    "overnight",
    "personal-care",
  ]);

  // Contact signals — any page on the site
  const hasPhone = pages.some((p) => UK_PHONE_RX.test(p.text));
  const hasPostcode = pages.some((p) => UK_POSTCODE_RX.test(p.text));
  const hasContactForm = pages.some((p) => p.$("form").length > 0);
  const hasMailto = pages.some((p) => p.$('a[href^="mailto:"]').length > 0);
  const hasTelLink = pages.some((p) => p.$('a[href^="tel:"]').length > 0);

  // Image alt coverage — average across pages
  let totalImages = 0;
  let imagesWithAlt = 0;
  for (const p of pages) {
    const imgs = p.$("img");
    totalImages += imgs.length;
    imagesWithAlt += imgs.filter((_, el) => !!p.$(el).attr("alt")?.trim()).length;
  }
  const altCoverage = totalImages ? imagesWithAlt / totalImages : 1;

  // Speed — average + worst
  const msList = pages.map((p) => p.ms);
  const avgMs = Math.round(msList.reduce((s, n) => s + n, 0) / msList.length);
  const worstMs = Math.max(...msList);

  // --- Private-pay readiness ---
  const privateFindings: Finding[] = [];
  privateFindings.push(
    checklist.hasPrivatePage || privateSpecificPages.length > 0
      ? {
          id: "pp-page",
          label: "Dedicated private-client page",
          status: "green",
          detail:
            privateSpecificPages.length > 0
              ? `Found a page targeting private/self-funded families: ${shortUrl(privateSpecificPages[0].url)}`
              : "You confirmed you have one.",
        }
      : {
          id: "pp-page",
          label: "Dedicated private-client page",
          status: "red",
          detail: "No private/self-funded page found across the crawled pages.",
          fix: "Create a page targeted at self-funded families, with different jargon and different concerns from local-authority work.",
          howTo: "In your website's CMS (WordPress, Wix, Squarespace etc.) add a new page. Call it 'Private homecare' or 'Self-funded care'. On it, explain what private care means, who it's for, roughly what it costs, and how to get started. Don't use NHS or council jargon.",
        }
  );
  privateFindings.push(
    mentionsPrivate
      ? {
          id: "pp-copy",
          label: "Private-pay language used on site",
          status: "green",
          detail: "We found words like 'private' or 'self-funded' on the site.",
        }
      : {
          id: "pp-copy",
          label: "Private-pay language used on site",
          status: "red",
          detail: "Site doesn't explicitly speak to private / self-funded clients.",
          fix: "Add a line on the homepage and in service pages addressing self-funded families directly.",
          easyWin: true,
          howTo: "Find your homepage in your CMS and add a short sentence in the intro or hero section, e.g. 'We support families who are arranging and funding their own care.' That's all it takes to start signalling to the right audience.",
        }
  );
  privateFindings.push(
    checklist.pricingVisible && mentionsPricing
      ? {
          id: "pp-price",
          label: "Pricing signal visible",
          status: "green",
          detail: `Pricing or 'from £…' detected on ${pagesWithPricing.length} page${pagesWithPricing.length === 1 ? "" : "s"}.`,
        }
      : mentionsPricing || checklist.pricingVisible
      ? {
          id: "pp-price",
          label: "Pricing signal visible",
          status: "amber",
          detail: "Partial: pricing mentioned somewhere but not clearly anchored.",
          fix: "Show a 'from £X / hour' figure on the private-client page. Private families screen for this first.",
          easyWin: true,
          howTo: "Edit the text on your private-care or services page. Add one line like 'Our homecare starts from £X per hour'. You don't need to give an exact price; a 'from' figure is enough to stop families clicking away.",
        }
      : {
          id: "pp-price",
          label: "Pricing signal visible",
          status: "red",
          detail: "No pricing or 'from £…' found on any crawled page.",
          fix: "Private families abandon sites without pricing. Even a 'from £X' range builds trust.",
          easyWin: true,
          howTo: "Edit the text on your homepage or services page. Add one line like 'Our homecare starts from £X per hour'. You don't need to give an exact price; a 'from' figure is enough to stop families clicking away.",
        }
  );
  const ppScore = scoreFindings(privateFindings);

  // --- Services & specialisms ---
  const serviceFindings: Finding[] = [];
  const servicesCount = servicesDetected.length;
  serviceFindings.push(
    servicesCount >= 5
      ? {
          id: "sv-breadth",
          label: "Breadth of care services listed",
          status: "green",
          detail: `${servicesCount} distinct services detected: ${servicesDetected.map((s) => s.label).join(", ")}.`,
        }
      : servicesCount >= 2
      ? {
          id: "sv-breadth",
          label: "Breadth of care services listed",
          status: "amber",
          detail: `Only ${servicesCount} services detected: ${servicesDetected.map((s) => s.label).join(", ")}.`,
          fix: "Families compare agencies on breadth. List every service you offer: personal care, dementia, live-in, respite, palliative, companionship, overnight.",
          easyWin: true,
          howTo: "Open your services page in your CMS and add a section listing every type of care you provide. You don't need a new page; a simple bullet list with a one-sentence description of each service is enough to get started.",
        }
      : {
          id: "sv-breadth",
          label: "Breadth of care services listed",
          status: "red",
          detail: "Fewer than two recognisable services found across the site.",
          fix: "A private family with a specific need (e.g. dementia care) will skip past you if they can't see it listed. Create a clear 'Our services' section.",
          howTo: "Create a new page or section called 'Our services'. List each type of care as its own heading with a short paragraph. Include: personal care, dementia care, live-in care, respite, and any others you offer.",
        }
  );
  const hasDementia = servicesDetected.some((s) => s.key === "dementia");
  serviceFindings.push(
    hasDementia
      ? {
          id: "sv-dementia",
          label: "Dementia care specifically named",
          status: "green",
          detail: "Dementia / Alzheimer's mentioned on the site.",
        }
      : {
          id: "sv-dementia",
          label: "Dementia care specifically named",
          status: "amber",
          detail: "Dementia / Alzheimer's care isn't explicitly named.",
          fix: "Dementia is one of the highest-intent private-pay searches. Name it on the homepage or a dedicated page, even if it's part of your general personal care.",
          easyWin: true,
          howTo: "Find your services page or homepage in your CMS. Add the word 'dementia' somewhere in the text. Even a line like 'including specialist support for people living with dementia' on your personal care section is enough to start showing up in those searches.",
        }
  );
  serviceFindings.push(
    servicePages.length >= 2
      ? {
          id: "sv-depth",
          label: "Dedicated service pages",
          status: "green",
          detail: `${servicePages.length} pages with service-focused URLs.`,
        }
      : servicePages.length === 1
      ? {
          id: "sv-depth",
          label: "Dedicated service pages",
          status: "amber",
          detail: "One service-focused page found. A single 'Services' page is fine, but individual pages per service convert better.",
          fix: "Split services into their own pages: each one ranks separately in Google and answers a specific family's question.",
          howTo: "In your CMS, create a new page for each of your main services (e.g. 'Dementia care', 'Live-in care'). Copy the relevant section from your existing services page as a starting point. Ask your web developer to link them from a services menu if you're not sure how.",
          techHelp: true,
        }
      : {
          id: "sv-depth",
          label: "Dedicated service pages",
          status: "red",
          detail: "No dedicated service pages detected from URL structure.",
          fix: "Create one page per core service. 'Dementia care in [town]' outranks a generic 'Services' page every time.",
          howTo: "This one is worth asking a web developer to help with. They can create the page structure and set up the URLs correctly. Brief them: one page per service, with the service name and your town in the page title.",
          techHelp: true,
        }
  );
  const svScore = scoreFindings(serviceFindings);

  // --- Trust & credibility ---
  const trustFindings: Finding[] = [];
  trustFindings.push(
    mentionsCqc
      ? {
          id: "tr-cqc",
          label: "CQC rating / regulator mentioned",
          status: "green",
          detail: "We found CQC references on the site.",
        }
      : {
          id: "tr-cqc",
          label: "CQC rating / regulator mentioned",
          status: "red",
          detail: "No CQC reference found.",
          fix: "A 'Good' or 'Outstanding' CQC badge is the single biggest trust signal for private families. Add it to the header or hero.",
          easyWin: true,
          howTo: "Go to the CQC website (cqc.org.uk), find your organisation's inspection page, and copy the rating badge code they provide. Paste it into your website's header or homepage. If you're not sure how, show your web developer the CQC page. They can add the badge in 10 minutes.",
        }
  );
  trustFindings.push(
    checklist.recentPrivateTestimonials
      ? {
          id: "tr-testimonials",
          label: "Recent private-client testimonials",
          status: "green",
          detail: "You confirmed you have them.",
        }
      : mentionsTestimonials
      ? {
          id: "tr-testimonials",
          label: "Recent private-client testimonials",
          status: "amber",
          detail: "Testimonials exist but you told us they aren't recent/private.",
          fix: "Refresh with 3-5 quotes from families you've worked with in the last 12 months.",
          howTo: "Email or call 3-5 families you've supported privately in the last year. Ask if they'd share a short quote about their experience. Once you have them, add them to your website as a simple quote block; your CMS will have a testimonial or quote element you can drop in.",
        }
      : {
          id: "tr-testimonials",
          label: "Recent private-client testimonials",
          status: "red",
          detail: "No testimonials or reviews visible on the site.",
          fix: "Private families trust peer stories more than anything. Add a review strip from homecare.co.uk or Google.",
          howTo: "Two options: (1) Ask 3 families for a short quote by email, then paste them into your homepage using a quote or testimonial block in your CMS. (2) If you have Google or homecare.co.uk reviews, your web developer can embed a live review widget in an hour.",
        }
  );
  trustFindings.push(
    isHttps
      ? {
          id: "tr-https",
          label: "Secure (HTTPS)",
          status: "green",
          detail: "Site served over HTTPS.",
        }
      : {
          id: "tr-https",
          label: "Secure (HTTPS)",
          status: "red",
          detail: "Site is not HTTPS.",
          fix: "Browsers will flag the site as 'not secure'. Ask your host to enable SSL (usually free via Let's Encrypt).",
          techHelp: true,
          howTo: "Log in to your website hosting account (GoDaddy, 123-reg, SiteGround etc.) and look for 'SSL certificate' or 'HTTPS' in the settings. Most hosts provide free SSL, and there's usually a one-click enable button. If you can't find it, contact your host's support chat and say 'I need to enable HTTPS on my domain'.",
        }
  );
  const trScore = scoreFindings(trustFindings);

  // --- Clarity & messaging ---
  const clarityFindings: Finding[] = [];
  clarityFindings.push(
    title && title.length >= 15 && title.length <= 65
      ? {
          id: "cl-title",
          label: "Homepage title clear",
          status: "green",
          detail: `Title: "${title}"`,
        }
      : title
      ? {
          id: "cl-title",
          label: "Homepage title clear",
          status: "amber",
          detail: `Title length ${title.length} chars, aim for 15-65.`,
          fix: "Rewrite to lead with outcome: e.g. 'Trusted homecare in [Town] for families who want to stay at home'.",
          easyWin: true,
          howTo: "In your CMS, go to your homepage settings and look for 'SEO title', 'Page title' or 'Meta title'. Rewrite it to something like 'Homecare in [Your Town] | [Agency Name]'. Keep it under 65 characters. In WordPress this is often in the Yoast or Rank Math SEO plugin.",
        }
      : {
          id: "cl-title",
          label: "Homepage title clear",
          status: "red",
          detail: "No page title found.",
          fix: "Add a descriptive <title>: it's the first thing shown in Google and tabs.",
          easyWin: true,
          howTo: "In your CMS, go to your homepage settings and look for 'SEO title', 'Page title' or 'Meta title'. Add something like 'Homecare in [Your Town] | [Agency Name]'. In WordPress, install the free Yoast SEO plugin. It makes this easy.",
          techHelp: true,
        }
  );
  clarityFindings.push(
    h1Count === 1 && firstH1.length > 5
      ? {
          id: "cl-h1",
          label: "Single clear H1 on homepage",
          status: "green",
          detail: `H1: "${firstH1.slice(0, 90)}"`,
        }
      : h1Count === 0
      ? {
          id: "cl-h1",
          label: "Single clear H1 on homepage",
          status: "red",
          detail: "No H1 heading found.",
          fix: "Add one H1 that speaks to the family, not to Google. e.g. 'Homecare that lets mum stay at home.'",
          howTo: "Your homepage needs one main heading (called an H1). In most CMS platforms, the biggest heading block is automatically H1. Edit your homepage, find the main headline at the top of the page, and make sure it's set to 'Heading 1'. If you're unsure, ask your web developer. It's a 5-minute job.",
          techHelp: true,
        }
      : {
          id: "cl-h1",
          label: "Single clear H1 on homepage",
          status: "amber",
          detail: `Found ${h1Count} H1s: should be exactly one.`,
          fix: "Keep one H1 per page. Demote the others to H2.",
          howTo: "On your homepage, check each large heading and change all but the main one from 'Heading 1' to 'Heading 2'. In most page builders (Wix, Squarespace, Elementor) you can click a heading to see its style. Your web developer can also do this in minutes.",
          techHelp: true,
        }
  );
  clarityFindings.push(
    checklist.clearCtaAboveFold
      ? {
          id: "cl-cta",
          label: "Clear primary CTA above the fold",
          status: "green",
          detail: "You confirmed you have one.",
        }
      : {
          id: "cl-cta",
          label: "Clear primary CTA above the fold",
          status: "red",
          detail: "You told us there isn't one.",
          fix: "One primary action: 'Book a free care call' beats 'Contact us'. Keep it above the fold on mobile too.",
          howTo: "On your homepage, add a button above the fold (the part visible without scrolling). Label it something like 'Book a free care call' or 'Talk to us today'. In most CMS platforms you can add a button block and link it to your contact page or phone number. Check it works on mobile too.",
        }
  );
  clarityFindings.push(
    metaDesc && metaDesc.length >= 50
      ? {
          id: "cl-meta",
          label: "Homepage meta description present",
          status: "green",
          detail: `"${metaDesc.slice(0, 120)}..."`,
        }
      : {
          id: "cl-meta",
          label: "Homepage meta description present",
          status: "amber",
          detail: "Missing or very short meta description.",
          fix: "Write a 140-160 char meta description: the preview families see in Google.",
          easyWin: true,
          howTo: "In your CMS go to your homepage SEO settings and find the field called 'Meta description'. Write 1-2 sentences about your agency. Include your town name and one thing that makes you different. Aim for 140-160 characters. In WordPress, the Yoast or Rank Math plugin shows a character count as you type.",
        }
  );
  const clScore = scoreFindings(clarityFindings);

  // --- Contactability ---
  const contactFindings: Finding[] = [];
  contactFindings.push(
    hasPhone
      ? {
          id: "co-phone",
          label: "Phone number visible",
          status: "green",
          detail: "UK phone number detected on the site.",
        }
      : {
          id: "co-phone",
          label: "Phone number visible",
          status: "red",
          detail: "No UK phone number found on the crawled pages.",
          fix: "Put your phone number in the top-right of every page. Private families pick up the phone.",
          easyWin: true,
          howTo: "Add your phone number to your website's header. Most CMS platforms let you edit the header in a 'Site settings' or 'Header' section. Put it in the top-right corner so it's visible on every page without scrolling.",
        }
  );
  contactFindings.push(
    hasTelLink
      ? {
          id: "co-telclick",
          label: "Click-to-call on mobile",
          status: "green",
          detail: "Phone link is tappable (tel:).",
        }
      : hasPhone
      ? {
          id: "co-telclick",
          label: "Click-to-call on mobile",
          status: "amber",
          detail: "Number shown but not tappable.",
          fix: 'Wrap your number in a <a href="tel:..."> link for one-tap calling on mobile.',
          easyWin: true,
          howTo: 'Ask your web developer to wrap your phone number in a tel: link. It\'s one line of HTML: <a href="tel:01234567890">01234 567890</a>. If you edit your own site in Wix or Squarespace, select your phone number text and add a link. Set the URL as "tel:YOURNUMBER" (no spaces). Takes 2 minutes.',
          techHelp: true,
        }
      : {
          id: "co-telclick",
          label: "Click-to-call on mobile",
          status: "red",
          detail: "No tappable phone link.",
          howTo: 'Add your phone number to the site and make it tappable: in Wix/Squarespace, add a text element with your number, select it, click \'Add link\', and type "tel:YOURNUMBER". Or ask your web developer. It\'s a 5-minute fix.',
          easyWin: true,
        }
  );
  contactFindings.push(
    hasContactForm || hasMailto
      ? {
          id: "co-form",
          label: "Contact form or email",
          status: "green",
          detail: hasContactForm ? "Contact form found." : "Mailto link found.",
        }
      : {
          id: "co-form",
          label: "Contact form or email",
          status: "red",
          detail: "No form or email link found.",
          fix: "Add a short enquiry form: 3 fields max (name, phone, situation).",
          howTo: "Most CMS platforms have a built-in form builder. In Wix, Squarespace or WordPress, add a 'Form' block to your contact page. Keep it to 3 fields: Name, Phone number, 'Tell us about your situation'. Link form submissions to your email address so you get notified instantly.",
        }
  );
  contactFindings.push(
    checklist.publishesCoverageAreas || hasPostcode
      ? {
          id: "co-area",
          label: "Coverage area visible",
          status: "green",
          detail: "Areas or postcodes are published somewhere on site.",
        }
      : {
          id: "co-area",
          label: "Coverage area visible",
          status: "red",
          detail: "No coverage areas or postcodes found across the crawled pages.",
          fix: "Families search 'homecare in [town]'. List the towns and postcodes you cover. It boosts local SEO too.",
          easyWin: true,
          howTo: "On your homepage or contact page, add a short section that lists the areas you cover. Something like: 'We provide homecare across [Town A], [Town B] and [Town C], including postcodes XX1, XX2 and XX3.' This also helps Google show your site to local searchers.",
        }
  );
  const coScore = scoreFindings(contactFindings);

  // --- Mobile & speed ---
  const mobileFindings: Finding[] = [];
  mobileFindings.push(
    hasMobileViewport
      ? {
          id: "mo-viewport",
          label: "Mobile viewport set",
          status: "green",
          detail: "Viewport meta tag found on homepage.",
        }
      : {
          id: "mo-viewport",
          label: "Mobile viewport set",
          status: "red",
          detail: "Missing viewport meta tag.",
          fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> so the site scales on phones.',
          techHelp: true,
          howTo: 'This requires editing your website\'s HTML header. Ask your web developer to add this one line: <meta name="viewport" content="width=device-width, initial-scale=1">. If you built your site on Wix, Squarespace or a modern WordPress theme, this should already be there; contact their support if it isn\'t.',
        }
  );
  mobileFindings.push(
    avgMs < 1500
      ? {
          id: "mo-speed",
          label: "Average page load time",
          status: "green",
          detail: `Avg ${avgMs} ms across ${pages.length} pages (worst ${worstMs} ms).`,
        }
      : avgMs < 3500
      ? {
          id: "mo-speed",
          label: "Average page load time",
          status: "amber",
          detail: `Avg ${avgMs} ms across ${pages.length} pages. Feels slow on 4G.`,
          fix: "Compress hero images, defer non-critical scripts. Aim for sub-2s on mobile.",
          techHelp: true,
          howTo: "The most common culprit is large images. Go to your CMS and re-upload your hero/banner images at a smaller file size. Aim for under 200KB each. Use a free tool like squoosh.app to compress images before uploading. For anything beyond that (scripts, caching), ask your web developer.",
        }
      : {
          id: "mo-speed",
          label: "Average page load time",
          status: "red",
          detail: `Avg ${avgMs} ms across ${pages.length} pages. Too slow.`,
          fix: "Every extra second loses ~7% of visitors. Compress images, remove unused plugins, enable caching.",
          techHelp: true,
          howTo: "Start by compressing your images: go to squoosh.app, upload each image, reduce the quality to around 75%, and re-upload to your CMS. If the site is still slow after that, ask a web developer to audit it. On WordPress, a caching plugin like WP Super Cache (free) can halve load times.",
        }
  );
  mobileFindings.push(
    altCoverage >= 0.8
      ? {
          id: "mo-alt",
          label: "Image alt text coverage",
          status: "green",
          detail: `${Math.round(altCoverage * 100)}% of images have alt text.`,
        }
      : altCoverage >= 0.4
      ? {
          id: "mo-alt",
          label: "Image alt text coverage",
          status: "amber",
          detail: `Only ${Math.round(altCoverage * 100)}% of images have alt text.`,
          fix: "Add short alt text to every image. It helps screen-reader users and Google Images.",
          easyWin: true,
          howTo: "In your CMS, click each image and look for a field called 'Alt text' or 'Alternative text'. Write a short plain-English description of what the image shows (e.g. 'Carer helping elderly woman with breakfast'). Do the homepage images first, then work through the rest.",
        }
      : {
          id: "mo-alt",
          label: "Image alt text coverage",
          status: "red",
          detail: `Only ${Math.round(altCoverage * 100)}% of images have alt text.`,
          fix: "Most images are missing alt text: an accessibility and SEO gap.",
          easyWin: true,
          howTo: "In your CMS, click each image and look for a field called 'Alt text' or 'Alternative text'. Write a short plain-English description of what each image shows (e.g. 'Carer helping elderly woman with breakfast'). This takes about 30 seconds per image and helps both Google and visually-impaired visitors.",
        }
  );
  const moScore = scoreFindings(mobileFindings);

  const categories: CategoryReport[] = [
    {
      key: "private",
      name: "Private-pay readiness",
      blurb:
        "Whether your site speaks to self-funded families and gives them the pricing signals they need to pick up the phone.",
      score: ppScore,
      rag: ragFromScore(ppScore),
      findings: privateFindings,
    },
    {
      key: "services",
      name: "Services & specialisms",
      blurb:
        "Whether families can see the full range of care you offer, and whether each service has the depth to rank and convert.",
      score: svScore,
      rag: ragFromScore(svScore),
      findings: serviceFindings,
    },
    {
      key: "trust",
      name: "Trust & credibility",
      blurb: "The signals that decide whether a family trusts you with their mum or dad.",
      score: trScore,
      rag: ragFromScore(trScore),
      findings: trustFindings,
    },
    {
      key: "clarity",
      name: "Clarity & messaging",
      blurb:
        "Whether the homepage makes it obvious, in 5 seconds, who you help and what to do next.",
      score: clScore,
      rag: ragFromScore(clScore),
      findings: clarityFindings,
    },
    {
      key: "contact",
      name: "Contactability",
      blurb: "How easy it is for a family in a hurry to reach a human.",
      score: coScore,
      rag: ragFromScore(coScore),
      findings: contactFindings,
    },
    {
      key: "mobile",
      name: "Mobile & speed",
      blurb:
        "Most family research happens on phones. A slow or clunky site loses them.",
      score: moScore,
      rag: ragFromScore(moScore),
      findings: mobileFindings,
    },
  ];

  const overallScore = Math.round(
    categories.reduce((s, c) => s + c.score, 0) / categories.length
  );
  const overallRag = ragFromScore(overallScore);

  const headline =
    overallRag === "green"
      ? "Your site is pulling its weight. Here's how to win more private clients."
      : overallRag === "amber"
      ? "Your site has bones, but it's leaking private-pay enquiries."
      : "Your site is costing you private clients every week.";

  const summary = summarise(categories);

  return {
    url: home.url,
    fetchedAt: new Date().toISOString(),
    pagesCrawled: pages.length,
    pagesSampled: pages.map((p) => p.url),
    overallScore,
    overallRag,
    headline,
    summary,
    categories,
    signals: {
      title,
      metaDescLength: metaDesc.length,
      h1Count,
      hasMobileViewport,
      isHttps,
      hasPhone,
      hasContactForm,
      mentionsPrivate,
      mentionsPricing,
      mentionsTestimonials,
      mentionsCqc,
      servicesDetected: servicesDetected.length,
      avgMs,
      worstMs,
      pagesCrawled: pages.length,
    },
  };
}

function scoreFindings(findings: Finding[]): number {
  if (!findings.length) return 0;
  const pts = findings.reduce(
    (s, f) => s + (f.status === "green" ? 100 : f.status === "amber" ? 55 : 15),
    0
  );
  return Math.round(pts / findings.length);
}

function summarise(cats: CategoryReport[]): string {
  const reds = cats.filter((c) => c.rag === "red").map((c) => c.name);
  const greens = cats.filter((c) => c.rag === "green").map((c) => c.name);
  if (reds.length === 0 && greens.length > 0) {
    return `Strong across the board: ${greens.join(", ")} are all looking good. The gains from here are incremental.`;
  }
  if (reds.length) {
    return `The biggest leaks are in ${reds.join(", ")}. Fixing these first will have the biggest effect on private enquiries.`;
  }
  return "Solid foundations with a few places to tighten up. None of the categories are in the red.";
}

function shortUrl(u: string): string {
  try {
    const url = new URL(u);
    return url.pathname === "/" ? url.host : url.host + url.pathname;
  } catch {
    return u;
  }
}
