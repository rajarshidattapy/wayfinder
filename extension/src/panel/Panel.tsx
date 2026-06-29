import { useState, useEffect, useRef } from 'react';

type Status = 'idle' | 'thinking' | 'guiding' | 'done' | 'error';

interface StatusMsg {
  status: Status;
  message?: string;
  action?: string;
  latencyMs?: number;
  stepIndex?: number;
  goal?: string;
}

interface Step {
  index: number;
  message: string;
  latencyMs?: number;
}

const STATUS_CONFIG: Record<Status, { label: string; color: string; pulse: boolean }> = {
  idle:     { label: 'Ready',    color: 'bg-slate-400',  pulse: false },
  thinking: { label: 'Thinking', color: 'bg-amber-400',  pulse: true  },
  guiding:  { label: 'Guiding',  color: 'bg-green-500',  pulse: true  },
  done:     { label: 'Done',     color: 'bg-green-500',  pulse: false },
  error:    { label: 'Error',    color: 'bg-red-500',    pulse: false },
};

export default function Panel() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [goal, setGoal] = useState('');
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [currentMsg, setCurrentMsg] = useState('');
  const [stepIndex, setStepIndex] = useState(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Step[]>([]);
  const stepsEndRef = useRef<HTMLDivElement>(null);

  // Auth check
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'WF_PING' }, (res) => {
      setAuthed(res?.authenticated || false);
      setLoading(false);
    });
  }, []);

  // Connect to background via persistent port for real-time status
  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'wf-panel' });
    port.onMessage.addListener((msg: StatusMsg & { type: string }) => {
      if (msg.type !== 'WF_STATUS') return;

      setStatus(msg.status);
      if (msg.message) setCurrentMsg(msg.message);
      if (msg.stepIndex) setStepIndex(msg.stepIndex);
      if (msg.latencyMs) setLatencyMs(msg.latencyMs);
      if (msg.goal) setGoal(msg.goal);

      if (msg.status === 'guiding' && msg.message) {
        setCompletedSteps((prev) => [
          ...prev,
          { index: msg.stepIndex ?? prev.length + 1, message: msg.message!, latencyMs: msg.latencyMs },
        ]);
      }
      if (msg.status === 'done' || msg.status === 'idle') {
        setRunning(false);
      }
      if (msg.status === 'error') {
        setRunning(false);
      }
    });
    return () => port.disconnect();
  }, []);

  // Auto-scroll steps list
  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [completedSteps]);

  const start = async () => {
    if (!goal.trim()) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    setRunning(true);
    setStatus('thinking');
    setCurrentMsg('Starting…');
    setCompletedSteps([]);
    setStepIndex(1);
    setLatencyMs(null);
    chrome.tabs.sendMessage(tab.id, { type: 'WF_START', goal });
  };

  const stop = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: 'WF_STOP' });
    setRunning(false);
    setStatus('idle');
    setCurrentMsg('');
  };

  const cfg = STATUS_CONFIG[status];

  if (loading) return (
    <div className="flex items-center justify-center h-screen text-slate-400 text-sm">
      Loading…
    </div>
  );

  if (!authed) return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🧭</span>
        <span className="font-bold text-lg text-slate-900">Wayfinder</span>
      </div>
      <p className="text-sm text-slate-500">Sign in to start guided navigation.</p>
      <a
        href={`${import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'}/extension/auth`}
        target="_blank"
        rel="noreferrer"
        className="block w-full text-center bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-medium text-sm transition-colors"
      >
        Sign in
      </a>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-white text-slate-900 text-sm">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧭</span>
          <span className="font-bold text-slate-900">Wayfinder</span>
        </div>
        {/* Live status pill */}
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${cfg.color} ${cfg.pulse ? 'animate-pulse' : ''}`} />
          <span className="text-xs font-medium text-slate-500">{cfg.label}</span>
        </div>
      </div>

      {/* Status bar — visible while running */}
      {running && (
        <div className={`px-4 py-3 border-b border-slate-100 ${
          status === 'thinking' ? 'bg-amber-50' :
          status === 'guiding'  ? 'bg-green-50' :
          status === 'error'    ? 'bg-red-50' : 'bg-slate-50'
        }`}>
          <div className="flex items-start gap-2">
            <span className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${cfg.color} ${cfg.pulse ? 'animate-pulse' : ''}`} />
            <div className="flex-1 min-w-0">
              <p className="font-medium leading-snug text-slate-800">{currentMsg || '…'}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                <span>Step {stepIndex}</span>
                {latencyMs && <span>{latencyMs}ms</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Done banner */}
      {status === 'done' && (
        <div className="mx-4 mt-4 bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-2xl mb-1">🎉</p>
          <p className="font-semibold text-green-800">Goal complete!</p>
        </div>
      )}

      {/* Error banner */}
      {status === 'error' && (
        <div className="mx-4 mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="font-semibold text-red-700 mb-1">Something went wrong</p>
          <p className="text-xs text-red-500">{currentMsg}</p>
        </div>
      )}

      {/* Goal input */}
      <div className="px-4 pt-4">
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Deploy my FastAPI app on AWS…"
          disabled={running}
          rows={3}
          className="w-full p-3 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:bg-slate-50"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) start(); }}
        />
      </div>

      {/* Action button */}
      <div className="px-4 pt-2">
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

      {/* Steps log */}
      {completedSteps.length > 0 && (
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Steps completed
          </p>
          <div className="space-y-2">
            {completedSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-0.5 w-4 h-4 rounded-full bg-green-100 text-green-700 text-xs flex items-center justify-center shrink-0 font-bold">
                  ✓
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-700 leading-snug">{step.message}</p>
                  {step.latencyMs && (
                    <p className="text-xs text-slate-400 mt-0.5">{step.latencyMs}ms</p>
                  )}
                </div>
              </div>
            ))}
            {running && status === 'guiding' && (
              <div className="flex items-start gap-2">
                <span className="mt-0.5 w-4 h-4 rounded-full border-2 border-green-400 animate-pulse shrink-0" />
                <p className="text-slate-500 italic">Waiting for your click…</p>
              </div>
            )}
            {running && status === 'thinking' && (
              <div className="flex items-start gap-2">
                <span className="mt-0.5 w-4 h-4 rounded-full border-2 border-amber-400 animate-pulse shrink-0" />
                <p className="text-slate-500 italic">Thinking…</p>
              </div>
            )}
          </div>
          <div ref={stepsEndRef} />
        </div>
      )}
    </div>
  );
}
