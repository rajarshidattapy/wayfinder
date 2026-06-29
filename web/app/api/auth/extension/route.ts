import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import { prisma } from '@/lib/prisma';

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.upsert({
    where: { clerkId: userId },
    create: { clerkId: userId, email: '' },
    update: {},
  });

  const rawToken = `wf_${randomBytes(32).toString('hex')}`;
  const hashedToken = createHash('sha256').update(rawToken).digest('hex');

  await prisma.apiToken.create({
    data: { userId: user.id, token: hashedToken, name: 'Chrome Extension' },
  });

  return NextResponse.json({ token: rawToken });
}
