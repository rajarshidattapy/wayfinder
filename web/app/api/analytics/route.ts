import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isError } from '@/lib/middleware';
import { prisma } from '@/lib/prisma';

// Admin-only observability endpoint.
// Surfaces low-confidence sessions and abandoned goals as a prompt-improvement signal.
// curl -H "x-admin-secret: $ADMIN_SECRET" http://localhost:3000/api/analytics

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (isError(admin)) return admin;

  const [
    statusCounts,
    lowConfidenceSessions,
    abandonedSessions,
    avgLatency,
    topGoals,
  ] = await Promise.all([
    // Sessions by status
    prisma.session.groupBy({
      by: ['status'],
      _count: { id: true },
    }),

    // Sessions where model was frequently uncertain — prompt improvement signal
    prisma.session.findMany({
      where: { avgConfidence: { lt: 0.5 }, stepCount: { gt: 1 } },
      select: { id: true, goal: true, avgConfidence: true, minConfidence: true, stepCount: true, status: true, createdAt: true },
      orderBy: { avgConfidence: 'asc' },
      take: 20,
    }),

    // Sessions that started but never completed (abandoned mid-flow)
    prisma.session.findMany({
      where: { status: 'active', stepCount: { gt: 0 }, createdAt: { lt: new Date(Date.now() - 10 * 60_000) } },
      select: { id: true, goal: true, stepCount: true, avgConfidence: true, startUrl: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),

    // P50 / P95 latency from recent steps
    prisma.step.aggregate({
      _avg: { latencyMs: true },
      _count: { id: true },
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } },
    }),

    // Most common goal patterns (for prioritising future prompt tuning)
    prisma.session.groupBy({
      by: ['goal'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 15,
    }),
  ]);

  // Mark stale active sessions as abandoned (lazy cleanup)
  const staleIds = abandonedSessions.map((s) => s.id);
  if (staleIds.length > 0) {
    await prisma.session.updateMany({
      where: { id: { in: staleIds } },
      data: { status: 'abandoned' },
    });
  }

  return NextResponse.json({
    summary: {
      byStatus: Object.fromEntries(statusCounts.map((r) => [r.status, r._count.id])),
      last24h: {
        totalSteps: avgLatency._count.id,
        avgLatencyMs: Math.round(avgLatency._avg.latencyMs ?? 0),
      },
    },
    signals: {
      lowConfidenceSessions,
      abandonedGoals: abandonedSessions.map((s) => ({ goal: s.goal, steps: s.stepCount, startUrl: s.startUrl })),
      topGoals: topGoals.map((g) => ({ goal: g.goal, count: g._count.id })),
    },
  });
}
