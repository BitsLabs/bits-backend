import { NextResponse } from "next/server";

import { getModelLabel, MODEL_POLICY } from "../../../lib/models";

export const runtime = "nodejs";

export async function GET() {
  // `available` answers the shipped App Store build, which only calls the
  // legacy OpenAI-backed endpoints — so it must not depend on the OpenRouter
  // key, or an OpenRouter outage would black out an app that never touches it.
  const legacyReady = Boolean(
    process.env.OPENAI_API_KEY && process.env.BITS_SESSION_SECRET,
  );
  const chatReady = Boolean(
    process.env.OPENROUTER_API_KEY && process.env.BITS_SESSION_SECRET,
  );

  return NextResponse.json({
    available: legacyReady,
    modelLabel: getModelLabel(MODEL_POLICY.cards),
    chatAvailable: chatReady,
    chatModelLabel: getModelLabel(MODEL_POLICY.chat),
  });
}
