export interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const norm = status.toUpperCase();

  const configs: Record<string, { bg: string; text: string; dot: string; border: string }> = {
    DELIVERED: {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-700',
      dot: 'bg-emerald-500',
      border: 'border-emerald-200/60',
    },
    SUCCESS: {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-700',
      dot: 'bg-emerald-500',
      border: 'border-emerald-200/60',
    },
    QUEUED: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-800',
      dot: 'bg-amber-500',
      border: 'border-amber-200/60',
    },
    PROCESSING: {
      bg: 'bg-blue-500/10',
      text: 'text-blue-700',
      dot: 'bg-blue-500 animate-pulse',
      border: 'border-blue-200/60',
    },
    RETRYING: {
      bg: 'bg-orange-500/10',
      text: 'text-orange-700',
      dot: 'bg-orange-500 animate-ping',
      border: 'border-orange-200/60',
    },
    FAILED: {
      bg: 'bg-rose-500/10',
      text: 'text-rose-700',
      dot: 'bg-rose-500',
      border: 'border-rose-200/60',
    },
    HEALTHY: {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-700',
      dot: 'bg-emerald-500',
      border: 'border-emerald-200/60',
    },
    DEGRADED: {
      bg: 'bg-rose-500/10',
      text: 'text-rose-700',
      dot: 'bg-rose-500',
      border: 'border-rose-200/60',
    },
  };

  const current = configs[norm] || {
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    dot: 'bg-slate-400',
    border: 'border-slate-200',
  };

  const padding = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${current.bg} ${current.text} ${current.border} ${padding}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${current.dot}`} />
      <span>{norm}</span>
    </span>
  );
}

