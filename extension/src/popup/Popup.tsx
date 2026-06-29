import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000';

export default function Popup() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'WF_PING' }, (res) => {
      setAuthed(res?.authenticated || false);
      setLoading(false);
    });
  }, []);

  const openPanel = () => {
    chrome.runtime.sendMessage({ type: 'WF_OPEN_PANEL' });
    window.close();
  };

  if (loading) return (
    <div className="p-6 w-72 flex items-center justify-center h-20 text-slate-400 text-sm">
      Loading…
    </div>
  );

  if (!authed) return (
    <div className="p-6 w-72">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">🧭</span>
        <span className="font-bold text-slate-900">Wayfinder</span>
      </div>
      <p className="text-sm text-slate-500 mb-4">Sign in to start guided navigation.</p>
      <a
        href={`${API_BASE}/extension/auth`}
        target="_blank"
        rel="noreferrer"
        className="block w-full text-center bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-medium text-sm transition-colors"
      >
        Sign in
      </a>
    </div>
  );

  return (
    <div className="p-6 w-72">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">🧭</span>
        <span className="font-bold text-slate-900">Wayfinder</span>
      </div>
      <p className="text-xs text-slate-400 mb-4">Open the side panel for live guidance status.</p>
      <button
        onClick={openPanel}
        className="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-medium text-sm transition-colors"
      >
        Open side panel →
      </button>
    </div>
  );
}
