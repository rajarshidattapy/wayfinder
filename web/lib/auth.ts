import { createHash } from 'crypto';
import { prisma } from './prisma';

export async function verifyApiToken(rawToken: string) {
  const hashed = createHash('sha256').update(rawToken).digest('hex');
  const apiToken = await prisma.apiToken.findUnique({
    where: { token: hashed },
    include: { user: true },
  });
  return apiToken?.user ?? null;
}
