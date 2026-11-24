'use client';

import { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  ArrowUpDown,
  Eye,
  MoreHorizontal,
  Download,
  Layers,
  ArrowRight,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  Zap,
  ChevronLeft,
  ChevronRight,
  Code,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import Topbar from '@/components/layout/Topbar';
import { DeviationBadge, StatusBadge } from '@/components/common/Badge';
import Button from '@/components/common/Button';
import { BENCHMARK_TRACES, BenchmarkTrace } from '@/lib/benchmark-traces';
import { listTraces, getTrace } from '@/services/api';
function normalizeDeviationType(value: string | null | undefined): BenchmarkTrace['ground_truth']['deviation_type'] {
  if (value === 'drift' || value === 'scope_creep' || value === 'tool_misuse') return value;
  if (value === 'misinterpretation') return 'prompt_misinterpretation';
  return 'none';
}

export default function TraceExplorerPage() {
  const [search, setSearch] = useState('');
  const [filterDev, setFilterDev] = useState<string>('all');
  const [filterDomain, setFilterDomain] = useState<string>('all');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all');
  const [sortField, setSortField] = useState<'id' | 'steps' | 'latency' | 'status'>('id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedTraces, setSelectedTraces] = useState<Set<string>>(new Set());
  const [activeDrawerTrace, setActiveDrawerTrace] = useState<BenchmarkTrace | null>(null);
  const [drawerTab, setDrawerTab] = useState<'timeline' | 'json' | 'policy'>('timeline');
  const [currentPage, setCurrentPage] = useState(1);
  const [backendTraces, setBackendTraces] = useState<BenchmarkTrace[]>([]);
  const [isLoadingBackend, setIsLoadingBackend] = useState(true);
  const pageSize = 15;

  // Fetch traces from backend repository (300 records)
  useEffect(() => {
    listTraces()
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) {
          const mapped: BenchmarkTrace[] = items.map((item) => {
            const isDev = item.groundTruth?.isDeviated ?? false;
            const devType = normalizeDeviationType(item.groundTruth?.deviationType);
            const domain = item.traceId.includes('00') ? 'Software Development' : 'AI/ML';
            return {
              trace_id: item.traceId,
              original_prompt: item.label.replace(/^Trace [^:]+:\s*\[[^\]]+\]\s*/, ''),
              domain,
              intent: {
                allowed_actions: [],
                forbidden_actions: [],
              },
              steps: Array.from({ length: item.stepCount || 4 }).map((_, idx) => ({
                step_id: idx + 1,
                action_type: 'action',
                tool_called: 'tool_call',
                tool_input: '',
                agent_reasoning: '',
                tool_output: '',
              })),
              ground_truth: {
                deviation_detected: isDev,
                deviation_type: devType,
                flagged_step_id: item.groundTruth?.flaggedSteps?.[0]
                  ? parseInt(String(item.groundTruth.flaggedSteps[0]), 10) || (isDev ? 3 : null)
                  : (isDev ? 3 : null),
                trigger_phrase: null,
                explanation: isDev ? `Deviation (${devType}) annotated in ground truth.` : 'Nominal compliant trace.',
              },
              seed_meta: {
                scenario: item.label,
                difficulty: 'medium',
                hard_case: null,
              },
              total_latency_ms: (item.stepCount || 4) * 35,
              total_tokens: (item.stepCount || 4) * 85,
              timestamp: new Date().toISOString(),
            };
          });
          setBackendTraces(mapped);
        }
      })
      .catch((err) => {
        console.warn('Could not load backend traces in explorer:', err);
      })
      .finally(() => {
        setIsLoadingBackend(false);
      });
  }, []);

  const tracesSource = backendTraces.length > 0 ? backendTraces : BENCHMARK_TRACES;

  // Domain options
  const domains = useMemo(() => {
    const set = new Set(tracesSource.map((t) => t.domain));
    return Array.from(set);
  }, [tracesSource]);

  // Dynamic statistics
  const stats = useMemo(() => {
    const total = tracesSource.length;
    const nominal = tracesSource.filter((t) => !t.ground_truth.deviation_detected).length;
    const drift = tracesSource.filter((t) => t.ground_truth.deviation_type === 'drift').length;
    const scope = tracesSource.filter((t) => t.ground_truth.deviation_type === 'scope_creep').length;
    return {
      total,
      nominal,
      nominalPct: total > 0 ? ((nominal / total) * 100).toFixed(1) : '0',
      drift,
      driftPct: total > 0 ? ((drift / total) * 100).toFixed(1) : '0',
      scope,
      scopePct: total > 0 ? ((scope / total) * 100).toFixed(1) : '0',
    };
  }, [tracesSource]);

  // Filter logic
  const filtered = useMemo(() => {
    return tracesSource.filter((t) => {
      // Classification filter
      if (filterDev === 'clean' && t.ground_truth.deviation_detected) return false;
      if (filterDev === 'drift' && t.ground_truth.deviation_type !== 'drift') return false;
      if (filterDev === 'scope_creep' && t.ground_truth.deviation_type !== 'scope_creep') return false;
      if (filterDev === 'other' && (t.ground_truth.deviation_type === 'drift' || t.ground_truth.deviation_type === 'scope_creep' || !t.ground_truth.deviation_detected)) return false;

      // Domain filter
      if (filterDomain !== 'all' && t.domain !== filterDomain) return false;

      // Difficulty filter
      if (filterDifficulty !== 'all' && t.seed_meta.difficulty !== filterDifficulty) return false;

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesId = t.trace_id.toLowerCase().includes(q);
        const matchesPrompt = t.original_prompt.toLowerCase().includes(q);
        const matchesDomain = t.domain.toLowerCase().includes(q);
        const matchesTools = t.steps.some((s) => (s.tool_called || '').toLowerCase().includes(q));
        if (!matchesId && !matchesPrompt && !matchesDomain && !matchesTools) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortField === 'id') {
        return sortOrder === 'asc' ? a.trace_id.localeCompare(b.trace_id) : b.trace_id.localeCompare(a.trace_id);
      }
      if (sortField === 'steps') {
        return sortOrder === 'asc' ? a.steps.length - b.steps.length : b.steps.length - a.steps.length;
      }
      if (sortField === 'latency') {
        const aLat = a.total_latency_ms ?? 0;
        const bLat = b.total_latency_ms ?? 0;
        return sortOrder === 'asc' ? aLat - bLat : bLat - aLat;
      }
      if (sortField === 'status') {
        const aStatus = a.ground_truth.deviation_type;
        const bStatus = b.ground_truth.deviation_type;
        return sortOrder === 'asc' ? aStatus.localeCompare(bStatus) : bStatus.localeCompare(aStatus);
      }
      return 0;
    });
  }, [search, filterDev, filterDomain, filterDifficulty, sortField, sortOrder]);

  // Paginated traces
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginatedTraces = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedTraces);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedTraces(next);
  };

  const toggleSelectAll = () => {
    if (selectedTraces.size === filtered.length) {
      setSelectedTraces(new Set());
    } else {
      setSelectedTraces(new Set(filtered.map((t) => t.trace_id)));
    }
  };

  const handleSort = (field: 'id' | 'steps' | 'latency' | 'status') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Export selected traces as JSONL
  const handleExportJSONL = () => {
    const tracesToExport = selectedTraces.size > 0
      ? BENCHMARK_TRACES.filter((t) => selectedTraces.has(t.trace_id))
      : filtered;

    const jsonlContent = tracesToExport.map((t) => JSON.stringify(t)).join('\n');
    const blob = new Blob([jsonlContent], { type: 'application/jsonl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentlens_traces_export_${Date.now()}.jsonl`;
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
        title="Trace Explorer"
        subtitle="Search, filter, and inspect post-hoc LLM agent execution sessions."
        breadcrumb="AGENTLENS / OBSERVABILITY"
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
        {/* Metric Summary Ribbon */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 12,
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 10,
              border: '1px solid #E2E8F0',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Layers size={16} color="#4F46E5" />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>Total Traces</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', lineHeight: 1.1 }}>{stats.total}</div>
            </div>
          </div>

          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 10,
              border: '1px solid #E2E8F0',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(5, 150, 105, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={16} color="#059669" />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>Nominal Traces</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#059669', lineHeight: 1.1 }}>
                {stats.nominal} <span style={{ fontSize: 11, fontWeight: 500, color: '#475569' }}>({stats.nominalPct}%)</span>
              </div>
            </div>
          </div>

          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 10,
              border: '1px solid #E2E8F0',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(217, 119, 6, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={16} color="#D97706" />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>Semantic Drift</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#D97706', lineHeight: 1.1 }}>
                {stats.drift} <span style={{ fontSize: 11, fontWeight: 500, color: '#475569' }}>({stats.driftPct}%)</span>
              </div>
            </div>
          </div>

          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 10,
              border: '1px solid #E2E8F0',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(220, 38, 38, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldAlert size={16} color="#DC2626" />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>Scope Creep</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#DC2626', lineHeight: 1.1 }}>
                {stats.scope} <span style={{ fontSize: 11, fontWeight: 500, color: '#475569' }}>({stats.scopePct}%)</span>
              </div>
            </div>
          </div>

          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 10,
              border: '1px solid #E2E8F0',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={16} color="#4F46E5" />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>Dataset Source</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', lineHeight: 1.1 }}>
                {backendTraces.length > 0 ? 'FastAPI Repository' : 'Core Benchmark'}
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar & Filter Bar */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #E2E8F0',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
          }}
        >
          {/* Search bar */}
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
              minWidth: 260,
            }}
          >
            <Search size={14} color="#475569" strokeWidth={1.8} />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by trace ID, instruction, domain, or tool..."
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: 13,
                color: '#0F172A',
                width: '100%',
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, color: '#475569' }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Classification Filter Pills */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { id: 'all', label: 'All Traces (126)' },
              { id: 'clean', label: 'Nominal (54)' },
              { id: 'drift', label: 'Drift (37)' },
              { id: 'scope_creep', label: 'Scope Creep (27)' },
              { id: 'other', label: 'Other (8)' },
            ].map((f) => {
              const active = filterDev === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => {
                    setFilterDev(f.id);
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: '6px 12px',
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

          {/* Domain Dropdown */}
          <select
            value={filterDomain}
            onChange={(e) => {
              setFilterDomain(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              padding: '6px 10px',
              borderRadius: 7,
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              color: '#0F172A',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="all">All Domains</option>
            {domains.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {/* Difficulty Dropdown */}
          <select
            value={filterDifficulty}
            onChange={(e) => {
              setFilterDifficulty(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              padding: '6px 10px',
              borderRadius: 7,
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              color: '#0F172A',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="all">All Difficulties</option>
            <option value="easy">Easy Cases</option>
            <option value="medium">Medium Cases</option>
            <option value="hard">Hard Cases</option>
          </select>

          {/* Export Action */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              onClick={handleExportJSONL}
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
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#F8FAFC';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#FFFFFF';
              }}
            >
              <Download size={13} strokeWidth={2} />
              Export {selectedTraces.size > 0 ? `(${selectedTraces.size})` : 'JSONL'}
            </button>
          </div>
        </div>

        {/* Selected Items & Result Info */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
          <span style={{ fontSize: 13, color: '#475569' }}>
            Showing <strong>{filtered.length}</strong> matching traces
            {selectedTraces.size > 0 && (
              <span style={{ color: '#4F46E5', fontWeight: 600, marginLeft: 8 }}>
                • {selectedTraces.size} selected for batch action
              </span>
            )}
          </span>
          {(filterDev !== 'all' || filterDomain !== 'all' || filterDifficulty !== 'all' || search) && (
            <button
              onClick={() => {
                setFilterDev('all');
                setFilterDomain('all');
                setFilterDifficulty('all');
                setSearch('');
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#4F46E5',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <X size={12} /> Reset all filters
            </button>
          )}
        </div>

        {/* Main Table */}
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
                <th style={{ width: 44, padding: '11px 16px' }}>
                  <input
                    type="checkbox"
                    checked={selectedTraces.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                    style={{ accentColor: '#4F46E5', cursor: 'pointer' }}
                  />
                </th>
                <th
                  onClick={() => handleSort('id')}
                  style={{
                    padding: '11px 16px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#475569',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    TRACE ID
                    <ArrowUpDown size={11} color={sortField === 'id' ? '#4F46E5' : '#A3A8B0'} />
                  </div>
                </th>
                <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#475569' }}>
                  ORIGINAL INSTRUCTION
                </th>
                <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#475569' }}>
                  DOMAIN
                </th>
                <th
                  onClick={() => handleSort('steps')}
                  style={{
                    padding: '11px 16px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#475569',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    STEPS &amp; SPAN
                    <ArrowUpDown size={11} color={sortField === 'steps' ? '#4F46E5' : '#A3A8B0'} />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('latency')}
                  style={{
                    padding: '11px 16px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#475569',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    LATENCY
                    <ArrowUpDown size={11} color={sortField === 'latency' ? '#4F46E5' : '#A3A8B0'} />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('status')}
                  style={{
                    padding: '11px 16px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#475569',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    CLASSIFICATION
                    <ArrowUpDown size={11} color={sortField === 'status' ? '#4F46E5' : '#A3A8B0'} />
                  </div>
                </th>
                <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#475569' }}>
                  DIFFICULTY
                </th>
                <th style={{ padding: '11px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#475569' }}>
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedTraces.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '48px 16px', textAlign: 'center', color: '#475569' }}>
                    <Layers size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>No traces match your filter criteria</div>
                    <div style={{ fontSize: 12, marginTop: 4, color: '#475569' }}>
                      Try adjusting the search query or clearing the active filters.
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedTraces.map((trace, idx) => {
                  const isDev = trace.ground_truth.deviation_detected;
                  const devType = trace.ground_truth.deviation_type;
                  const flaggedStep = trace.ground_truth.flagged_step_id;
                  const isSelected = selectedTraces.has(trace.trace_id);
                  const isDrawerActive = activeDrawerTrace?.trace_id === trace.trace_id;

                  const badgeColor = !isDev ? '#059669' : devType === 'drift' ? '#D97706' : '#DC2626';
                  const badgeBg = !isDev ? 'rgba(5, 150, 105, 0.1)' : devType === 'drift' ? 'rgba(217, 119, 6, 0.1)' : 'rgba(220, 38, 38, 0.1)';

                  return (
                    <tr
                      key={trace.trace_id}
                      onClick={() => setActiveDrawerTrace(trace)}
                      style={{
                        borderBottom: idx < paginatedTraces.length - 1 ? '1px solid #F1F0E9' : 'none',
                        background: isDrawerActive
                          ? 'rgba(79, 70, 229, 0.1)'
                          : isSelected
                          ? 'rgba(130, 149, 129, 0.05)'
                          : '#FFFFFF',
                        cursor: 'pointer',
                        transition: 'background 0.12s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isDrawerActive && !isSelected) {
                          e.currentTarget.style.background = '#F8FAFC';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isDrawerActive && !isSelected) {
                          e.currentTarget.style.background = '#FFFFFF';
                        }
                      }}
                    >
                      {/* Checkbox */}
                      <td
                        style={{ padding: '12px 16px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(trace.trace_id);
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          style={{ accentColor: '#4F46E5', cursor: 'pointer' }}
                        />
                      </td>

                      {/* Trace ID */}
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontFamily: 'IBM Plex Mono, monospace',
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#0F172A',
                            background: '#F1F5F9',
                            padding: '3px 7px',
                            borderRadius: 4,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {trace.trace_id}
                        </span>
                      </td>

                      {/* Prompt */}
                      <td style={{ padding: '12px 16px', maxWidth: 320 }}>
                        <div
                          style={{
                            fontSize: 12.5,
                            color: '#0F172A',
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={trace.original_prompt}
                        >
                          {trace.original_prompt}
                        </div>
                      </td>

                      {/* Domain */}
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontSize: 11,
                            color: '#475569',
                            background: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            padding: '2px 8px',
                            borderRadius: 6,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {trace.domain}
                        </span>
                      </td>

                      {/* Steps & Mini Timeline Dots */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>
                            {trace.steps.length}
                          </span>
                          <div style={{ display: 'flex', gap: 3 }}>
                            {trace.steps.map((s) => {
                              const isStepDeviation = flaggedStep === s.step_id;
                              return (
                                <div
                                  key={s.step_id}
                                  title={`Step ${s.step_id}: ${s.tool_called || s.action_type}`}
                                  style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    background: isStepDeviation ? badgeColor : '#4F46E5',
                                    boxShadow: isStepDeviation ? `0 0 0 2px ${badgeColor}40` : undefined,
                                  }}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </td>

                      {/* Latency */}
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontFamily: 'IBM Plex Mono, monospace',
                            fontSize: 11.5,
                            color: '#475569',
                          }}
                        >
                          {trace.total_latency_ms}ms
                        </span>
                      </td>

                      {/* Classification Badge */}
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '3px 9px',
                            borderRadius: 12,
                            color: badgeColor,
                            background: badgeBg,
                            textTransform: 'capitalize',
                          }}
                        >
                          {!isDev ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                          {devType === 'none' ? 'Correct' : devType.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Difficulty */}
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: trace.seed_meta.difficulty === 'hard' ? '#DC2626' : trace.seed_meta.difficulty === 'medium' ? '#D97706' : '#059669',
                          }}
                        >
                          {trace.seed_meta.difficulty}
                        </span>
                      </td>

                      {/* Actions */}
                      <td
                        style={{ padding: '12px 16px', textAlign: 'right' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link
                          href={`/trace-analysis?id=${trace.trace_id}`}
                          style={{
                            fontSize: 11.5,
                            fontWeight: 600,
                            color: '#4F46E5',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 8px',
                            borderRadius: 6,
                            background: '#F1F5F9',
                          }}
                        >
                          Inspect <ArrowRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Pagination Controls */}
          <div
            style={{
              padding: '12px 18px',
              borderTop: '1px solid #E2E8F0',
              background: '#F8FAFC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 12,
              color: '#475569',
            }}
          >
            <div>
              Showing {filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} -{' '}
              {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} traces
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: 6,
                  padding: '4px 8px',
                  cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                  opacity: currentPage <= 1 ? 0.4 : 1,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <ChevronLeft size={14} />
              </button>
              <span>
                Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: 6,
                  padding: '4px 8px',
                  cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                  opacity: currentPage >= totalPages ? 0.4 : 1,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Slide-over Trace Inspection Drawer (LangSmith / Phoenix style) */}
      {activeDrawerTrace && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(41, 45, 50, 0.35)',
            zIndex: 9990,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setActiveDrawerTrace(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 580,
              height: '100vh',
              background: '#FFFFFF',
              borderLeft: '1px solid #E2E8F0',
              boxShadow: '-10px 0 35px rgba(41, 45, 50, 0.12)',
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid #E2E8F0',
                background: '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#0F172A',
                    background: '#F1F5F9',
                    padding: '3px 8px',
                    borderRadius: 6,
                  }}
                >
                  {activeDrawerTrace.trace_id}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '3px 9px',
                    borderRadius: 12,
                    color: !activeDrawerTrace.ground_truth.deviation_detected ? '#059669' : '#D97706',
                    background: !activeDrawerTrace.ground_truth.deviation_detected ? 'rgba(5, 150, 105, 0.1)' : 'rgba(217, 119, 6, 0.1)',
                    textTransform: 'capitalize',
                  }}
                >
                  {activeDrawerTrace.ground_truth.deviation_type === 'none'
                    ? 'Nominal / Correct'
                    : activeDrawerTrace.ground_truth.deviation_type.replace('_', ' ')}
                </span>
              </div>
              <button
                onClick={() => setActiveDrawerTrace(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 4,
                  cursor: 'pointer',
                  color: '#475569',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Sub-header Navigation Tabs */}
            <div
              style={{
                display: 'flex',
                borderBottom: '1px solid #E2E8F0',
                background: '#FFFFFF',
                padding: '0 24px',
              }}
            >
              {[
                { id: 'timeline', label: 'Step Timeline' },
                { id: 'policy', label: 'Intent & Boundaries' },
                { id: 'json', label: 'Raw Trace Payload' },
              ].map((tab) => {
                const active = drawerTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setDrawerTab(tab.id as 'timeline' | 'json' | 'policy')}
                    style={{
                      padding: '11px 16px',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: `2px solid ${active ? '#4F46E5' : 'transparent'}`,
                      color: active ? '#4F46E5' : '#475569',
                      fontSize: 12.5,
                      fontWeight: active ? 600 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Drawer Body Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {/* User Prompt Card */}
              <div
                style={{
                  background: '#F8FAFC',
                  borderRadius: 8,
                  border: '1px solid #E2E8F0',
                  padding: '12px 16px',
                  marginBottom: 16,
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Audited Instruction
                </div>
                <div style={{ fontSize: 13, color: '#0F172A', fontWeight: 500 }}>
                  {activeDrawerTrace.original_prompt}
                </div>
              </div>

              {/* Tab 1: Execution Timeline */}
              {drawerTab === 'timeline' && (
                <div>
                  {/* Flagged Deviation Anomaly Banner */}
                  {activeDrawerTrace.ground_truth.deviation_detected && (
                    <div
                      style={{
                        background: 'rgba(196, 154, 91, 0.1)',
                        border: '1px solid #D97706',
                        borderRadius: 8,
                        padding: '12px 16px',
                        marginBottom: 16,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <AlertTriangle size={15} color="#D97706" />
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#D97706' }}>
                          Failure Localized at Step {activeDrawerTrace.ground_truth.flagged_step_id}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: '#0F172A', lineHeight: 1.4 }}>
                        {activeDrawerTrace.ground_truth.explanation}
                      </div>
                    </div>
                  )}

                  {/* Step Waterfall */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                    Execution Sequence ({activeDrawerTrace.steps.length} steps • {activeDrawerTrace.total_latency_ms}ms)
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {activeDrawerTrace.steps.map((step) => {
                      const isFlagged = activeDrawerTrace.ground_truth.flagged_step_id === step.step_id;
                      return (
                        <div
                          key={step.step_id}
                          style={{
                            background: '#FFFFFF',
                            border: `1px solid ${isFlagged ? '#D97706' : '#E2E8F0'}`,
                            borderRadius: 8,
                            padding: '12px 14px',
                            boxShadow: isFlagged ? '0 0 0 1px #D97706' : undefined,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span
                                style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: '50%',
                                  background: isFlagged ? '#D97706' : '#4F46E5',
                                  color: '#FFFFFF',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {step.step_id}
                              </span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>
                                {step.tool_called || step.action_type}
                              </span>
                            </div>
                            <span
                              style={{
                                fontFamily: 'IBM Plex Mono, monospace',
                                fontSize: 10.5,
                                color: '#475569',
                                background: '#F8FAFC',
                                padding: '2px 6px',
                                borderRadius: 4,
                              }}
                            >
                              {step.latency_ms}ms
                            </span>
                          </div>

                          {step.agent_reasoning && (
                            <div style={{ fontSize: 11.5, color: '#475569', marginBottom: 6, fontStyle: 'italic' }}>
                              &quot;{step.agent_reasoning}&quot;
                            </div>
                          )}

                          {step.tool_input && (
                            <div
                              style={{
                                fontFamily: 'IBM Plex Mono, monospace',
                                fontSize: 11,
                                background: '#F8FAFC',
                                padding: '6px 10px',
                                borderRadius: 6,
                                color: '#0F172A',
                                overflowX: 'auto',
                                whiteSpace: 'pre-wrap',
                              }}
                            >
                              {step.tool_input}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tab 2: Intent & Policy */}
              {drawerTab === 'policy' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Allowed Actions
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {activeDrawerTrace.intent.allowed_actions.map((act) => (
                        <span
                          key={act}
                          style={{
                            fontSize: 11.5,
                            fontWeight: 600,
                            padding: '3px 9px',
                            background: 'rgba(5, 150, 105, 0.1)',
                            color: '#059669',
                            borderRadius: 6,
                          }}
                        >
                          ✓ {act}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Forbidden Actions
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {activeDrawerTrace.intent.forbidden_actions.map((act) => (
                        <span
                          key={act}
                          style={{
                            fontSize: 11.5,
                            fontWeight: 600,
                            padding: '3px 9px',
                            background: 'rgba(220, 38, 38, 0.1)',
                            color: '#DC2626',
                            borderRadius: 6,
                          }}
                        >
                          ✕ {act}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '12px 14px', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                      Difficulty Level: {activeDrawerTrace.seed_meta.difficulty.toUpperCase()}
                    </div>
                    {activeDrawerTrace.seed_meta.hard_case && (
                      <div style={{ fontSize: 11.5, color: '#0F172A' }}>
                        Edge Condition: {activeDrawerTrace.seed_meta.hard_case}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Raw JSON */}
              {drawerTab === 'json' && (
                <pre
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: 11,
                    background: '#0F172A',
                    color: '#F8FAFC',
                    padding: 16,
                    borderRadius: 8,
                    overflowX: 'auto',
                    maxHeight: '60vh',
                  }}
                >
                  {JSON.stringify(activeDrawerTrace, null, 2)}
                </pre>
              )}
            </div>

            {/* Drawer Footer Actions */}
            <div
              style={{
                padding: '14px 24px',
                borderTop: '1px solid #E2E8F0',
                background: '#F8FAFC',
                display: 'flex',
                gap: 10,
              }}
            >
              <Link
                href={`/trace-analysis?id=${activeDrawerTrace.trace_id}`}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '9px 16px',
                  borderRadius: 8,
                  background: '#4F46E5',
                  color: '#FFFFFF',
                  textDecoration: 'none',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Open Deep-Dive Workbench <ArrowRight size={14} />
              </Link>
              {activeDrawerTrace.ground_truth.deviation_detected && (
                <Link
                  href={`/causal-explanation?id=${activeDrawerTrace.trace_id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '9px 14px',
                    borderRadius: 8,
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    color: '#0F172A',
                    textDecoration: 'none',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Causal DAG
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
