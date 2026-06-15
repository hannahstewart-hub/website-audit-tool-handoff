# Is Your Website Actually Winning Private Clients?

A Birdie-branded free tool for UK homecare agency owners. Audits their website, runs a 5-question checklist, and produces a red/amber/green report. Email-gated.

## Run locally

```bash
cd website-audit-tool
npm install
npm run dev
```

Open http://localhost:3000

## How it works

1. **Form** (`app/page.tsx`) — URL + 5-question checklist
2. **Audit API** (`app/api/audit/route.ts`) — fetches homepage, parses with cheerio, runs signal detection
3. **Scoring** (`lib/audit.ts`) — combines crawl signals + checklist answers into 5 RAG-scored categories:
   - Private-pay readiness
   - Trust & credibility
   - Clarity & messaging
   - Contactability
   - Mobile & speed
4. **Email gate** — first 2 categories shown; rest blurred until email captured
5. **Lead capture** (`app/api/lead/route.ts`) — appends to `data/leads.json`

## Deploy

Vercel works out of the box. Note: Vercel's filesystem is ephemeral — swap `data/leads.json` for a proper destination (Hubspot webhook, Airtable, Supabase) before production.

## Config to swap for prod

- `app/api/lead/route.ts` — replace JSON file write with Hubspot / CRM call
- Update demo CTA link (currently `https://birdie.care/book-a-demo`)
- Add analytics tracking (GA4 / Birdie's existing stack)
