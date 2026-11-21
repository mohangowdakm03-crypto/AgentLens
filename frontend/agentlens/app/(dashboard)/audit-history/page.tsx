'use client';

import { useState, useEffect } from 'react';
import { Search, Filter, Calendar, Download, Eye, MoreHorizontal, Clock, ArrowRight, X } from 'lucide-react';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { DeviationBadge, StatusBadge } from '@/components/common/Badge';
import { BENCHMARK_TRACES, BenchmarkTrace } from '@/lib/benchmark-traces';

export default function AuditHistoryPage() {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFilter, setDateFilter] = useState<'all' | '7d' | '30d'>('all');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [liveTrace, setLiveTrace] = useState<BenchmarkTrace | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = sessionStorage.getItem('agentlens_active_audit');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.result) {
          const isDev = Boolean(
            parsed.result.detectorAnalysis?.result &&
            parsed.result.detectorAnalysis.result !== 'none'
          );
          const devType = (parsed.result.detectorAnalysis?.result || 'none') as any;
          setLiveTrace({
            trace_id: parsed.traceId || 'live_audit_current',
            original_prompt: parsed.prompt || 'Custom Execution Audit',
            domain: 'Live Session',
            intent: {
              allowed_actions: parsed.allowedActions || [],
              forbidden_actions: parsed.forbiddenActions || [],
            },
            steps: (parsed.steps || []).map((s: any, idx: number) => ({
              step_id: s.stepNumber ?? s.step_id ?? idx + 1,
              action_type: s.actionType ?? s.action_type ?? 'tool_call',
              tool_called: s.toolCalled ?? s.tool_called ?? null,
              tool_input: s.toolInput ?? s.tool_input ?? null,
              agent_reasoning: s.agentReasoning ?? s.agent_reasoning ?? null,
              tool_output: s.toolOutput ?? s.tool_output ?? null,
            })),
            ground_truth: {
              deviation_detected: isDev,
              deviation_type: devType,
              flagged_step_id: parsed.result.detectorAnalysis?.step_id ?? (isDev ? 1 : null),
              trigger_phrase: null,
              explanation: parsed.result.causalExplanation || 'Live ML Core audit session result',
            },
            seed_meta: {
              scenario: 'Live Session Execution',
              difficulty: 'medium',
              hard_case: null,
            },
            total_latency_ms: 120,
            total_tokens: 350,
            timestamp: new Date(parsed.timestamp || Date.now()).toISOString(),
          });
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
          `"${t.trace_id}","${t.original_prompt.replace(/"/g, '""')}",${t.steps.length},${t.total_latency_ms},${t.ground_truth.deviation_detected},"${t.ground_truth.deviation_type}","${t.timestamp}"`
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
        background: '#F8F7F3',
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
        <path d="M0 130 C 200 60, 450 170, 800 40 L 800 0 L 0 0 Z" fill="#829581" fillOpacity="0.08" />
        <path d="M100 160 C 350 90, 550 190, 800 100 L 800 0 L 100 0 Z" fill="#829581" fillOpacity="0.05" />
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
            { label: 'Total Audits Logged', value: '126', color: '#292D32', bar: '#829581' },
            { label: 'Verified Correct', value: '54', color: '#72947A', bar: '#72947A' },
            { label: 'Semantic Drift Cases', value: '37', color: '#C49A5B', bar: '#C49A5B' },
            { label: 'Scope Creep Violations', value: '27', color: '#B97878', bar: '#B97878' },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: '#FFFFFF',
                borderRadius: 12,
                border: '1px solid #E6E5DF',
                padding: '16px 20px',
                boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: s.bar }} />
              <div style={{ fontSize: 12, color: '#737982', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: s.color, letterSpacing: '-0.02em' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #E6E5DF',
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
              background: '#F8F7F3',
              border: '1px solid #E6E5DF',
              borderRadius: 8,
              padding: '7px 12px',
              flex: 1,
              minWidth: 200,
            }}
          >
            <Search size={14} color="#737982" strokeWidth={1.8} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search historical audit logs..."
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: '#292D32', width: '100%' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#737982' }}>
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
                    border: `1px solid ${active ? '#829581' : '#E6E5DF'}`,
                    background: active ? '#829581' : '#FFFFFF',
                    color: active ? '#FFFFFF' : '#737982',
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
              onChange={(e) => setDateFilter(e.target.value as any)}
              style={{
                padding: '6px 10px',
                borderRadius: 7,
                border: '1px solid #E6E5DF',
                background: '#FFFFFF',
                color: '#292D32',
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
                border: '1px solid #E6E5DF',
                background: '#FFFFFF',
                color: '#292D32',
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
            border: '1px solid #E6E5DF',
            boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8F7F3', borderBottom: '1px solid #E6E5DF' }}>
                {['Audit ID', 'Instruction Mandate', 'Steps', 'Result', 'Anomaly Classification', 'Inference Latency', 'Audit Timestamp', 'Action'].map(
                  (h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '10px 14px',
                        textAlign: i === 7 ? 'right' : 'left',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#737982',
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
                const badgeColor = !isDev ? '#72947A' : devType === 'drift' ? '#C49A5B' : '#B97878';
                const badgeBg = !isDev ? 'rgba(114, 148, 122, 0.12)' : devType === 'drift' ? 'rgba(196, 154, 91, 0.12)' : 'rgba(185, 120, 120, 0.12)';

                return (
                  <tr
                    key={audit.trace_id}
                    style={{
                      borderBottom: idx < filtered.length - 1 ? '1px solid #F1F0E9' : 'none',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F8F7F3')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '11px 14px' }}>
                      <Link
                        href={`/trace-analysis?id=${audit.trace_id}`}
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: 'IBM Plex Mono, monospace',
                          color: '#292D32',
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
                          color: '#292D32',
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
                      <span style={{ fontSize: 12, color: '#292D32', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600 }}>
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
                        <span style={{ fontSize: 12, color: '#737982' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontSize: 12, color: '#737982', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {audit.total_latency_ms}ms
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 11, color: '#737982' }}>{audit.timestamp}</span>
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', position: 'relative' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <Link
                          href={`/trace-analysis?id=${audit.trace_id}`}
                          style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            background: '#F0EFE9',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            color: '#292D32',
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
