import { NextRequest, NextResponse } from "next/server";
import { runAudit, Checklist } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

export async function POST(req: NextRequest) {
  let body: { url?: string; checklist?: Checklist };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const url = (body.url || "").trim();
  if (!url) return badRequest("Please enter your website URL.");
  if (url.length > 500) return badRequest("URL too long.");

  const checklist: Checklist = {
    hasPrivatePage: !!body.checklist?.hasPrivatePage,
    pricingVisible: !!body.checklist?.pricingVisible,
    recentPrivateTestimonials: !!body.checklist?.recentPrivateTestimonials,
    clearCtaAboveFold: !!body.checklist?.clearCtaAboveFold,
    publishesCoverageAreas: !!body.checklist?.publishesCoverageAreas,
  };

  try {
    const result = await runAudit(url, checklist);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        error:
          "We couldn't reach that site. Double-check the URL, or try again in a moment.",
        detail: msg,
      },
      { status: 502 }
    );
  }
}
