import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) return NextResponse.json({ playbooks: [] });

  const { searchParams } = new URL(req.url);
  const app = searchParams.get('app');

  const playbooks = await prisma.playbook.findMany({
    where: {
      OR: [
        { userId: user.id },
        { isPublic: true },
      ],
      ...(app ? { app } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ playbooks });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const body = await req.json();
  const { name, goalPattern, steps, app, isPublic } = body;

  const playbook = await prisma.playbook.create({
    data: { userId: user.id, name, goalPattern, steps, app, isPublic: isPublic ?? false },
  });

  return NextResponse.json({ playbook }, { status: 201 });
}
