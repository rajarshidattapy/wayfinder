import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiToken } from './auth';
import type { User } from '@prisma/client';

// ── Tier 1: Extension bearer token (used by /api/guide) ──────────────────────
export async function requireApiKey(
  req: NextRequest
): Promise<{ user: User } | NextResponse> {
  const raw = req.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!raw) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 });
  }
  const user = await verifyApiToken(raw);
  if (!user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
  return { user };
}

// ── Tier 2: Clerk session JWT (used by dashboard / playbook routes) ───────────
export async function requireUser(): Promise<{ clerkId: string } | NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return { clerkId: userId };
}

// ── Tier 3: Admin (placeholder — add ADMIN_SECRET env var when needed) ────────
export async function requireAdmin(
  req: NextRequest
): Promise<true | NextResponse> {
  const secret = req.headers.get('x-admin-secret');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return true;
}

// ── Helper: narrow auth result ────────────────────────────────────────────────
export function isError(result: unknown): result is NextResponse {
  return result instanceof NextResponse;
}
