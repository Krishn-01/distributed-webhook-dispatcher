import { useState } from 'react';
import {
  RefreshIcon,
  CopyIcon,
  CheckCircleIcon,
  XCircleIcon,
  CodeIcon,
} from '../Icons';
import type { HealthResponse } from '../../api/webhooks';

interface SystemHealthViewProps {
  health: HealthResponse | null;
  healthLoading: boolean;
  onRefreshHealth: () => void;
  onCopyText: (text: string, label: string) => void;
}

export function SystemHealthView({
  health,
  healthLoading,
  onRefreshHealth,
  onCopyText,
}: SystemHealthViewProps) {
  const [showJson, setShowJson] = useState(false);

  const isHealthy = health?.status === 'healthy' || health?.status === 'ok';
  const apiHealthy = isHealthy || health?.services?.api === 'up' || health?.services?.api === 'healthy';
  const dbStatus = health?.services?.database || (isHealthy ? 'connected' : 'disconnected');
  const redisStatus = health?.services?.redis || (isHealthy ? 'connected' : 'disconnected');
  const workerActive = isHealthy && redisStatus === 'connected';

  const components = [
    {
      name: 'Express HTTP API Server',
      status: apiHealthy ? 'HEALTHY' : 'DEGRADED',
      healthy: apiHealthy,
      port: '3000',
      description: 'Non-blocking ingestion layer with JSON validation and route handlers.',
      details: [
        { label: 'Latency SLA', value: '< 35ms non-blocking' },
        { label: 'SSRF Protection', value: 'DNS Pinning & Private CIDR Filter' },
        { label: 'HTTP Status', value: apiHealthy ? '200 OK / 202 Accepted' : 'Service Unavailable' },
        { label: 'CORS', value: 'Enabled for cross-origin webhooks' },
      ],
    },
    {
      name: 'PostgreSQL Database',
      status: dbStatus.toUpperCase(),
      healthy: dbStatus === 'connected',
      port: '5432',
      description: 'Persistent audit store managed via Prisma ORM for events and delivery attempts.',
      details: [
        { label: 'ORM Engine', value: 'Prisma Client 5.x' },
        { label: 'Tables', value: 'WebhookEvent, DeliveryAttempt' },
        { label: 'State Sync', value: 'ACID transactional updates' },
        { label: 'Connection', value: dbStatus },
      ],
    },
    {
      name: 'Redis In-Memory Broker',
      status: redisStatus.toUpperCase(),
      healthy: redisStatus === 'connected',
      port: '6379',
      description: 'Backing store for BullMQ asynchronous job queue and rate limiting sliding windows.',
      details: [
        { label: 'Queue Engine', value: 'BullMQ 5.x' },
        { label: 'Rate Limiter', value: 'Redis Sorted Sets (ZSET)' },
        { label: 'Connection Pool', value: 'ioredis connection' },
        { label: 'Connection', value: redisStatus },
      ],
    },
    {
      name: 'BullMQ Delivery Worker',
      status: workerActive ? 'ACTIVE' : 'DEGRADED',
      healthy: workerActive,
      port: 'Embedded / Worker Container',
      description: 'Autonomous worker executing HTTP POST dispatches with exponential backoff.',
      details: [
        { label: 'Concurrency', value: '5 concurrent workers' },
        { label: 'Backoff Strategy', value: 'Exponential (2s, 4s, 8s)' },
        { label: 'Max Retries', value: '3 retries (4 attempts total)' },
        { label: 'Queue Status', value: workerActive ? 'Worker polling Redis queue' : 'Worker queue disconnected' },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                GET /health
              </span>
              <span className="text-slate-400 text-xs">· Real-Time Diagnostics</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-1 font-sans">
              System Health & Diagnostics
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Active probes inspecting Express API, PostgreSQL database, Redis connection, and BullMQ worker pipeline.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onRefreshHealth}
              disabled={healthLoading}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition shadow-xs flex items-center gap-2"
            >
              <RefreshIcon className={`w-3.5 h-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
              <span>{healthLoading ? 'Probing…' : 'Run Diagnostics'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Core Component Diagnostic Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {components.map((comp) => (
          <div
            key={comp.name}
            className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-2xs space-y-4 hover:border-slate-300 transition"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center border ${
                    comp.healthy
                      ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                      : 'bg-rose-50 border-rose-100 text-rose-600'
                  }`}
                >
                  {comp.healthy ? (
                    <CheckCircleIcon className="w-4 h-4" />
                  ) : (
                    <XCircleIcon className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm tracking-tight font-sans">
                    {comp.name}
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Port: {comp.port}
                  </span>
                </div>
              </div>

              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold font-mono border ${
                  comp.healthy
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}
              >
                {comp.status}
              </span>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              {comp.description}
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              {comp.details.map((d) => (
                <div
                  key={d.label}
                  className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/60"
                >
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    {d.label}
                  </span>
                  <span className="text-slate-800 font-semibold font-mono text-[11px] truncate block">
                    {d.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Raw Health JSON Response */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CodeIcon className="w-4 h-4 text-slate-500" />
            <h3 className="font-bold text-slate-900 text-sm tracking-tight font-sans">
              Raw Health Endpoint Output (/health)
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                onCopyText(JSON.stringify(health, null, 2), 'Health JSON')
              }
              className="text-xs text-slate-600 hover:text-indigo-600 font-medium flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 transition"
            >
              <CopyIcon className="w-3.5 h-3.5" />
              <span>Copy JSON</span>
            </button>
            <button
              onClick={() => setShowJson(!showJson)}
              className="text-xs text-indigo-600 font-semibold hover:text-indigo-700 transition"
            >
              {showJson ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>

        {showJson && (
          <div className="rounded-xl border border-slate-300 overflow-hidden">
            <pre className="p-4 bg-slate-950 text-emerald-400 font-mono text-xs overflow-x-auto leading-relaxed">
              {JSON.stringify(health || { message: 'Probing health endpoint…' }, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
