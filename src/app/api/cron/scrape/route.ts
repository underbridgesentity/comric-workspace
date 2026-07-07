import { NextResponse } from "next/server";
import { runScrape } from "@/lib/scraper";

export const maxDuration = 120;

/**
 * Vercel cron entrypoint. Authorised solely via the CRON_SECRET bearer
 * header that Vercel attaches to scheduled invocations.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runScrape();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("cron scrape failed", err);
    return NextResponse.json({ error: "Scrape run failed" }, { status: 500 });
  }
}
