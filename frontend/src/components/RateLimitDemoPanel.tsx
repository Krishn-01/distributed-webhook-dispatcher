import { SpeedIcon, BoltIcon, CheckCircleIcon } from './Icons';

interface RateLimitDemoPanelProps {
  onRunDemo: () => Promise<void>;
  isRunning: boolean;
  stats: { total: number; queued: number; errors: number };
}

export function RateLimitDemoPanel({
  onRunDemo,
  isRunning,
  stats,
}: RateLimitDemoPanelProps) {
  const percent = stats.total > 0 ? Math.round((stats.queued / stats.total) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 sm:p-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Title & Description */}
        <div className="max-w-2xl">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
              <SpeedIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm tracking-tight font-sans flex items-center gap-2">
                <span>Per-Domain Sliding-Window Rate Limiter</span>
                <span className="text-[10px] font-mono font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                  10 req/sec limit
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Atomic Redis Lua script prevents target server overwhelming. Over-limit bursts
                are automatically deferred without consuming retry attempt counts.
              </p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={onRunDemo}
          disabled={isRunning}
          className="px-5 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md shadow-purple-600/20 transition duration-150 flex items-center justify-center gap-2 shrink-0"
        >
          {isRunning ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Bursting 25 Events… ({stats.queued}/{stats.total})</span>
            </>
          ) : (
            <>
              <BoltIcon className="w-4 h-4" />
              <span>Simulate 25-Event Burst</span>
            </>
          )}
        </button>
      </div>

      {/* Progress & Algorithm Metrics Grid */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Metric 1 */}
        <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-100/70 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
            ZSET
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Sliding Window Algorithm
            </span>
            <span className="text-xs font-semibold text-slate-800">
              Redis Sorted Set (1000ms TTL)
            </span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-100/70 text-purple-700 flex items-center justify-center font-bold text-xs shrink-0">
            10/s
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Maximum Throughput
            </span>
            <span className="text-xs font-semibold text-slate-800">
              Per Destination FQDN
            </span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-100/70 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
            0%
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Packet Drop Policy
            </span>
            <span className="text-xs font-semibold text-slate-800">
              Buffered & Deferral Retained
            </span>
          </div>
        </div>
      </div>

      {/* Live Progress Bar when Running or Just Finished */}
      {stats.queued > 0 && (
        <div className="mt-4 p-4 bg-purple-50/70 border border-purple-200/80 rounded-xl">
          <div className="flex items-center justify-between text-xs font-semibold text-purple-900 mb-2">
            <span className="flex items-center gap-1.5">
              <CheckCircleIcon className="w-4 h-4 text-purple-600" />
              Burst Dispatched: {stats.queued} of {stats.total} Webhooks Ingested
            </span>
            <span className="font-mono">{percent}%</span>
          </div>

          <div className="w-full h-2.5 bg-purple-200/60 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>

          <p className="text-[11px] text-purple-700 mt-2 font-medium">
            The worker smoothly dispatches 10 webhooks in the first second and schedules the
            remaining 15 in subsequent 1000ms sliding windows. Inspect the execution below in Recent
            Jobs.
          </p>
        </div>
      )}
    </div>
  );
}
