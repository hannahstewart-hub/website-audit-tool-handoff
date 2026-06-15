import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEADS_FILE = path.join(process.cwd(), "data", "leads.json");
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HS_PORTAL = "4789280";
const HS_FORM   = "3182ee67-ea33-4945-b1be-1da4d67a9980";

type Lead = {
  email: string;
  firstname?: string;
  lastname?: string;
  jobtitle?: string;
  company?: string;
  url?: string;
  overallScore?: number;
  createdAt: string;
};

async function readLeads(): Promise<Lead[]> {
  try {
    return JSON.parse(await fs.readFile(LEADS_FILE, "utf8"));
  } catch {
    return [];
  }
}

async function writeLeads(leads: Lead[]) {
  await fs.mkdir(path.dirname(LEADS_FILE), { recursive: true });
  await fs.writeFile(LEADS_FILE, JSON.stringify(leads, null, 2));
}

async function submitToHubspot(lead: Lead, pageUrl: string) {
  const fields = [
    { name: "email",     value: lead.email },
    { name: "firstname", value: lead.firstname ?? "" },
    { name: "lastname",  value: lead.lastname  ?? "" },
    { name: "jobtitle",  value: lead.jobtitle  ?? "" },
    { name: "company",   value: lead.company   ?? "" },
  ].filter((f) => f.value !== "");

  await fetch(
    `https://api.hsforms.com/submissions/v3/integration/submit/${HS_PORTAL}/${HS_FORM}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields,
        context: { pageUri: pageUrl, pageName: "Website Audit Tool" },
      }),
    }
  );
}

export async function POST(req: NextRequest) {
  let body: Partial<Lead & { pageUrl?: string }>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RX.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email." },
      { status: 400 }
    );
  }

  const lead: Lead = {
    email,
    firstname:    body.firstname?.trim(),
    lastname:     body.lastname?.trim(),
    jobtitle:     body.jobtitle?.trim(),
    company:      body.company?.trim(),
    url:          body.url?.trim(),
    overallScore: body.overallScore,
    createdAt:    new Date().toISOString(),
  };

  // Save locally and push to HubSpot in parallel; don't fail the request if HS errors
  await Promise.allSettled([
    (async () => {
      const leads = await readLeads();
      leads.push(lead);
      await writeLeads(leads);
    })(),
    submitToHubspot(lead, body.pageUrl ?? ""),
  ]);

  return NextResponse.json({ ok: true });
}
