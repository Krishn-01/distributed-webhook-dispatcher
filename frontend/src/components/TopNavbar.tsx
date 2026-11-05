import { MenuIcon, RefreshIcon, DocsIcon } from './Icons';
import type { HealthResponse } from '../api/webhooks';

interface TopNavbarProps {
  onToggleSidebar: () => void;
  health: HealthResponse | null;
  healthLoading: boolean;
  onRefreshHealth: () => void;
  activeTabTitle: string;
  activeTabId: string;
}

export function TopNavbar({
  onToggleSidebar,
  health,
  healthLoading,
  onRefreshHealth,
  activeTabTitle,
  activeTabId,
}: TopNavbarProps) {
  const isHealthy = health?.status === 'healthy' || health?.status === 'ok';
  const dbStatus = health?.services.database || (isHealthy ? 'connected' : 'disconnected');
  const redisStatus = health?.services.redis || (isHealthy ? 'connected' : 'disconnected');

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
      <div className="px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
        {/* Left: Mobile Toggle & Breadcrumbs / Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
            aria-label="Open Navigation Menu"
          >
            <MenuIcon className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <span>Dashboard</span>
              <span>/</span>
              <span className="text-slate-700 capitalize font-semibold">{activeTabId}</span>
            </div>
            <div className="flex items-center gap-2.5 mt-0.5">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                {activeTabTitle}
              </h2>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase tracking-wide">
                Production-Ready
              </span>
            </div>
          </div>
        </div>

        {/* Right: Connectivity Status & Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Health Indicator Pills */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-1.5 text-xs shadow-2xs">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                }`}
              />
              <span className="font-semibold text-slate-700 hidden md:inline">System:</span>
              <span
                className={`font-semibold uppercase tracking-wider text-[11px] ${
                  isHealthy ? 'text-emerald-700' : 'text-rose-600'
                }`}
              >
                {isHealthy ? 'Operational' : 'Degraded'}
              </span>
            </div>

            <div className="hidden xl:flex items-center gap-2 border-l border-slate-200 pl-2 text-[11px] text-slate-500 font-mono">
              <span className="flex items-center gap-1">
                API:
                <b className="text-emerald-700 font-bold">200 OK</b>
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                DB:
                <b className={dbStatus === 'connected' ? 'text-emerald-700' : 'text-rose-600'}>
                  {dbStatus}
                </b>
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                Redis:
                <b className={redisStatus === 'connected' ? 'text-emerald-700' : 'text-rose-600'}>
                  {redisStatus}
                </b>
              </span>
            </div>
          </div>

          {/* Docs Quick Link */}
          <a
            href="/docs"
            target="_blank"
            rel="noreferrer"
            title="OpenAPI / Swagger Docs"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-indigo-600 hover:bg-slate-100 border border-slate-200 transition"
          >
            <DocsIcon className="w-3.5 h-3.5" />
            <span>Swagger</span>
          </a>

          {/* Refresh Button */}
          <button
            onClick={onRefreshHealth}
            disabled={healthLoading}
            title="Refresh System Health & Recent Jobs"
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 transition flex items-center justify-center shrink-0"
          >
            <RefreshIcon className={`w-4 h-4 ${healthLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
}
