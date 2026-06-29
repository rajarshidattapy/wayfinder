import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';

function statusBadge(status: string) {
  const map: Record<string, string> = {
    completed: 'bg-green-100 text-green-800',
    active: 'bg-blue-100 text-blue-800',
    abandoned: 'bg-slate-100 text-slate-600',
  };
  return map[status] ?? 'bg-slate-100 text-slate-600';
}

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: {
      sessions: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { _count: { select: { steps: true } } },
      },
      _count: { select: { sessions: true } },
    },
  });

  const completedCount = user?.sessions.filter((s) => s.status === 'completed').length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🧭</span>
          <span className="font-bold text-slate-900">Wayfinder</span>
        </div>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/dashboard" className="font-medium text-slate-900">Dashboard</Link>
          <Link href="/playbooks" className="text-slate-500 hover:text-slate-900">Playbooks</Link>
          <Link href="/extension/auth" className="text-slate-500 hover:text-slate-900">Connect extension</Link>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-8 py-10">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-6 mb-10">
          {[
            { label: 'Total sessions', value: user?._count.sessions ?? 0 },
            { label: 'Completed goals', value: completedCount },
            { label: 'Steps taken', value: user?.sessions.reduce((a, s) => a + s.stepCount, 0) ?? 0 },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-6">
              <p className="text-3xl font-bold text-slate-900">{value}</p>
              <p className="text-sm text-slate-500 mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Sessions */}
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent sessions</h2>
        {!user || user.sessions.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <p className="text-4xl mb-3">🧭</p>
            <p className="font-semibold text-slate-700">No sessions yet</p>
            <p className="text-sm text-slate-500 mt-1">
              Install the Chrome extension and start guiding yourself through complex software.
            </p>
            <Link
              href="/extension/auth"
              className="inline-block mt-5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              Connect extension
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {user.sessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between px-6 py-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 truncate">{session.goal}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(session.createdAt).toLocaleDateString(undefined, {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                    {' · '}
                    {session._count.steps} steps
                  </p>
                </div>
                <span className={`ml-4 text-xs font-medium px-2.5 py-1 rounded-full ${statusBadge(session.status)}`}>
                  {session.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
