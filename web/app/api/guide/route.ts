import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { cerebras, MODEL } from '@/lib/cerebras';
import { SYSTEM_PROMPT } from '@/lib/prompts/system';
import { prisma } from '@/lib/prisma';
import { requireApiKey, isError } from '@/lib/middleware';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 30;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}

export async function POST(req: NextRequest) {
  const start = Date.now();

  // ── Auth ──
  const auth = await requireApiKey(req);
  if (isError(auth)) return new NextResponse(auth.body, { status: auth.status, headers: { ...Object.fromEntries(auth.headers), ...CORS } });
  const { user } = auth;

  // ── Circuit breaker: 30 inferences / user / minute ──
  const { allowed, remaining, resetIn } = checkRateLimit(user.id, { max: 30 });
  if (!allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Max 30 guidance steps per minute. Resets in ${resetIn}s.` },
      { status: 429, headers: { ...CORS, 'X-RateLimit-Reset': String(resetIn) } }
    );
  }

  // ── Parse body ──
  const body = await req.json();
  const { goal, sessionId, completedSteps, domSnapshot, screenshot, url } = body as {
    goal: string;
    sessionId: string;
    completedSteps: string[];
    domSnapshot: string;
    screenshot: string;
    url: string;
  };

  if (!goal || !screenshot || !domSnapshot) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400, headers: CORS });
  }

  // ── Upsert session ──
  let session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) {
    session = await prisma.session.create({
      data: { id: sessionId, userId: user.id, goal, startUrl: url },
    });
  }

  // ── Call Cerebras ──
  let domParsed: unknown;
  try { domParsed = JSON.parse(domSnapshot); } catch { domParsed = domSnapshot; }

  const completion = await (cerebras.chat.completions.create as (opts: unknown) => Promise<{
    choices: Array<{ message: { content: string | null } }>;
  }>)({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: JSON.stringify({ goal, currentUrl: url, completedSteps, domSnapshot: domParsed }) },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot}` } },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 500,
    temperature: 0.2,
  });

  const raw = completion.choices[0].message.content ?? '{}';
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Model returned invalid JSON', raw }, { status: 502, headers: CORS });
  }

  const latencyMs = Date.now() - start;
  const confidence = (parsed.confidence as number) ?? 0;
  const isLowConfidence = confidence < 0.5;

  // ── Persist step + update session metrics ──
  const stepIndex = completedSteps.length;

  // Compute rolling avg and min confidence
  const newStepCount = (session.stepCount ?? 0) + 1;
  const newAvg = ((session.avgConfidence ?? 0) * (session.stepCount ?? 0) + confidence) / newStepCount;
  const newMin = Math.min(session.minConfidence ?? 1, confidence);

  const sessionUpdate: Record<string, unknown> = {
    stepCount: { increment: 1 },
    avgConfidence: newAvg,
    minConfidence: newMin,
  };
  if (parsed.done) {
    sessionUpdate.status = 'completed';
    sessionUpdate.completedAt = new Date();
    sessionUpdate.durationMs = Date.now() - new Date(session.createdAt).getTime();
  }

  await Promise.all([
    prisma.step.create({
      data: {
        sessionId: session.id,
        stepIndex,
        url,
        selector: (parsed.selector as string) || '',
        action: (parsed.action as string) || 'unknown',
        explanation: (parsed.explanation as string) || '',
        confidence,
        latencyMs,
      },
    }),
    prisma.session.update({ where: { id: session.id }, data: sessionUpdate }),
    prisma.apiToken.update({
      where: { token: createHash('sha256').update(req.headers.get('authorization')!.replace('Bearer ', '').trim()).digest('hex') },
      data: { lastUsed: new Date() },
    }),
  ]);

  return NextResponse.json(
    { ...parsed, latencyMs, remaining, isLowConfidence },
    { headers: { ...CORS, 'X-RateLimit-Remaining': String(remaining) } }
  );
}
