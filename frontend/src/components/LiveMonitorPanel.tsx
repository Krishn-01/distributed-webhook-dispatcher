import { useState } from 'react';
import {
  ActivityIcon,
  CopyIcon,
  ClockIcon,
  AlertTriangleIcon,
  CodeIcon,
} from './Icons';
import { StatusBadge } from './StatusBadge';
import type { JobStatusResponse, DeliveryAttempt } from '../api/webhooks';

interface LiveMonitorPanelProps {
  activeJobId: string;
  setActiveJobId: (id: string) => void;
  onTrackJob: (id: string) => void;
  jobStatus: JobStatusResponse | null;
  attempts: DeliveryAttempt[];
  watchLoading: boolean;
  watchError: string | null;
  onCopyText: (text: string, label: string) => void;
}

export function LiveMonitorPanel({
  activeJobId,
  setActiveJobId,
  onTrackJob,
  jobStatus,
  attempts,
  watchLoading,
  watchError,
  onCopyText,
}: LiveMonitorPanelProps) {
  const [showRawJson, setShowRawJson] = useState(false);

  const isTerminal =
    jobStatus?.status === 'DELIVERED' || jobStatus?.status === 'FAILED';

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 sm:p-6 flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
              <ActivityIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm tracking-tight font-sans">
                Live Delivery Monitor
              </h3>
              <p className="text-[11px] text-slate-500">
                Real-time WebSocket/Polling Timeline (1s Polling)
              </p>
            </div>
          </div>

          {activeJobId && (
            <div className="flex items-center gap-2 text-xs font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  isTerminal
                    ? 'bg-slate-300'
                    : 'bg-indigo-500 animate-ping shrink-0'
                }`}
              />
              <span className="text-[11px] text-slate-500">
                {isTerminal ? 'Completed' : 'Streaming'}
              </span>
            </div>
          )}
        </div>

        {/* Search Job ID Bar */}
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={activeJobId}
            onChange={(e) => setActiveJobId(e.target.value)}
            placeholder="Enter Job ID (e.g. job_12345678)..."
            className="flex-1 px-3.5 py-2 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onTrackJob(activeJobId)}
            disabled={!activeJobId.trim() || watchLoading}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-xs shrink-0"
          >
            {watchLoading ? 'Fetching…' : 'Track Job'}
          </button>
        </div>

        {/* Watch Error Alert */}
        {watchError && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangleIcon className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{watchError}</span>
          </div>
        )}

        {/* Job Details Card */}
        {jobStatus ? (
          <div className="mt-4 space-y-4">
            {/* Real-time Status Card */}
            <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Execution State
                </span>
                <StatusBadge status={jobStatus.status} />
              </div>

              {/* 4-Column Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-t border-slate-200/60 pt-3">
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                    Job ID
                  </span>
                  <div className="flex items-center gap-1 font-mono font-bold text-slate-900 text-[11px] truncate">
                    <span>{jobStatus.jobId}</span>
                    <button
                      type="button"
                      onClick={() => onCopyText(jobStatus.jobId, 'Job ID')}
                      className="text-slate-400 hover:text-indigo-600 transition"
                      title="Copy Job ID"
                    >
                      <CopyIcon className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                    Event ID
                  </span>
                  <div className="flex items-center gap-1 font-mono text-slate-700 text-[11px] truncate">
                    <span>{jobStatus.eventId}</span>
                    <button
                      type="button"
                      onClick={() => onCopyText(jobStatus.eventId, 'Event ID')}
                      className="text-slate-400 hover:text-indigo-600 transition"
                      title="Copy Event ID"
                    >
                      <CopyIcon className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                    Target Domain
                  </span>
                  <span className="font-mono text-slate-800 font-semibold text-[11px] truncate block">
                    {jobStatus.destinationDomain}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                    Attempts
                  </span>
                  <span className="font-mono font-bold text-slate-900 text-[11px]">
                    {jobStatus.attemptCount} of 4 max
                  </span>
                </div>
              </div>
            </div>

            {/* Delivery Attempt Timeline */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Attempt History ({attempts.length})
                </h4>
                <span className="text-[11px] text-slate-400 font-mono">
                  Max 3 retries (2s, 4s, 8s)
                </span>
              </div>

              {attempts.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  Awaiting initial delivery attempt from worker…
                </div>
              ) : (
                <div className="space-y-2.5 relative before:absolute before:top-3 before:bottom-3 before:left-4 before:w-0.5 before:bg-slate-200">
                  {attempts.map((att, idx) => {
                    // Compute backoff gap since prior attempt
                    let gapLabel = 'Initial Delivery';
                    if (idx > 0) {
                      const prevTime = new Date(attempts[idx - 1].createdAt).getTime();
                      const currTime = new Date(att.createdAt).getTime();
                      const diffSec = ((currTime - prevTime) / 1000).toFixed(1);
                      gapLabel = `+${diffSec}s Backoff Gap`;
                    }

                    const isSuccess = att.status === 'SUCCESS';
                    const isRetrying = att.status === 'RETRYING';

                    return (
                      <div
                        key={att.attemptNumber}
                        className="relative pl-9 flex flex-col sm:flex-row sm:items-center justify-between bg-white border border-slate-200/90 rounded-xl p-3 text-xs shadow-2xs hover:border-slate-300 transition gap-2"
                      >
                        {/* Timeline Circle */}
                        <div
                          className={`absolute left-2.5 top-3.5 w-3.5 h-3.5 rounded-full border-2 bg-white flex items-center justify-center ${
                            isSuccess
                              ? 'border-emerald-500 bg-emerald-50'
                              : isRetrying
                              ? 'border-orange-500 bg-orange-50'
                              : 'border-rose-500 bg-rose-50'
                          }`}
                        >
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${
                              isSuccess
                                ? 'bg-emerald-500'
                                : isRetrying
                                ? 'bg-orange-500'
                                : 'bg-rose-500'
                            }`}
                          />
                        </div>

                        {/* Left Details */}
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="font-mono font-bold text-slate-800 text-xs">
                            Attempt #{att.attemptNumber}
                          </span>
                          <StatusBadge status={att.status} size="sm" />
                          <span className="font-mono text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                            HTTP {att.responseCode || 'ERR'}
                          </span>
                        </div>

                        {/* Right Details */}
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                          <span className="font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold">
                            {gapLabel}
                          </span>
                          <span className="font-mono font-semibold text-slate-700">
                            {att.durationMs}ms
                          </span>
                          <span className="text-slate-400">
                            {new Date(att.createdAt).toLocaleTimeString()}
                          </span>
                        </div>

                        {/* Optional Error Message */}
                        {att.errorMessage && (
                          <div className="w-full mt-1.5 pt-1.5 border-t border-slate-100 text-[11px] text-rose-700 font-mono">
                            Error: {att.errorMessage}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-8 py-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2">
            <ClockIcon className="w-8 h-8 text-slate-300" />
            <p className="text-xs font-medium text-slate-600">
              No active job currently loaded
            </p>
            <p className="text-[11px] text-slate-400 max-w-xs">
              Dispatch a webhook from the left panel or click any job in the Recent
              Jobs table below to inspect its real-time retry timeline.
            </p>
          </div>
        )}
      </div>

      {/* Raw JSON Accordion */}
      {jobStatus && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowRawJson(!showRawJson)}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition flex items-center gap-1.5"
            >
              <CodeIcon className="w-3.5 h-3.5" />
              <span>{showRawJson ? 'Hide Raw Details' : 'View Raw Payload & Details'}</span>
            </button>

            {showRawJson && (
              <button
                type="button"
                onClick={() =>
                  onCopyText(
                    JSON.stringify({ jobStatus, attempts }, null, 2),
                    'Raw JSON'
                  )
                }
                className="text-[11px] text-slate-500 hover:text-slate-800 transition flex items-center gap-1"
              >
                <CopyIcon className="w-3 h-3" />
                <span>Copy JSON</span>
              </button>
            )}
          </div>

          {showRawJson && (
            <pre className="mt-2.5 p-3 bg-slate-900 text-emerald-400 text-[10px] font-mono rounded-xl overflow-x-auto max-h-48 border border-slate-800 shadow-inner">
              {JSON.stringify({ jobStatus, attempts }, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
