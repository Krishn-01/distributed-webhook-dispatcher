import { useState } from 'react';
import {
  SendIcon,
  DiceIcon,
  CodeIcon,
  CopyIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  ArrowUpRightIcon,
} from '../Icons';
import type { DispatchResponse } from '../../api/webhooks';

interface WebhooksViewProps {
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

export function WebhooksView({
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
}: WebhooksViewProps) {
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
      description: 'Retries 3 times with 2s, 4s, 8s exponential backoff',
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

  const isConflict =
    dispatchError &&
    (dispatchError.toLowerCase().includes('already exists') ||
      dispatchError.toLowerCase().includes('conflict') ||
      dispatchError.toLowerCase().includes('idempotent'));

  const payloadByteSize = new Blob([payloadText]).size;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                POST /api/webhooks/dispatch
              </span>
              <span className="text-slate-400 text-xs">· HTTP 202 Accepted</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-1 font-sans">
              Webhook Dispatch Studio
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Submit events to the asynchronous BullMQ queue. Ingestion responds immediately in under 35ms while background workers handle delivery.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-semibold text-slate-600">
              SLA: &lt; 35ms Ingestion
            </span>
          </div>
        </div>
      </div>

      {/* Main Dispatch Form Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-8 shadow-2xs space-y-6">
        {/* Preset Selector Buttons */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 font-sans">
            Quick Test Presets
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handleApplyPreset(preset.url)}
                className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-indigo-300 hover:shadow-xs transition text-left flex flex-col justify-between group"
              >
                <div>
                  <span className="text-xs font-semibold text-slate-800 block truncate group-hover:text-indigo-600">
                    {preset.label}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                    {preset.description}
                  </p>
                </div>
                <span
                  className={`mt-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${preset.badgeClass}`}
                >
                  {preset.badge}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Destination URL Input */}
        <div>
          <label
            htmlFor="destinationUrl"
            className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 font-sans"
          >
            Destination Webhook URL <span className="text-rose-500">*</span>
          </label>
          <div className="flex items-stretch rounded-xl border border-slate-300 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 overflow-hidden shadow-2xs bg-white">
            <span className="px-3.5 py-2.5 bg-slate-100 text-slate-700 text-xs font-mono font-bold flex items-center border-r border-slate-300 select-none">
              POST
            </span>
            <input
              id="destinationUrl"
              type="url"
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
              placeholder="https://example.com/api/webhook"
              className="flex-1 px-3.5 py-2.5 text-xs font-mono text-slate-900 focus:outline-none bg-white"
            />
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Validated against SSRF attacks (private IPv4/IPv6 CIDR ranges blocked in production).
          </p>
        </div>

        {/* Event ID with Dice Generator */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              htmlFor="eventId"
              className="text-xs font-bold uppercase tracking-wider text-slate-700 font-sans"
            >
              Event ID (Idempotency Key) <span className="text-rose-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onCopyText(eventId, 'Event ID')}
                className="text-[11px] text-slate-500 hover:text-indigo-600 font-medium flex items-center gap-1"
              >
                <CopyIcon className="w-3.5 h-3.5" />
                <span>Copy</span>
              </button>
              <button
                type="button"
                onClick={() => setEventId(onGenerateEventId())}
                className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100 transition"
              >
                <DiceIcon className="w-3.5 h-3.5" />
                <span>Generate Unique</span>
              </button>
            </div>
          </div>
          <input
            id="eventId"
            type="text"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="w-full px-3.5 py-2.5 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-2xs"
          />
        </div>

        {/* JSON Payload Editor */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              htmlFor="payloadText"
              className="text-xs font-bold uppercase tracking-wider text-slate-700 font-sans"
            >
              JSON Request Payload <span className="text-rose-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-400">
                {payloadByteSize} bytes
              </span>
              <button
                type="button"
                onClick={handleFormatJson}
                className="text-[11px] text-slate-600 hover:text-indigo-600 font-medium flex items-center gap-1 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200 transition"
              >
                <CodeIcon className="w-3 h-3" />
                <span>Format JSON</span>
              </button>
            </div>
          </div>
          <div className="relative rounded-xl border border-slate-300 focus-within:ring-2 focus-within:ring-indigo-500 overflow-hidden shadow-2xs">
            <textarea
              id="payloadText"
              rows={8}
              value={payloadText}
              onChange={(e) => {
                setPayloadText(e.target.value);
                setJsonFormatError(null);
              }}
              className="w-full p-3.5 font-mono text-xs bg-slate-950 text-emerald-400 focus:outline-none resize-y leading-relaxed"
              spellCheck={false}
            />
          </div>
          {jsonFormatError && (
            <p className="mt-1.5 text-xs text-rose-600 font-medium">
              {jsonFormatError}
            </p>
          )}
        </div>

        {/* Dispatch Action Button */}
        <div>
          <button
            type="button"
            onClick={onDispatch}
            disabled={dispatchLoading}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md shadow-indigo-600/30 transition flex items-center justify-center gap-2"
          >
            <SendIcon className="w-4 h-4" />
            <span>
              {dispatchLoading ? 'Enqueuing to BullMQ…' : 'Dispatch Webhook (Non-blocking)'}
            </span>
          </button>
        </div>

        {/* Conflict / Idempotency Warning (HTTP 409) */}
        {isConflict && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start justify-between gap-3 text-xs text-amber-900">
            <div className="flex items-start gap-2.5">
              <AlertTriangleIcon className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">409 Conflict: Idempotency Key Already Exists</span>
                <span className="text-amber-800 text-[11px]">
                  An event with ID &quot;{eventId}&quot; was previously registered with a different payload.
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                setEventId(onGenerateEventId());
              }}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg text-xs shrink-0 transition"
            >
              Generate New ID
            </button>
          </div>
        )}

        {/* Generic Error Warning */}
        {dispatchError && !isConflict && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
            <AlertTriangleIcon className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Dispatch Failed</span>
              <span className="text-[11px]">{dispatchError}</span>
            </div>
          </div>
        )}

        {/* Success Response Banner (HTTP 202 Accepted) */}
        {dispatchResult && (
          <div className="p-5 bg-emerald-50 border border-emerald-200/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                <CheckCircleIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
                    202 Accepted · Enqueued Immediately
                  </span>
                  {dispatchElapsed !== null && (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold rounded-md">
                      {dispatchElapsed}ms
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs font-mono text-emerald-800">
                  <span>Job ID:</span>
                  <span className="font-bold">{dispatchResult.jobId}</span>
                  <button
                    type="button"
                    onClick={() => onCopyText(dispatchResult.jobId, 'Job ID')}
                    className="text-emerald-700 hover:text-emerald-950 transition"
                    title="Copy Job ID"
                  >
                    <CopyIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onInspectJob(dispatchResult.jobId)}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 shrink-0"
            >
              <span>Track in Deliveries</span>
              <ArrowUpRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

