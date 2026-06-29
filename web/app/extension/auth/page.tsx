'use client';
import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';

const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID ?? '';

export default function ExtensionAuth() {
  const { user, isLoaded } = useUser();
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isLoaded || !user) return;

    (async () => {
      try {
        const res = await fetch('/api/auth/extension', { method: 'POST' });
        if (!res.ok) {
          setErrorMsg('Failed to mint token. Please try again.');
          setStatus('error');
          return;
        }
        const { token } = await res.json();

        if (!EXTENSION_ID) {
          setErrorMsg('Extension ID not configured.');
          setStatus('error');
          return;
        }

        // @ts-expect-error — chrome injected by extension
        const chrome = (window as any).chrome;
        if (!chrome?.runtime?.sendMessage) {
          setErrorMsg('Extension not detected. Please install Wayfinder first.');
          setStatus('error');
          return;
        }

        chrome.runtime.sendMessage(
          EXTENSION_ID,
          { type: 'WF_SET_TOKEN', token },
          (response: { ok: boolean } | undefined) => {
            if (response?.ok) {
              setStatus('success');
              setTimeout(() => window.close(), 1500);
            } else {
              setErrorMsg('Extension did not acknowledge. Is it installed and enabled?');
              setStatus('error');
            }
          }
        );
      } catch (e) {
        setErrorMsg((e as Error).message);
        setStatus('error');
      }
    })();
  }, [isLoaded, user]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-400 text-sm">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-slate-700 font-medium mb-3">Sign in to connect the extension.</p>
          <a
            href="/sign-in"
            className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center max-w-sm w-full">
        <span className="text-4xl mb-4 block">🧭</span>
        {status === 'pending' && (
          <>
            <p className="font-semibold text-slate-900">Connecting your extension…</p>
            <p className="text-sm text-slate-500 mt-2">This will only take a moment.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <p className="font-semibold text-green-700">Extension connected!</p>
            <p className="text-sm text-slate-500 mt-2">You can close this tab and start guiding.</p>
          </>
        )}
        {status === 'error' && (
          <>
            <p className="font-semibold text-red-600">Connection failed</p>
            <p className="text-sm text-slate-500 mt-2">{errorMsg}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
            >
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
