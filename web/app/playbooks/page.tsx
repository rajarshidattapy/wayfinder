import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import type { Playbook } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';

const APP_LABELS: Record<string, string> = {
  aws: 'AWS',
  figma: 'Figma',
  github: 'GitHub',
  linear: 'Linear',
  vercel: 'Vercel',
  salesforce: 'Salesforce',
};

export default async function PlaybooksPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });

  const playbooks = user
    ? await prisma.playbook.findMany({
        where: { OR: [{ userId: user.id }, { isPublic: true }] },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🧭</span>
          <span className="font-bold text-slate-900">Wayfinder</span>
        </div>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/dashboard" className="text-slate-500 hover:text-slate-900">Dashboard</Link>
          <Link href="/playbooks" className="font-medium text-slate-900">Playbooks</Link>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Playbooks</h1>
            <p className="text-sm text-slate-500 mt-1">Pre-defined guidance flows for common tasks</p>
          </div>
        </div>

        {playbooks.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <p className="text-4xl mb-3">📖</p>
            <p className="font-semibold text-slate-700">No playbooks yet</p>
            <p className="text-sm text-slate-500 mt-1">
              Playbooks are reusable guided flows. They&apos;ll appear here after completing sessions.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {playbooks.map((pb: Playbook) => (
              <div key={pb.id} className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{pb.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5 font-mono">{pb.goalPattern}</p>
                  </div>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    {APP_LABELS[pb.app] ?? pb.app}
                  </span>
                </div>
                {pb.isPublic && (
                  <p className="text-xs text-green-600 mt-3">Public playbook</p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
