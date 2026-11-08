import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const [row] = await query<{ now: string }>("SELECT now()");
    return NextResponse.json({ db: "ok", time: row.now });
  } catch {
    return NextResponse.json({ db: "down" }, { status: 503 });
  }
}
