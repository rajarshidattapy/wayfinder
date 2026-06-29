import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { cerebras, MODEL } from '@/lib/cerebras';
import { SYSTEM_PROMPT } from '@/lib/prompts/system';
import { prisma } from '@/lib/prisma';
import { verifyApiToken } from '@/lib/auth';

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

  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '').trim();
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401, headers: CORS });
  }

  const user = await verifyApiToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: CORS });
  }

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

  // Upsert session
  let session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) {
    session = await prisma.session.create({
      data: { id: sessionId, userId: user.id, goal, startUrl: url },
    });
  }

  let domParsed: unknown;
  try {
    domParsed = JSON.parse(domSnapshot);
  } catch {
    domParsed = domSnapshot;
  }

  // The Cerebras SDK types are loose — cast through any to avoid fighting them
  const completion = await (cerebras.chat.completions.create as (opts: unknown) => Promise<{
    choices: Array<{ message: { content: string | null } }>;
  }>)({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: JSON.stringify({ goal, currentUrl: url, completedSteps, domSnapshot: domParsed }),
          },
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${screenshot}` },
          },
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

  const updateData: Record<string, unknown> = { stepCount: { increment: 1 } };
  if (parsed.done) {
    updateData.status = 'completed';
    updateData.completedAt = new Date();
  }

  await Promise.all([
    prisma.step.create({
      data: {
        sessionId: session.id,
        stepIndex: completedSteps.length,
        url,
        selector: (parsed.selector as string) || '',
        action: (parsed.action as string) || 'unknown',
        explanation: (parsed.explanation as string) || '',
        confidence: (parsed.confidence as number) || 0,
        latencyMs,
      },
    }),
    prisma.session.update({
      where: { id: session.id },
      data: updateData,
    }),
    prisma.apiToken.update({
      where: { token: createHash('sha256').update(token).digest('hex') },
      data: { lastUsed: new Date() },
    }),
  ]);

  return NextResponse.json({ ...parsed, latencyMs }, { headers: CORS });
}
