import { NextResponse } from "next/server";
import { limparSessao } from "@/lib/session";

export async function POST() {
  await limparSessao();
  return NextResponse.json({ ok: true });
}
