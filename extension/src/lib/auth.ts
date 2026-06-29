const TOKEN_KEY = 'wf_auth_token';

export async function getAuthToken(): Promise<string | null> {
  const result = await chrome.storage.local.get(TOKEN_KEY);
  return result[TOKEN_KEY] ?? null;
}

export async function setAuthToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [TOKEN_KEY]: token });
}

export async function clearAuthToken(): Promise<void> {
  await chrome.storage.local.remove(TOKEN_KEY);
}
