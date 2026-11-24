'use client';

import { useState, useEffect } from 'react';
import { Search, Download, Eye, X } from 'lucide-react';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { BENCHMARK_TRACES, BenchmarkTrace } from '@/lib/benchmark-traces';

type DateFilter = 'all' | '7d' | '30d';
type BenchmarkDeviationType = BenchmarkTrace['ground_truth']['deviation_type'];
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: JsonRecord, key: string): string | undefined {
  return typeof record[key] === 'string' ? record[key] : undefined;
}

function readNumber(record: JsonRecord, key: string): number | undefined {
  return typeof record[key] === 'number' ? record[key] : undefined;
}

function normalizeBenchmarkDeviationType(value: string): BenchmarkDeviationType {
  if (value === 'drift' || value === 'scope_creep' || value === 'tool_misuse') return value;
  if (value === 'misinterpretation') return 'prompt_misinterpretation';
  return 'none';
}

export default function AuditHistoryPage() {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [liveTrace, setLiveTrace] = useState<BenchmarkTrace | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = sessionStorage.getItem('agentlens_active_audit');
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        if (isRecord(parsed) && isRecord(parsed.result)) {
          const detectorAnalysis = isRecord(parsed.result.detectorAnalysis)
            ? parsed.result.detectorAnalysis
            : {};
          const steps = Array.isArray(parsed.steps) ? parsed.steps.filter(isRecord) : [];
          const isDev = Boolean(
            readString(detectorAnalysis, 'result') &&
            readString(detectorAnalysis, 'result') !== 'none'
          );
          const devType = normalizeBenchmarkDeviationType(readString(detectorAnalysis, 'result') || 'none');
          const nextTrace: BenchmarkTrace = {
            trace_id: readString(parsed, 'traceId') || 'live_audit_current',
            original_prompt: readString(parsed, 'prompt') || 'Custom Execution Audit',
            domain: 'Live Session',
            intent: {
              allowed_actions: Array.isArray(parsed.allowedActions) ? parsed.allowedActions.filter((value): value is string => typeof value === 'string') : [],
              forbidden_actions: Array.isArray(parsed.forbiddenActions) ? parsed.forbiddenActions.filter((value): value is string => typeof value === 'string') : [],
            },
            steps: steps.map((step, idx) => ({
              step_id: readNumber(step, 'stepNumber') ?? readNumber(step, 'step_id') ?? idx + 1,
              action_type: readString(step, 'actionType') ?? readString(step, 'action_type') ?? 'tool_call',
              tool_called: readString(step, 'toolCalled') ?? readString(step, 'tool_called') ?? null,
              tool_input: readString(step, 'toolInput') ?? readString(step, 'tool_input') ?? null,
              agent_reasoning: readString(step, 'agentReasoning') ?? readString(step, 'agent_reasoning') ?? null,
              tool_output: readString(step, 'toolOutput') ?? readString(step, 'tool_output') ?? null,
            })),
            ground_truth: {
              deviation_detected: isDev,
              deviation_type: devType,
              flagged_step_id: readNumber(detectorAnalysis, 'step_id') ?? (isDev ? 1 : null),
              trigger_phrase: null,
              explanation: readString(parsed.result, 'causalExplanation') || 'Live ML Core audit session result',
            },
            seed_meta: {
              scenario: 'Live Session Execution',
              difficulty: 'medium',
              hard_case: null,
            },
            total_latency_ms: null,
            total_tokens: null,
            timestamp: new Date(readString(parsed, 'timestamp') || readNumber(parsed, 'timestamp') || Date.now()).toISOString(),
          };
          window.setTimeout(() => setLiveTrace(nextTrace), 0);
        }
      }
    } catch (e) {
      console.warn('Failed to parse active audit in history:', e);
    }
  }, []);

  const historyTraces = liveTrace
    ? [liveTrace, ...BENCHMARK_TRACES.slice(0, 23)]
    : BENCHMARK_TRACES.slice(0, 24);

  const filtered = historyTraces.filter((h) => {
    const isDev = h.ground_truth.deviation_detected;
    const devType = h.ground_truth.deviation_type;

    if (filterStatus === 'correct' && isDev) return false;
    if (filterStatus === 'drift' && devType !== 'drift') return false;
    if (filterStatus === 'scope_creep' && devType !== 'scope_creep') return false;
    if (search && !h.trace_id.toLowerCase().includes(search.toLowerCase()) && !h.original_prompt.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleExportCSV = () => {
    const csvRows = [
      'Trace_ID,Prompt,Steps,Duration_MS,Deviation_Detected,Deviation_Type,Timestamp',
      ...filtered.map(
        (t) =>
          `"${t.trace_id}","${t.original_prompt.replace(/"/g, '""')}",${t.steps.length},${t.total_latency_ms != null ? t.total_latency_ms : ''},${t.ground_truth.deviation_detected},"${t.ground_truth.deviation_type}","${t.timestamp}"`
      ),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentlens_audit_history_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: '#F8FAFC',
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      {/* Decorative Wave Gradient */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '60%',
          height: 180,
          pointerEvents: 'none',
          opacity: 0.3,
          zIndex: 0,
        }}
        viewBox="0 0 800 200"
        fill="none"
        preserveAspectRatio="none"
      >
        <path d="M0 130 C 200 60, 450 170, 800 40 L 800 0 L 0 0 Z" fill="#4F46E5" fillOpacity="0.08" />
        <path d="M100 160 C 350 90, 550 190, 800 100 L 800 0 L 100 0 Z" fill="#4F46E5" fillOpacity="0.05" />
      </svg>

      <Topbar
        title="Audit History"
        subtitle="Historical archive of all verified agent execution evaluations and prompt repairs."
        breadcrumb="AGENTLENS / AUDIT LOGS"
      />

      <main
        style={{
          flex: 1,
          padding: '12px 32px 32px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[
            { label: 'Total Audits Logged', value: '126', color: '#0F172A', bar: '#4F46E5' },
            { label: 'Verified Correct', value: '54', color: '#059669', bar: '#059669' },
            { label: 'Semantic Drift Cases', value: '37', color: '#D97706', bar: '#D97706' },
            { label: 'Scope Creep Violations', value: '27', color: '#DC2626', bar: '#DC2626' },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: '#FFFFFF',
                borderRadius: 12,
                border: '1px solid #E2E8F0',
                padding: '16px 20px',
                boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: s.bar }} />
              <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: s.color, letterSpacing: '-0.02em' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #E2E8F0',
            padding: '14px 20px',
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
            boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: 8,
              padding: '7px 12px',
              flex: 1,
              minWidth: 200,
            }}
          >
            <Search size={14} color="#475569" strokeWidth={1.8} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search historical audit logs..."
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: '#0F172A', width: '100%' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569' }}>
                <X size={13} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { id: 'all', label: 'All' },
              { id: 'correct', label: 'Correct' },
              { id: 'drift', label: 'Drift' },
              { id: 'scope_creep', label: 'Scope Creep' },
            ].map((f) => {
              const active = filterStatus === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilterStatus(f.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 7,
                    border: `1px solid ${active ? '#4F46E5' : '#E2E8F0'}`,
                    background: active ? '#4F46E5' : '#FFFFFF',
                    color: active ? '#FFFFFF' : '#475569',
                    fontSize: 12,
                    fontWeight: active ? 600 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateFilter)}
              style={{
                padding: '6px 10px',
                borderRadius: 7,
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                color: '#0F172A',
                fontSize: 12,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="all">All Dates</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>

            <button
              onClick={handleExportCSV}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 7,
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                color: '#0F172A',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Download size={13} strokeWidth={2} />
              Export History CSV
            </button>
          </div>
        </div>

        {/* History Table */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['Audit ID', 'Instruction Mandate', 'Steps', 'Result', 'Anomaly Classification', 'Inference Latency', 'Audit Timestamp', 'Action'].map(
                  (h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '10px 14px',
                        textAlign: i === 7 ? 'right' : 'left',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#475569',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((audit, idx) => {
                const isDev = audit.ground_truth.deviation_detected;
                const devType = audit.ground_truth.deviation_type;
                const badgeColor = !isDev ? '#059669' : devType === 'drift' ? '#D97706' : '#DC2626';
                const badgeBg = !isDev ? 'rgba(5, 150, 105, 0.1)' : devType === 'drift' ? 'rgba(217, 119, 6, 0.1)' : 'rgba(220, 38, 38, 0.1)';

                return (
                  <tr
                    key={audit.trace_id}
                    style={{
                      borderBottom: idx < filtered.length - 1 ? '1px solid #F1F0E9' : 'none',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '11px 14px' }}>
                      <Link
                        href={`/trace-analysis?id=${audit.trace_id}`}
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: 'IBM Plex Mono, monospace',
                          color: '#0F172A',
                          textDecoration: 'none',
                        }}
                      >
                        {audit.trace_id}
                      </Link>
                    </td>
                    <td style={{ padding: '11px 14px', maxWidth: 320 }}>
                      <span
                        style={{
                          fontSize: 12,
                          color: '#0F172A',
                          display: '-webkit-box',
                          WebkitLineClamp: 1,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                        title={audit.original_prompt}
                      >
                        {audit.original_prompt}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontSize: 12, color: '#0F172A', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600 }}>
                        {audit.steps.length}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: badgeColor,
                          background: badgeBg,
                          padding: '2px 8px',
                          borderRadius: 10,
                        }}
                      >
                        {isDev ? 'Deviation' : 'Correct'}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      {isDev ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: badgeColor }}>
                          {devType.replace('_', ' ')}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: '#475569' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontSize: 12, color: '#475569', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {audit.total_latency_ms != null ? `${audit.total_latency_ms}ms` : '—'}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 11, color: '#475569' }}>{audit.timestamp}</span>
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', position: 'relative' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <Link
                          href={`/trace-analysis?id=${audit.trace_id}`}
                          style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            background: '#F1F5F9',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            color: '#0F172A',
                            textDecoration: 'none',
                            fontSize: 11.5,
                            fontWeight: 600,
                          }}
                        >
                          <Eye size={12} strokeWidth={2} /> Inspect
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
