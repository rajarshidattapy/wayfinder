import { useState, useEffect, useRef } from 'react';

type StepStatus = 'thinking' | 'active' | 'done';

interface Step {
  index: number;
  message: string;
  status: StepStatus;
  latencyMs?: number;
  action?: string;
}

type RunStatus = 'idle' | 'thinking' | 'reloading' | 'guiding' | 'done' | 'error';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000';

export default function Panel() {
  const [authed, setAuthed]     = useState(false);
  const [loading, setLoading]   = useState(true);
  const [goal, setGoal]         = useState('');
  const [running, setRunning]   = useState(false);
  const [runStatus, setRunStatus] = useState<RunStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [steps, setSteps]       = useState<Step[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auth check
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'WF_PING' }, (res) => {
      setAuthed(res?.authenticated || false);
      setLoading(false);
    });
  }, []);

  // Real-time updates via persistent port
  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'wf-panel' });

    port.onMessage.addListener((msg: Record<string, unknown>) => {
      const status = msg.status as string;
      const stepIndex = (msg.stepIndex as number) ?? 0;
      const message = (msg.message as string) ?? '';
      const latencyMs = msg.latencyMs as number | undefined;
      const action = msg.action as string | undefined;

      if (msg.type === 'WF_STATUS') {
        if (status === 'thinking') {
          setRunStatus((msg.message as string | undefined)?.includes('Refreshing') ? 'reloading' : 'thinking');
          // Add a new "thinking" placeholder for this step
          setSteps((prev) => {
            // If there's already a thinking step, don't duplicate
            const last = prev[prev.length - 1];
            if (last?.status === 'thinking') return prev;
            return [...prev, { index: stepIndex, message: 'Analyzing page…', status: 'thinking' }];
          });
        }

        if (status === 'guiding') {
          setRunStatus('guiding');
          // Replace the thinking placeholder with the real instruction
          setSteps((prev) => {
            const updated = [...prev];
            const thinkingIdx = updated.findLastIndex((s) => s.status === 'thinking');
            if (thinkingIdx !== -1) {
              updated[thinkingIdx] = {
                index: stepIndex,
                message,
                status: 'active',
                latencyMs,
                action,
              };
            } else {
              updated.push({ index: stepIndex, message, status: 'active', latencyMs, action });
            }
            return updated;
          });
        }

        if (status === 'step-done') {
          // Mark the active step as done
          setSteps((prev) => {
            const updated = [...prev];
            const activeIdx = updated.findLastIndex((s) => s.status === 'active');
            if (activeIdx !== -1) updated[activeIdx] = { ...updated[activeIdx], status: 'done' };
            return updated;
          });
        }

        if (status === 'done') {
          setRunStatus('done');
          setRunning(false);
          // Mark last active step done
          setSteps((prev) => {
            const updated = [...prev];
            const activeIdx = updated.findLastIndex((s) => s.status === 'active' || s.status === 'thinking');
            if (activeIdx !== -1) updated[activeIdx] = { ...updated[activeIdx], status: 'done' };
            return updated;
          });
        }

        if (status === 'idle') {
          setRunStatus('idle');
          setRunning(false);
        }

        if (status === 'error') {
          setRunStatus('error');
          setErrorMsg(message);
          setRunning(false);
          setSteps((prev) => {
            const updated = [...prev];
            const idx = updated.findLastIndex((s) => s.status === 'thinking' || s.status === 'active');
            if (idx !== -1) updated.splice(idx, 1); // remove stuck step
            return updated;
          });
        }
      }
    });

    return () => port.disconnect();
  }, []);

  // Auto-scroll as steps appear
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  const start = async () => {
    if (!goal.trim()) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    setRunning(true);
    setRunStatus('thinking');
    setSteps([]);
    setErrorMsg('');
    // Background owns the session — it stores state and forwards to content
    chrome.runtime.sendMessage({ type: 'WF_START', goal, tabId: tab.id });
  };

  const stop = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    // Background clears session and tells content to stop
    chrome.runtime.sendMessage({ type: 'WF_STOP', tabId: tab.id });
    setRunning(false);
    setRunStatus('idle');
    setSteps((prev) => prev.map((s) =>
      s.status === 'thinking' || s.status === 'active' ? { ...s, status: 'done' } : s
    ));
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen text-slate-400 text-sm">Loading…</div>
  );

  if (!authed) return (
    <div className="p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xl">🧭</span>
        <span className="font-bold text-slate-900">Wayfinder</span>
      </div>
      <p className="text-sm text-slate-500">Sign in to start guided navigation.</p>
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

  const doneCount = steps.filter((s) => s.status === 'done').length;

  return (
    <div className="flex flex-col h-screen bg-white text-sm text-slate-900">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base">🧭</span>
          <span className="font-bold">Wayfinder</span>
        </div>
        <StatusPill status={runStatus} />
      </div>

      {/* ── Goal input ── */}
      <div className="px-4 pt-3 pb-2 shrink-0 border-b border-slate-100">
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Deploy my FastAPI app on AWS…"
          disabled={running}
          rows={2}
          className="w-full p-2.5 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:bg-slate-50"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) start(); }}
        />
        <div className="mt-2">
          {running ? (
            <button onClick={stop} className="w-full bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg font-medium text-sm transition-colors">
              Stop
            </button>
          ) : (
            <button onClick={start} disabled={!goal.trim()} className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2 rounded-lg font-medium text-sm transition-colors">
              Start guiding me →
            </button>
          )}
        </div>
      </div>

      {/* ── Steps log ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3">

        {/* Done banner */}
        {runStatus === 'done' && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <p className="text-xl mb-0.5">🎉</p>
            <p className="font-semibold text-green-800 text-sm">Goal complete!</p>
            <p className="text-xs text-green-600 mt-0.5">{doneCount} steps</p>
          </div>
        )}

        {/* Error banner */}
        {runStatus === 'error' && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="font-semibold text-red-700 text-xs mb-0.5">Something went wrong</p>
            <p className="text-xs text-red-500 break-words">{errorMsg}</p>
          </div>
        )}

        {/* Step list */}
        {steps.length === 0 && !running && (
          <p className="text-slate-400 text-xs text-center pt-6">
            Steps will appear here as Wayfinder guides you.
          </p>
        )}

        <div className="space-y-2">
          {steps.map((step, i) => (
            <StepRow key={i} step={step} />
          ))}
        </div>

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function StepRow({ step }: { step: Step }) {
  return (
    <div className={`flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors ${
      step.status === 'active'   ? 'bg-green-50 border border-green-200' :
      step.status === 'thinking' ? 'bg-amber-50 border border-amber-200' :
      'bg-slate-50 border border-transparent'
    }`}>
      {/* Icon */}
      <div className="mt-0.5 shrink-0">
        {step.status === 'done' && (
          <span className="w-5 h-5 rounded-full bg-green-100 text-green-700 text-xs flex items-center justify-center font-bold">✓</span>
        )}
        {step.status === 'active' && (
          <span className="w-5 h-5 rounded-full bg-green-500 animate-pulse flex items-center justify-center">
            <span className="w-2 h-2 rounded-full bg-white" />
          </span>
        )}
        {step.status === 'thinking' && (
          <span className="w-5 h-5 rounded-full bg-amber-400 animate-pulse flex items-center justify-center">
            <span className="w-2 h-2 rounded-full bg-white" />
          </span>
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold text-slate-400">Step {step.index || '?'}</span>
          {step.action && step.status !== 'thinking' && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">
              {step.action}
            </span>
          )}
        </div>
        <p className={`text-sm leading-snug mt-0.5 ${
          step.status === 'thinking' ? 'text-amber-700 italic' :
          step.status === 'active'   ? 'text-green-800 font-medium' :
          'text-slate-600'
        }`}>
          {step.message}
        </p>
        {step.latencyMs && step.status === 'done' && (
          <p className="text-xs text-slate-400 mt-0.5">{step.latencyMs}ms</p>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: RunStatus }) {
  const map: Record<RunStatus, { label: string; cls: string; pulse: boolean }> = {
    idle:      { label: 'Ready',      cls: 'bg-slate-100 text-slate-500',  pulse: false },
    thinking:  { label: 'Thinking',   cls: 'bg-amber-100 text-amber-700',  pulse: true  },
    reloading: { label: 'Reloading',  cls: 'bg-blue-100 text-blue-700',    pulse: true  },
    guiding:   { label: 'Guiding',    cls: 'bg-green-100 text-green-700',  pulse: true  },
    done:      { label: 'Done',       cls: 'bg-green-100 text-green-700',  pulse: false },
    error:     { label: 'Error',      cls: 'bg-red-100 text-red-600',      pulse: false },
  };
  const { label, cls, pulse } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        status === 'thinking'  ? 'bg-amber-500' :
        status === 'reloading' ? 'bg-blue-500'  :
        status === 'guiding'   ? 'bg-green-500' :
        status === 'done'      ? 'bg-green-500' :
        status === 'error'     ? 'bg-red-500'   : 'bg-slate-400'
      } ${pulse ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  );
}
