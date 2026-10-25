import { NextResponse, type NextRequest } from "next/server";
import { searchSuggestions } from "@/server/catalog";

/** Header search suggestions. Public, read-only, published products only. */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  try {
    const results = await searchSuggestions(q, 6);
    return NextResponse.json({ results }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } });
  } catch (error) {
    console.error("[api/search]", error);
    return NextResponse.json({ results: [] }, { status: 500 });
  }
}
