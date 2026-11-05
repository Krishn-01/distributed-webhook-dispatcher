import { useState, useMemo } from 'react';
import {
  SearchIcon,
  RefreshIcon,
  CopyIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
} from '../Icons';
import { StatusBadge } from '../StatusBadge';
import type { JobStatusResponse, DeliveryAttempt } from '../../api/webhooks';

interface DeliveriesViewProps {
  jobs: JobStatusResponse[];
  loading: boolean;
  onRefresh: () => void;
  activeJobId: string;
  setActiveJobId: (id: string) => void;
  jobStatus: JobStatusResponse | null;
  attempts: DeliveryAttempt[];
  watchLoading: boolean;
  watchError: string | null;
  onTrackJob: (id: string) => void;
  onCopyText: (text: string, label: string) => void;
}

export function DeliveriesView({
  jobs,
  loading,
  onRefresh,
  activeJobId,
  setActiveJobId,
  jobStatus,
  attempts,
  watchLoading,
  watchError,
  onTrackJob,
  onCopyText,
}: DeliveriesViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const pageSize = 10;

  // Filter jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchesSearch =
        job.jobId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.eventId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.destinationDomain.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        statusFilter === 'ALL' || job.status.toUpperCase() === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [jobs, searchTerm, statusFilter]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredJobs.slice(start, start + pageSize);
  }, [filteredJobs, currentPage, pageSize]);

  const handleInspectJob = (jobId: string) => {
    setActiveJobId(jobId);
    onTrackJob(jobId);
    setIsDrawerOpen(true);
  };

  const isTerminal =
    jobStatus?.status === 'DELIVERED' || jobStatus?.status === 'FAILED';

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                Audit Trail
              </span>
              <span className="text-slate-400 text-xs">· PostgreSQL Event Ledger</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-1 font-sans">
              Delivery History & Timeline
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Inspect all queued, processing, delivered, and dead-lettered webhook attempts with backoff intervals and HTTP response telemetry.
            </p>
          </div>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition shadow-xs flex items-center gap-2 shrink-0"
          >
            <RefreshIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Refreshing…' : 'Refresh Ledger'}</span>
          </button>
        </div>
      </div>

      {/* Main Ledger Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Table Filters & Search */}
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
            {['ALL', 'DELIVERED', 'QUEUED', 'PROCESSING', 'FAILED'].map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setStatusFilter(tab);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                  statusFilter === tab
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative">
            <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by Job, Event, Domain…"
              className="pl-9 pr-3 py-1.5 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none w-full sm:w-64 bg-white"
            />
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500 font-sans">
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Job ID</th>
                <th className="py-3 px-4">Event ID</th>
                <th className="py-3 px-4">Destination Domain</th>
                <th className="py-3 px-4 text-center">Attempts</th>
                <th className="py-3 px-4 text-center">Last Code</th>
                <th className="py-3 px-4">Created</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedJobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                    {loading ? 'Loading webhook audit logs…' : 'No webhooks found matching criteria.'}
                  </td>
                </tr>
              ) : (
                paginatedJobs.map((job) => (
                  <tr
                    key={job.jobId}
                    className="hover:bg-slate-50/80 transition group"
                  >
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusBadge status={job.status} size="sm" />
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span>{job.jobId}</span>
                        <button
                          type="button"
                          onClick={() => onCopyText(job.jobId, 'Job ID')}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-600 transition"
                          title="Copy Job ID"
                        >
                          <CopyIcon className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[140px] block">{job.eventId}</span>
                        <button
                          type="button"
                          onClick={() => onCopyText(job.eventId, 'Event ID')}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-600 transition"
                          title="Copy Event ID"
                        >
                          <CopyIcon className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                      <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] text-slate-700 font-semibold">
                        {job.destinationDomain}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] ${
                          job.attemptCount > 1
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {job.attemptCount} / 4
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono whitespace-nowrap">
                      {job.lastResponseCode ? (
                        <span
                          className={`font-bold ${
                            job.lastResponseCode >= 200 && job.lastResponseCode < 300
                              ? 'text-emerald-600'
                              : 'text-rose-600'
                          }`}
                        >
                          {job.lastResponseCode}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-[11px] font-mono whitespace-nowrap">
                      {new Date(job.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleInspectJob(job.jobId)}
                        className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold shadow-2xs transition"
                      >
                        Inspect Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing <b className="text-slate-800">{paginatedJobs.length}</b> of{' '}
            <b className="text-slate-800">{filteredJobs.length}</b> records
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition"
              aria-label="Previous Page"
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono font-semibold text-slate-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition"
              aria-label="Next Page"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Slide-out Drawer / Modal: Delivery Details */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsDrawerOpen(false)}
          />

          {/* Drawer Content */}
          <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col z-10 overflow-y-auto">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Delivery Inspection
                  </span>
                  {jobStatus && <StatusBadge status={jobStatus.status} size="sm" />}
                </div>
                <h3 className="text-lg font-bold text-slate-900 font-mono mt-0.5">
                  {activeJobId || 'Job Details'}
                </h3>
              </div>

              <button
                onClick={() => setIsDrawerOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
                aria-label="Close Drawer"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="p-6 space-y-6 flex-1">
              {watchLoading && !jobStatus ? (
                <div className="py-20 text-center text-slate-400 text-xs">
                  Loading delivery timeline…
                </div>
              ) : jobStatus ? (
                <>
                  {/* Status Metadata Card */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-600">Current Status</span>
                      <StatusBadge status={jobStatus.status} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/70 font-mono">
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                          Event ID
                        </span>
                        <span className="text-slate-800 font-bold truncate block">
                          {jobStatus.eventId}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                          Destination Domain
                        </span>
                        <span className="text-slate-800 font-bold truncate block">
                          {jobStatus.destinationDomain}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                          Attempt Count
                        </span>
                        <span className="text-slate-800 font-bold block">
                          {jobStatus.attemptCount} of 4 max
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                          Streaming State
                        </span>
                        <span
                          className={`font-bold ${
                            isTerminal ? 'text-slate-600' : 'text-indigo-600 animate-pulse'
                          }`}
                        >
                          {isTerminal ? 'Finished (Terminal)' : 'Active (Polling 1s)'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Delivery Attempt Timeline */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Attempt Step Timeline ({attempts.length})
                      </h4>
                      <span className="text-[11px] font-mono text-slate-400">
                        2s, 4s, 8s Backoff
                      </span>
                    </div>

                    {attempts.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                        Awaiting initial attempt from worker…
                      </div>
                    ) : (
                      <div className="space-y-3 relative before:absolute before:top-4 before:bottom-4 before:left-4 before:w-0.5 before:bg-slate-200">
                        {attempts.map((att, idx) => {
                          let gapLabel = 'Initial Delivery Attempt';
                          if (idx > 0) {
                            const prevTime = new Date(attempts[idx - 1].createdAt).getTime();
                            const currTime = new Date(att.createdAt).getTime();
                            const diffSec = ((currTime - prevTime) / 1000).toFixed(1);
                            gapLabel = `+${diffSec}s Exponential Backoff`;
                          }

                          const isSuccess = att.status === 'SUCCESS';
                          const isRetrying = att.status === 'RETRYING';

                          return (
                            <div
                              key={att.attemptNumber}
                              className="relative pl-9 bg-white border border-slate-200 rounded-xl p-3.5 text-xs shadow-2xs space-y-1.5"
                            >
                              <div
                                className={`absolute left-2.5 top-4 w-3.5 h-3.5 rounded-full border-2 bg-white flex items-center justify-center ${
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

                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-800">
                                  Attempt #{att.attemptNumber}
                                </span>
                                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                  {gapLabel}
                                </span>
                              </div>

                              <div className="flex items-center gap-3 font-mono text-[11px]">
                                <span
                                  className={`font-bold px-1.5 py-0.5 rounded ${
                                    att.responseCode && att.responseCode >= 200 && att.responseCode < 300
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-rose-50 text-rose-700'
                                  }`}
                                >
                                  {att.responseCode ? `HTTP ${att.responseCode}` : 'NETWORK ERROR'}
                                </span>
                                <span className="text-slate-400">·</span>
                                <span className="text-slate-500">
                                  {att.durationMs !== null ? `${att.durationMs}ms duration` : 'Timeout'}
                                </span>
                                <span className="text-slate-400">·</span>
                                <span className="text-slate-400">
                                  {new Date(att.createdAt).toLocaleTimeString()}
                                </span>
                              </div>

                              {att.errorMessage && (
                                <div className="mt-1 p-2 rounded-lg bg-rose-50 text-rose-800 text-[11px] font-mono">
                                  {att.errorMessage}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="py-20 text-center text-slate-400 text-xs">
                  {watchError || 'Job not found in database.'}
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-mono text-[11px]">
                PostgreSQL attempt audit log
              </span>
              <button
                onClick={() => onTrackJob(activeJobId)}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-xs transition"
              >
                Poll Latest
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
