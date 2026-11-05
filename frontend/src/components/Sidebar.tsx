import {
  BoltIcon,
  DashboardIcon,
  SendIcon,
  HistoryIcon,
  SpeedIcon,
  ShieldCheckIcon,
  DocsIcon,
  CloseIcon,
} from './Icons';
import type { HealthResponse } from '../api/webhooks';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  isOpen: boolean;
  onClose: () => void;
  health: HealthResponse | null;
}

export function Sidebar({
  currentTab,
  onSelectTab,
  isOpen,
  onClose,
  health,
}: SidebarProps) {
  const navItems = [
    { id: 'overview', label: 'Overview', icon: DashboardIcon },
    { id: 'webhooks', label: 'Webhooks', icon: SendIcon },
    { id: 'deliveries', label: 'Deliveries', icon: HistoryIcon },
    { id: 'ratelimits', label: 'Rate Limits', icon: SpeedIcon },
    { id: 'health', label: 'System Health', icon: ShieldCheckIcon },
  ];

  const handleNavClick = (id: string) => {
    onSelectTab(id);
    onClose();
  };

  const isHealthy = health?.status === 'healthy' || health?.status === 'ok';

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-[#0B132B] text-slate-300 flex flex-col justify-between transition-transform duration-300 ease-in-out border-r border-slate-800/80 shadow-2xl lg:shadow-none lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div>
          <div className="p-6 flex items-center justify-between border-b border-slate-800/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
                <BoltIcon className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5 font-sans">
                  Dispatcher<span className="text-indigo-400">OS</span>
                </h1>
                <p className="text-[11px] text-slate-400 font-mono">
                  Engine v1.0.0 · BullMQ
                </p>
              </div>
            </div>

            {/* Mobile Close Button */}
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              aria-label="Close Sidebar"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <div className="px-4 py-6">
            <span className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Core Engine
            </span>
            <nav className="mt-3 space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition duration-150 text-left ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <span className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 block mt-8">
              Developer Tools
            </span>
            <div className="mt-3 space-y-1.5">
              <a
                href="/docs"
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/60 transition group"
              >
                <div className="flex items-center gap-3">
                  <DocsIcon className="w-4 h-4 text-slate-400 group-hover:text-indigo-400 transition" />
                  <span>OpenAPI / Swagger</span>
                </div>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md font-mono">
                  /docs
                </span>
              </a>

              <a
                href="/health"
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/60 transition group"
              >
                <div className="flex items-center gap-3">
                  <ShieldCheckIcon className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition" />
                  <span>Health JSON API</span>
                </div>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md font-mono">
                  /health
                </span>
              </a>
            </div>
          </div>
        </div>

        {/* Engine Status Bottom Card */}
        <div className="p-4 border-t border-slate-800/60">
          <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Worker Status
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Active
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400 border-t border-slate-800/70 pt-2">
              <div>
                <span className="text-slate-400 block">Database</span>
                <span className="font-semibold text-slate-200">
                  {health?.services.database || (isHealthy ? 'Connected' : 'Offline')}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Redis Queue</span>
                <span className="font-semibold text-slate-200">
                  {health?.services.redis || (isHealthy ? 'Connected' : 'Offline')}
                </span>
              </div>
            </div>

            <div className="text-[10px] text-slate-400 border-t border-slate-800/70 pt-2 flex items-center justify-between">
              <span>Single-Process Mode</span>
              <span className="text-indigo-400 font-semibold font-mono">BullMQ Embedded</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
