import { useState } from 'react';
import {
  SendIcon,
  DiceIcon,
  CodeIcon,
  CopyIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
} from './Icons';
import type { DispatchResponse } from '../api/webhooks';

interface SendWebhookPanelProps {
  destinationUrl: string;
  setDestinationUrl: (url: string) => void;
  eventId: string;
  setEventId: (id: string) => void;
  onGenerateEventId: () => string;
  payloadText: string;
  setPayloadText: (text: string) => void;
  onDispatch: () => Promise<void>;
  dispatchLoading: boolean;
  dispatchResult: DispatchResponse | null;
  dispatchElapsed: number | null;
  dispatchError: string | null;
  onInspectJob: (jobId: string) => void;
  getOrigin: () => string;
  onCopyText: (text: string, label: string) => void;
}

export function SendWebhookPanel({
  destinationUrl,
  setDestinationUrl,
  eventId,
  setEventId,
  onGenerateEventId,
  payloadText,
  setPayloadText,
  onDispatch,
  dispatchLoading,
  dispatchResult,
  dispatchElapsed,
  dispatchError,
  onInspectJob,
  getOrigin,
  onCopyText,
}: SendWebhookPanelProps) {
  const [jsonFormatError, setJsonFormatError] = useState<string | null>(null);

  const presets = [
    {
      label: 'Success (200 OK)',
      url: `${getOrigin()}/mock/ok`,
      badge: '200 OK',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      description: 'Clean instant delivery on attempt 1',
    },
    {
      label: 'Permanent Fail (500)',
      url: `${getOrigin()}/mock/fail`,
      badge: '4 Attempts',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
      description: 'Retries 3 times with 2s, 4s, 8s backoff',
    },
    {
      label: 'Flaky Receiver',
      url: () => `${getOrigin()}/mock/flaky?key=${onGenerateEventId()}`,
      badge: '500x2 → 200',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
      description: 'Fails twice, recovers on 3rd attempt',
    },
    {
      label: 'Slow Latency (10s)',
      url: `${getOrigin()}/mock/slow`,
      badge: 'Async 202',
      badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
      description: 'Non-blocking ingestion returned in <30ms',
    },
    {
      label: 'Rate Limited (429)',
      url: `${getOrigin()}/mock/ratelimit`,
      badge: 'Retry-After: 2',
      badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
      description: 'Worker respects Retry-After response header',
    },
  ];

  const handleApplyPreset = (presetUrl: string | (() => string)) => {
    const url = typeof presetUrl === 'function' ? presetUrl() : presetUrl;
    setDestinationUrl(url);
    setEventId(onGenerateEventId());
  };

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(payloadText);
      setPayloadText(JSON.stringify(parsed, null, 2));
      setJsonFormatError(null);
    } catch {
      setJsonFormatError('Cannot format: Invalid JSON syntax.');
    }
  };

  const handlePayloadChange = (val: string) => {
    setPayloadText(val);
    try {
      JSON.parse(val);
      setJsonFormatError(null);
    } catch {
      setJsonFormatError('Syntax error: Incomplete or invalid JSON');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 sm:p-6 flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <SendIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm tracking-tight font-sans">
                Send Webhook
              </h3>
              <p className="text-[11px] text-slate-500">
                Non-blocking HTTP 202 Ingestion Pipeline
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 font-semibold">
            POST /api/webhooks/dispatch
          </span>
        </div>

        {/* Presets Grid */}
        <div className="mt-4">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            Quick Test Presets (Mock Receivers)
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {presets.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleApplyPreset(p.url)}
                className="text-left p-2.5 rounded-xl border border-slate-200/80 hover:border-indigo-300 hover:bg-indigo-50/30 transition group flex flex-col justify-between gap-1 shadow-2xs"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-semibold text-slate-800 group-hover:text-indigo-600 transition">
                    {p.label}
                  </span>
                  <span
                    className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md border ${p.badgeClass}`}
                  >
                    {p.badge}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 line-clamp-1">
                  {p.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Destination URL */}
        <div className="mt-4">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Destination URL <span className="text-rose-500">*</span>
          </label>
          <div className="flex rounded-xl shadow-2xs border border-slate-300 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500">
            <span className="inline-flex items-center px-3 bg-slate-100 text-slate-600 font-mono text-xs font-bold border-r border-slate-300">
              POST
            </span>
            <input
              type="text"
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
              placeholder="https://your-domain.com/webhook"
              className="flex-1 px-3 py-2.5 text-xs font-mono text-slate-900 bg-white focus:outline-none"
            />
          </div>
        </div>

        {/* Event ID (Idempotency Key) */}
        <div className="mt-3.5">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Idempotency Key (<code className="text-indigo-600 font-mono">eventId</code>)
            </label>
            <span className="text-[11px] text-slate-400">Guarantees exactly-once queuing</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              placeholder="e.g. evt_94819a"
              className="flex-1 px-3 py-2 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setEventId(onGenerateEventId())}
              className="px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition flex items-center gap-1.5 shrink-0"
              title="Generate Random UUID / Event ID"
            >
              <DiceIcon className="w-3.5 h-3.5 text-slate-600" />
              <span>Generate</span>
            </button>
          </div>
        </div>

        {/* JSON Payload Editor */}
        <div className="mt-3.5">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <span>JSON Payload</span>
              {jsonFormatError ? (
                <span className="text-[10px] text-rose-600 font-medium flex items-center gap-1">
                  <AlertTriangleIcon className="w-3 h-3" />
                  Invalid JSON
                </span>
              ) : (
                <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                  <CheckCircleIcon className="w-3 h-3" />
                  Valid Syntax
                </span>
              )}
            </label>
            <button
              type="button"
              onClick={handleFormatJson}
              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition flex items-center gap-1"
            >
              <CodeIcon className="w-3 h-3" />
              <span>Format JSON</span>
            </button>
          </div>

          <div className="relative rounded-xl border border-slate-300 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500">
            <textarea
              value={payloadText}
              onChange={(e) => handlePayloadChange(e.target.value)}
              rows={5}
              spellCheck={false}
              className="w-full p-3 font-mono text-xs bg-slate-900 text-emerald-400 focus:outline-none leading-relaxed"
            />
          </div>
          {jsonFormatError && (
            <p className="text-[11px] text-rose-600 mt-1 font-medium">{jsonFormatError}</p>
          )}
        </div>
      </div>

      {/* Action & Result */}
      <div className="mt-5 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onDispatch}
          disabled={dispatchLoading || !!jsonFormatError}
          className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md shadow-indigo-600/25 transition duration-150 flex items-center justify-center gap-2"
        >
          {dispatchLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Buffering in Redis Queue…</span>
            </>
          ) : (
            <>
              <SendIcon className="w-4 h-4" />
              <span>Dispatch Webhook (Non-Blocking)</span>
            </>
          )}
        </button>

        {/* Error Alert */}
        {dispatchError && (
          <div className="mt-3 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5">
            <AlertTriangleIcon className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Dispatch Failed</p>
              <p className="mt-0.5 text-rose-700">{dispatchError}</p>
            </div>
          </div>
        )}

        {/* Success Alert */}
        {dispatchResult && (
          <div className="mt-3 p-4 bg-emerald-50/90 border border-emerald-200 rounded-xl text-xs text-emerald-950 flex flex-col gap-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-800 flex items-center gap-1.5">
                <CheckCircleIcon className="w-4 h-4 text-emerald-600" />
                HTTP 202 Accepted in {dispatchElapsed}ms
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200 text-emerald-800 uppercase">
                {dispatchResult.status}
              </span>
            </div>

            <div className="flex items-center justify-between bg-white/80 border border-emerald-200/60 rounded-lg p-2 font-mono text-[11px]">
              <span className="text-slate-600">Job ID:</span>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900">{dispatchResult.jobId}</span>
                <button
                  type="button"
                  onClick={() => onCopyText(dispatchResult.jobId, 'Job ID')}
                  className="p-1 text-slate-400 hover:text-indigo-600 rounded transition"
                  title="Copy Job ID"
                >
                  <CopyIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1">
              <span>Delivery is running in background worker.</span>
              <button
                type="button"
                onClick={() => onInspectJob(dispatchResult.jobId)}
                className="font-bold text-indigo-600 hover:text-indigo-800 underline underline-offset-2"
              >
                Inspect Live Timeline →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

