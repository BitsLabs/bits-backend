import { NextResponse } from "next/server";

import { getModelLabel, MODEL_POLICY } from "../../../lib/models";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    available: Boolean(
      process.env.OPENROUTER_API_KEY && process.env.BITS_SESSION_SECRET,
    ),
    modelLabel: getModelLabel(MODEL_POLICY.cards),
  });
}
