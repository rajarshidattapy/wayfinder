import type { GuideRequest, GuideResponse } from '../../../shared/types';
import { getAuthToken } from './auth';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000';

export async function callGuideAPI(payload: GuideRequest): Promise<GuideResponse> {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE}/api/guide`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Guide API ${res.status}: ${text}`);
  }

  return res.json();
}
