import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000';

export default function Popup() {
  const [goal, setGoal] = useState('');
  const [running, setRunning] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'WF_PING' }, (res) => {
      setAuthed(res?.authenticated || false);
      setLoading(false);
    });
  }, []);

  const start = async () => {
    if (!goal.trim()) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return;
    await chrome.tabs.sendMessage(tab.id, { type: 'WF_START', goal });
    setRunning(true);
  };

  const stop = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return;
    await chrome.tabs.sendMessage(tab.id, { type: 'WF_STOP' });
    setRunning(false);
  };

  if (loading) {
    return (
      <div className="p-6 w-80 flex items-center justify-center h-24 text-slate-400 text-sm">
        Loading…
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="p-6 w-80">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🧭</span>
          <h1 className="text-lg font-bold text-slate-900">Wayfinder</h1>
        </div>
        <p className="text-sm text-slate-500 mt-1 mb-4">
          AI GPS for complex software. Sign in to start.
        </p>
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
  }

  return (
    <div className="p-6 w-80">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">🧭</span>
        <h1 className="text-lg font-bold text-slate-900">Wayfinder</h1>
      </div>
      <p className="text-xs text-slate-400 mb-3">Tell it what you want to accomplish.</p>
      <textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder="Deploy my FastAPI app on AWS…"
        className="w-full h-24 p-3 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:bg-slate-50"
        disabled={running}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) start();
        }}
      />
      <p className="text-xs text-slate-400 mt-1 mb-3">
        {running ? 'Following the green arrows…' : 'Tip: ⌘+Enter to start'}
      </p>
      {running ? (
        <button
          onClick={stop}
          className="w-full bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-lg font-medium text-sm transition-colors"
        >
          Stop guidance
        </button>
      ) : (
        <button
          onClick={start}
          disabled={!goal.trim()}
          className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-medium text-sm transition-colors"
        >
          Start guiding me →
        </button>
      )}
    </div>
  );
}
