import { useState, useMemo } from 'react';
import {
  HistoryIcon,
  SearchIcon,
  RefreshIcon,
  CopyIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowUpRightIcon,
} from './Icons';
import { StatusBadge } from './StatusBadge';
import type { JobStatusResponse } from '../api/webhooks';

interface RecentJobsTableProps {
  jobs: JobStatusResponse[];
  loading: boolean;
  onRefresh: () => void;
  onInspectJob: (jobId: string) => void;
  onCopyText: (text: string, label: string) => void;
}

export function RecentJobsTable({
  jobs,
  loading,
  onRefresh,
  onInspectJob,
  onCopyText,
}: RecentJobsTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

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

  const handleFilterChange = (filter: string) => {
    setStatusFilter(filter);
    setCurrentPage(1);
  };

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setCurrentPage(1);
  };

  const filterTabs = ['ALL', 'DELIVERED', 'QUEUED', 'PROCESSING', 'FAILED'];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
      {/* Table Header Controls */}
      <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <HistoryIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm tracking-tight font-sans">
              Recent Webhook Jobs
            </h3>
            <p className="text-[11px] text-slate-500">
              PostgreSQL Audit Log · Displaying latest jobs
            </p>
          </div>
        </div>

        {/* Search, Filter & Refresh Group */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          {/* Search Input */}
          <div className="relative">
            <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Filter by Job, Event, Domain…"
              className="pl-9 pr-3 py-1.5 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none w-full sm:w-60 bg-white"
            />
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition flex items-center justify-center gap-1.5 shrink-0"
          >
            <RefreshIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto text-xs">
        {filterTabs.map((tab) => {
          const isActive = statusFilter === tab;
          return (
            <button
              key={tab}
              onClick={() => handleFilterChange(tab)}
              className={`px-3 py-1 rounded-lg font-semibold text-[11px] transition shrink-0 ${
                isActive
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
              }`}
            >
              {tab === 'ALL' ? 'All Webhooks' : tab}
            </button>
          );
        })}
        <span className="ml-auto text-[11px] text-slate-400 font-medium">
          Showing {filteredJobs.length} results
        </span>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider text-[10px] font-bold border-b border-slate-200/60">
            <tr>
              <th className="py-3 px-4">Job ID</th>
              <th className="py-3 px-4">Event ID</th>
              <th className="py-3 px-4">Target Domain</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Attempts</th>
              <th className="py-3 px-4">Last Code</th>
              <th className="py-3 px-4">Created At</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedJobs.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-400">
                  <p className="text-xs font-semibold text-slate-600">No webhooks match your search</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Try adjusting your filters or dispatch a new webhook above.
                  </p>
                </td>
              </tr>
            ) : (
              paginatedJobs.map((job) => (
                <tr
                  key={job.jobId}
                  className="hover:bg-indigo-50/20 transition group"
                >
                  {/* Job ID */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-slate-900">
                      <span>{job.jobId}</span>
                      <button
                        type="button"
                        onClick={() => onCopyText(job.jobId, 'Job ID')}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-indigo-600 rounded transition"
                        title="Copy Job ID"
                      >
                        <CopyIcon className="w-3 h-3" />
                      </button>
                    </div>
                  </td>

                  {/* Event ID */}
                  <td className="py-3 px-4">
                    <span className="font-mono text-[11px] text-slate-600 truncate max-w-[140px] block">
                      {job.eventId}
                    </span>
                  </td>

                  {/* Domain */}
                  <td className="py-3 px-4">
                    <span className="font-mono text-[11px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                      {job.destinationDomain}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="py-3 px-4">
                    <StatusBadge status={job.status} size="sm" />
                  </td>

                  {/* Attempts */}
                  <td className="py-3 px-4 font-mono font-semibold text-slate-700">
                    {job.attemptCount} / 4
                  </td>

                  {/* Last Code */}
                  <td className="py-3 px-4">
                    <span
                      className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded ${
                        job.lastResponseCode && job.lastResponseCode >= 200 && job.lastResponseCode < 300
                          ? 'bg-emerald-50 text-emerald-700'
                          : job.lastResponseCode
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {job.lastResponseCode ? `HTTP ${job.lastResponseCode}` : '—'}
                    </span>
                  </td>

                  {/* Created At */}
                  <td className="py-3 px-4 text-slate-500 text-[11px]">
                    {new Date(job.createdAt).toLocaleTimeString()}
                  </td>

                  {/* Action */}
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onInspectJob(job.jobId)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition"
                    >
                      <span>Inspect</span>
                      <ArrowUpRightIcon className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="p-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
          <span>
            Page <b className="text-slate-900">{currentPage}</b> of{' '}
            <b className="text-slate-900">{totalPages}</b>
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-200 disabled:opacity-40 transition"
              title="Previous Page"
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-7 h-7 rounded-lg text-xs font-semibold transition ${
                  currentPage === page
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                {page}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-200 disabled:opacity-40 transition"
              title="Next Page"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

