import { useState, useEffect, useCallback, useRef } from 'react';
import {
  checkHealth,
  dispatchWebhook,
  getJobStatus,
  getAttempts,
  getRecentJobs,
} from './api/webhooks';
import type {
  HealthResponse,
  DispatchResponse,
  JobStatusResponse,
  DeliveryAttempt,
} from './api/webhooks';
import { AxiosError } from 'axios';

// Component Views & Shell
import { Sidebar } from './components/Sidebar';
import { TopNavbar } from './components/TopNavbar';
import { OverviewView } from './components/views/OverviewView';
import { WebhooksView } from './components/views/WebhooksView';
import { DeliveriesView } from './components/views/DeliveriesView';
import { RateLimitsView } from './components/views/RateLimitsView';
import { SystemHealthView } from './components/views/SystemHealthView';
import { Toast } from './components/Toast';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randomEventId(): string {
  return 'evt_' + Math.random().toString(36).slice(2, 10);
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as
      | { error?: { message?: string }; message?: string }
      | undefined;
    return (
      data?.error?.message ||
      data?.message ||
      err.message ||
      'Unknown error occurred'
    );
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

function getOrigin(): string {
  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin;
  }
  return 'http://localhost:3000';
}

// ─── Main SaaS Application ───────────────────────────────────────────────────

export default function App() {
  // Navigation State
  const [currentTab, setCurrentTab] = useState<string>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Global Health State
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // Webhooks Dispatch State
  const [destinationUrl, setDestinationUrl] = useState(() => `${getOrigin()}/mock/ok`);
  const [eventId, setEventId] = useState(randomEventId);
  const [payloadText, setPayloadText] = useState(
    '{\n  "event": "user.signup",\n  "userId": "usr_9481",\n  "plan": "enterprise"\n}'
  );
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<DispatchResponse | null>(null);
  const [dispatchElapsed, setDispatchElapsed] = useState<number | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  // Deliveries Inspection State
  const [activeJobId, setActiveJobId] = useState<string>('');
  const [jobStatus, setJobStatus] = useState<JobStatusResponse | null>(null);
  const [attempts, setAttempts] = useState<DeliveryAttempt[]>([]);
  const [watchLoading, setWatchLoading] = useState(false);
  const [watchError, setWatchError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Rate Limiting Demo State
  const [rateDemoRunning, setRateDemoRunning] = useState(false);
  const [rateDemoStats, setRateDemoStats] = useState<{
    total: number;
    queued: number;
    errors: number;
  }>({
    total: 25,
    queued: 0,
    errors: 0,
  });

  // Recent Jobs Store
  const [recentJobs, setRecentJobs] = useState<JobStatusResponse[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3000);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    showToast(`Copied ${label} to clipboard`);
  };

  // ─── API Pollers ────────────────────────────────────────────────────────────

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await checkHealth();
      setHealth(res);
    } catch {
      // Degraded or unreachable
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const fetchRecent = useCallback(async () => {
    setRecentLoading(true);
    try {
      const res = await getRecentJobs();
      setRecentJobs(res.events || []);
    } catch {
      // Ignore background errors
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    fetchRecent();

    // Periodic health refresh every 30s
    const healthInterval = setInterval(fetchHealth, 30000);
    return () => clearInterval(healthInterval);
  }, [fetchHealth, fetchRecent]);

  // ─── Job Details Poller (1s) ────────────────────────────────────────────────

  const fetchJobDetails = useCallback(
    async (jobIdToFetch: string) => {
      if (!jobIdToFetch) return;
      try {
        const [statusRes, attemptsRes] = await Promise.all([
          getJobStatus(jobIdToFetch),
          getAttempts(jobIdToFetch),
        ]);
        setJobStatus(statusRes);
        setAttempts(attemptsRes.attempts || []);
        setWatchError(null);

        // Stop polling when reaching terminal state
        if (statusRes.status === 'DELIVERED' || statusRes.status === 'FAILED') {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          fetchRecent(); // Refresh recent list on terminal state
        }
      } catch (err) {
        setWatchError(extractErrorMessage(err));
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    },
    [fetchRecent]
  );

  const startPolling = useCallback(
    (jobIdToPoll: string) => {
      if (!jobIdToPoll.trim()) return;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      setActiveJobId(jobIdToPoll);
      setWatchLoading(true);

      fetchJobDetails(jobIdToPoll).finally(() => setWatchLoading(false));

      pollingRef.current = setInterval(() => {
        fetchJobDetails(jobIdToPoll);
      }, 1000);
    },
    [fetchJobDetails]
  );

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // ─── Dispatch Handler ───────────────────────────────────────────────────────

  const handleDispatch = async () => {
    setDispatchError(null);
    setDispatchResult(null);

    let parsedPayload: Record<string, unknown>;
    try {
      parsedPayload = JSON.parse(payloadText);
    } catch {
      setDispatchError('Invalid JSON format. Please format or fix syntax.');
      return;
    }

    if (!destinationUrl.trim()) {
      setDispatchError('Destination URL is required.');
      return;
    }

    setDispatchLoading(true);
    const startTime = performance.now();

    try {
      const res = await dispatchWebhook({
        destinationUrl: destinationUrl.trim(),
        eventId: eventId.trim(),
        payload: parsedPayload,
      });

      const elapsed = Math.round(performance.now() - startTime);
      setDispatchElapsed(elapsed);
      setDispatchResult(res);
      showToast(`Webhook queued! Job ID: ${res.jobId}`);

      // Start tracking the job
      startPolling(res.jobId);
    } catch (err) {
      setDispatchError(extractErrorMessage(err));
    } finally {
      setDispatchLoading(false);
    }
  };

  // ─── Rate Limit Demo ────────────────────────────────────────────────────────

  const handleRateDemo = async () => {
    setRateDemoRunning(true);
    setRateDemoStats({ total: 25, queued: 0, errors: 0 });

    const targetUrl = `${getOrigin()}/mock/ok`;
    let queued = 0;
    let errors = 0;

    for (let i = 1; i <= 25; i++) {
      try {
        await dispatchWebhook({
          destinationUrl: targetUrl,
          eventId: `evt_rate_demo_${Date.now()}_${i}`,
          payload: { batchIndex: i, target: 'rate_limit_demo' },
        });
        queued++;
      } catch {
        errors++;
      }
      setRateDemoStats({ total: 25, queued, errors });
    }

    setRateDemoRunning(false);
    showToast(`Dispatched 25 concurrent webhooks to ${new URL(targetUrl).hostname}!`);
    fetchRecent();
  };

  const handleInspectJob = (jobId: string) => {
    startPolling(jobId);
    setCurrentTab('deliveries');
    showToast(`Now inspecting Job: ${jobId}`);
  };

  const tabTitles: Record<string, string> = {
    overview: 'Overview Dashboard',
    webhooks: 'Dispatch Webhooks',
    deliveries: 'Deliveries & History',
    ratelimits: 'Rate Limiter Engine',
    health: 'System Health & Diagnostics',
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex font-sans antialiased">
      {/* Dark Navy Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        health={health}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Navbar with Breadcrumbs and Status */}
        <TopNavbar
          onToggleSidebar={() => setSidebarOpen(true)}
          health={health}
          healthLoading={healthLoading}
          onRefreshHealth={() => {
            fetchHealth();
            fetchRecent();
            showToast('Refreshed system status and job logs');
          }}
          activeTabTitle={tabTitles[currentTab] || 'Dashboard'}
          activeTabId={currentTab}
        />

        {/* Dynamic Multi-View Workspace */}
        <main className="flex-1 p-4 sm:p-5 lg:p-6 max-w-7xl 2xl:max-w-[1600px] w-full mx-auto">
          {currentTab === 'overview' && (
            <OverviewView
              health={health}
              healthLoading={healthLoading}
              onRefreshHealth={fetchHealth}
              destinationUrl={destinationUrl}
              setDestinationUrl={setDestinationUrl}
              eventId={eventId}
              setEventId={setEventId}
              onGenerateEventId={randomEventId}
              payloadText={payloadText}
              setPayloadText={setPayloadText}
              onDispatch={handleDispatch}
              dispatchLoading={dispatchLoading}
              dispatchResult={dispatchResult}
              dispatchElapsed={dispatchElapsed}
              dispatchError={dispatchError}
              activeJobId={activeJobId}
              setActiveJobId={setActiveJobId}
              jobStatus={jobStatus}
              attempts={attempts}
              watchLoading={watchLoading}
              watchError={watchError}
              onTrackJob={startPolling}
              onRunDemo={handleRateDemo}
              rateDemoRunning={rateDemoRunning}
              rateDemoStats={rateDemoStats}
              recentJobs={recentJobs}
              recentLoading={recentLoading}
              onRefreshRecent={fetchRecent}
              onInspectJob={handleInspectJob}
              getOrigin={getOrigin}
              onCopyText={copyToClipboard}
            />
          )}

          {currentTab === 'webhooks' && (
            <WebhooksView
              destinationUrl={destinationUrl}
              setDestinationUrl={setDestinationUrl}
              eventId={eventId}
              setEventId={setEventId}
              onGenerateEventId={randomEventId}
              payloadText={payloadText}
              setPayloadText={setPayloadText}
              onDispatch={handleDispatch}
              dispatchLoading={dispatchLoading}
              dispatchResult={dispatchResult}
              dispatchElapsed={dispatchElapsed}
              dispatchError={dispatchError}
              onInspectJob={handleInspectJob}
              getOrigin={getOrigin}
              onCopyText={copyToClipboard}
            />
          )}

          {currentTab === 'deliveries' && (
            <DeliveriesView
              jobs={recentJobs}
              loading={recentLoading}
              onRefresh={fetchRecent}
              activeJobId={activeJobId}
              setActiveJobId={setActiveJobId}
              jobStatus={jobStatus}
              attempts={attempts}
              watchLoading={watchLoading}
              watchError={watchError}
              onTrackJob={startPolling}
              onCopyText={copyToClipboard}
            />
          )}

          {currentTab === 'ratelimits' && (
            <RateLimitsView
              onRunDemo={handleRateDemo}
              isRunning={rateDemoRunning}
              stats={rateDemoStats}
            />
          )}

          {currentTab === 'health' && (
            <SystemHealthView
              health={health}
              healthLoading={healthLoading}
              onRefreshHealth={fetchHealth}
              onCopyText={copyToClipboard}
            />
          )}
        </main>

        {/* Global Enterprise Footer */}
        <footer className="mt-auto border-t border-slate-200/80 bg-white py-4 px-6 text-center sm:flex sm:items-center sm:justify-between text-xs text-slate-500">
          <span>
            Distributed Webhook Dispatcher Engine · Single-Process Embedded Architecture
          </span>
          <div className="flex items-center justify-center gap-4 mt-2 sm:mt-0 font-medium">
            <a
              href="/docs"
              target="_blank"
              rel="noreferrer"
              className="hover:text-indigo-600 transition"
            >
              OpenAPI /docs
            </a>
            <span>·</span>
            <a
              href="/health"
              target="_blank"
              rel="noreferrer"
              className="hover:text-indigo-600 transition"
            >
              Health JSON
            </a>
            <span>·</span>
            <span className="text-slate-400">Node 22 · BullMQ · Redis · PostgreSQL</span>
          </div>
        </footer>
      </div>

      {/* Interactive Toast Feedback */}
      <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
    </div>
  );
}
