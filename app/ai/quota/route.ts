import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticate } from "../../../lib/auth";
import { getAIQuotaStatus } from "../../../lib/aiQuota";
import { handleError } from "../../../lib/errors";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = authenticate(request);
    const quota = await getAIQuotaStatus(session);

    return NextResponse.json({ quota });
  } catch (error) {
    return handleError(error);
  }
}
