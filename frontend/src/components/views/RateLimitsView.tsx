import { SpeedIcon, BoltIcon, ShieldCheckIcon } from '../Icons';

interface RateLimitsViewProps {
  onRunDemo: () => Promise<void>;
  isRunning: boolean;
  stats: {
    total: number;
    queued: number;
    errors: number;
  };
}

export function RateLimitsView({ onRunDemo, isRunning, stats }: RateLimitsViewProps) {
  const percentCompleted = Math.round(((stats.queued + stats.errors) / stats.total) * 100);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                10 req / 1000ms Per Domain
              </span>
              <span className="text-slate-400 text-xs">· Redis ZSET Sliding Window</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-1 font-sans">
              Sliding-Window Rate Limiting Engine
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Guarantees strict per-domain throttling without boundary spikes, using Redis sorted sets with millisecond score precision.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-mono font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Active in Worker
            </span>
          </div>
        </div>
      </div>

      {/* 2-Column Grid: Architecture Explanation vs Interactive Burst Tester */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Left: Architecture & Algorithm Comparison */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-2xs flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                <ShieldCheckIcon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm tracking-tight font-sans">
                  Redis ZSET Algorithm Design
                </h3>
                <p className="text-[11px] text-slate-500">
                  Atomic rolling window implementation
                </p>
              </div>
            </div>

            {/* Explanation Points */}
            <div className="space-y-3.5 text-xs text-slate-600">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 space-y-1">
                <span className="font-bold text-slate-900 text-xs block">
                  1. Atomic Redis Key Isolation
                </span>
                <p className="text-[11px] text-slate-500 leading-relaxed font-mono">
                  Key: ratelimit:&#123;destinationDomain&#125;
                </p>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Every webhook destination domain is isolated into its own Redis Sorted Set. Rate limiting on <code>api.stripe.com</code> never blocks jobs directed to <code>hooks.slack.com</code>.
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 space-y-1">
                <span className="font-bold text-slate-900 text-xs block">
                  2. Sliding Window vs Fixed Window
                </span>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Fixed-window and token-bucket algorithms can allow double-bursts (e.g. 10 requests at second 0.99 and 10 more at second 1.01).
                  Our sliding-window purges entries older than <code>now - 1000ms</code> via <code>ZREMRANGEBYSCORE</code>, ensuring that at any arbitrary 1000ms slice, exactly &le; 10 requests occur.
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 space-y-1">
                <span className="font-bold text-slate-900 text-xs block">
                  3. Queue Re-schedule on Limit Hit
                </span>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  When the limit of 10 req/s is reached, the worker does not drop or fail the job. It calculates the exact delay remaining until the earliest slot clears and delays the BullMQ job automatically.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Score: Date.now() (ms)</span>
            <span className="text-indigo-600 font-semibold">Strict 10 req/s SLA</span>
          </div>
        </div>

        {/* Right: Interactive 25-Event Burst Simulator */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-2xs flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                  <SpeedIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm tracking-tight font-sans">
                    25-Event Burst Simulation
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Test live ingestion and Redis rate limiting
                  </p>
                </div>
              </div>

              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-mono text-[11px] font-bold">
                Batch Size: 25
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Dispatches 25 concurrent webhook events to <code>/mock/ok</code> in rapid succession.
              The Express ingestion layer accepts all 25 jobs asynchronously in &lt; 50ms, while the Redis sliding-window worker meters deliveries across consecutive 1-second windows.
            </p>

            {/* Live Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-700">Burst Execution Progress</span>
                <span className="font-mono text-indigo-600 font-bold">{percentCompleted}%</span>
              </div>
              <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden border border-slate-200/60 p-0.5">
                <div
                  style={{ width: `${percentCompleted}%` }}
                  className={`h-full rounded-full transition-all duration-300 ${
                    percentCompleted === 100 ? 'bg-emerald-500' : 'bg-indigo-600'
                  }`}
                />
              </div>
            </div>

            {/* Telemetry Metrics */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Target Batch
                </span>
                <span className="text-xl font-extrabold text-slate-900 font-sans">
                  {stats.total}
                </span>
              </div>

              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                <span className="text-[10px] uppercase font-bold text-emerald-600 block">
                  Queued (202)
                </span>
                <span className="text-xl font-extrabold text-emerald-700 font-sans">
                  {stats.queued}
                </span>
              </div>

              <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-100">
                <span className="text-[10px] uppercase font-bold text-rose-600 block">
                  Errors
                </span>
                <span className="text-xl font-extrabold text-rose-700 font-sans">
                  {stats.errors}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onRunDemo}
              disabled={isRunning}
              className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2"
            >
              <BoltIcon className="w-4 h-4 text-amber-400" />
              <span>
                {isRunning ? 'Dispatching 25 Concurrent Webhooks…' : 'Fire 25-Event Burst Now'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
