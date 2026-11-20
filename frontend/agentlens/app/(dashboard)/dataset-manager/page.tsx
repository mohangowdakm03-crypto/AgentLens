'use client';

import { useState, useMemo } from 'react';
import {
  Database,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileText,
  BarChart2,
  Layers,
  ShieldCheck,
  Download,
  Search,
  ArrowRight,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ExternalLink,
  Tag,
  Info,
} from 'lucide-react';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import Button from '@/components/common/Button';
import { BENCHMARK_TRACES, BenchmarkTrace } from '@/lib/benchmark-traces';

const DATASET_INFO = {
  name: 'agentlens_detector_300.jsonl',
  totalTraces: 300,
  valid: 300,
  rejected: 23,
  classes: { none: 100, drift: 100, scope_creep: 100 },
  splits: { train: 210, validation: 60, test: 30 },
  domains: [
    { name: 'Software Engineering', count: 42, color: '#829581' },
    { name: 'DevOps & Cloud', count: 38, color: '#C49A5B' },
    { name: 'Data Analysis', count: 35, color: '#B97878' },
    { name: 'Personal Assistant', count: 32, color: '#72947A' },
    { name: 'Finance & Invoices', count: 28, color: '#9B8FC0' },
    { name: 'Research Papers', count: 25, color: '#6B9BB0' },
    { name: 'Cybersecurity', count: 22, color: '#829581' },
    { name: 'Other Domains', count: 78, color: '#737982' },
  ],
  validationStatus: 'passed',
  lastValidated: 'Nov 11, 2026 at 18:45',
};

const GATEWAY_STAGES = [
  'Stage 1: Pydantic v2 Strict Schema Validation',
  'Stage 2: SHA-256 Hash & Jaccard Deduplication',
  'Stage 3: Intent Disjoint Consistency Check',
  'Stage 4: Step Monotonicity (3–10 Steps)',
  'Stage 5: Anti-Degenerate Repetition Guard',
  'Stage 6: Ground Truth Trigger Coherence',
  'Stage 7: Tool Realism & Action Mapping',
];

export default function DatasetManagerPage() {
  const [activeTab, setActiveTab] = useState<'annotations' | 'gateway'>('annotations');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterDifficulty, setFilterDifficulty] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedAnnotation, setSelectedAnnotation] = useState<BenchmarkTrace | null>(null);
  const pageSize = 10;

  // Filter annotations
  const filteredAnnotations = useMemo(() => {
    return BENCHMARK_TRACES.filter((t) => {
      if (filterType !== 'all') {
        if (filterType === 'none' && t.ground_truth.deviation_detected) return false;
        if (filterType !== 'none' && t.ground_truth.deviation_type !== filterType) return false;
      }
      if (filterDifficulty !== 'all' && t.seed_meta.difficulty !== filterDifficulty) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesId = t.trace_id.toLowerCase().includes(q);
        const matchesPrompt = t.original_prompt.toLowerCase().includes(q);
        const matchesTrigger = (t.ground_truth.trigger_phrase || '').toLowerCase().includes(q);
        const matchesExp = (t.ground_truth.explanation || '').toLowerCase().includes(q);
        const matchesDomain = t.domain.toLowerCase().includes(q);
        if (!matchesId && !matchesPrompt && !matchesTrigger && !matchesExp && !matchesDomain) return false;
      }
      return true;
    });
  }, [search, filterType, filterDifficulty]);

  const totalPages = Math.ceil(filteredAnnotations.length / pageSize) || 1;
  const paginated = filteredAnnotations.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleExportAll = () => {
    const jsonl = BENCHMARK_TRACES.map((t) => JSON.stringify(t)).join('\n');
    const blob = new Blob([jsonl], { type: 'application/jsonl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agentlens_detector_300.jsonl';
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
        title="Reference Annotations & Dataset Manager"
        subtitle="Browse ground-truth benchmark labels, failure annotations, and 7-stage quality checks."
        breadcrumb="AGENTLENS / DATASETS"
      />

      <main
        style={{
          flex: 1,
          padding: '12px 32px 32px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #E6E5DF',
            paddingBottom: 4,
          }}
        >
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => setActiveTab('annotations')}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: activeTab === 'annotations' ? '#829581' : 'transparent',
                color: activeTab === 'annotations' ? '#FFFFFF' : '#737982',
                fontSize: 13,
                fontWeight: activeTab === 'annotations' ? 700 : 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
              }}
            >
              <FileText size={15} /> Reference Annotations ({filteredAnnotations.length})
            </button>
            <button
              onClick={() => setActiveTab('gateway')}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: activeTab === 'gateway' ? '#829581' : 'transparent',
                color: activeTab === 'gateway' ? '#FFFFFF' : '#737982',
                fontSize: 13,
                fontWeight: activeTab === 'gateway' ? 700 : 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
              }}
            >
              <ShieldCheck size={15} /> Quality Gateway &amp; Splits
            </button>
          </div>

          <button
            onClick={handleExportAll}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 7,
              border: '1px solid #E6E5DF',
              background: '#FFFFFF',
              color: '#292D32',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Download size={13} color="#829581" /> Export Dataset (JSONL)
          </button>
        </div>

        {/* TAB 1: REFERENCE ANNOTATIONS */}
        {activeTab === 'annotations' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Filter Toolbar */}
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: 12,
                border: '1px solid #E6E5DF',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
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
                  minWidth: 260,
                }}
              >
                <Search size={14} color="#737982" />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search annotations by trace ID, prompt, or trigger phrase..."
                  style={{
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    fontSize: 12.5,
                    color: '#292D32',
                    width: '100%',
                  }}
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#737982' }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Classification filter */}
              <select
                value={filterType}
                onChange={(e) => {
                  setFilterType(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: 7,
                  border: '1px solid #E6E5DF',
                  background: '#FFFFFF',
                  color: '#292D32',
                  fontSize: 12,
                  fontWeight: 500,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="all">All Annotation Classes</option>
                <option value="none">Nominal (Correct Execution)</option>
                <option value="drift">Semantic Drift</option>
                <option value="scope_creep">Scope Creep</option>
                <option value="prompt_misinterpretation">Prompt Misinterpretation</option>
                <option value="tool_misuse">Tool Misuse</option>
              </select>

              {/* Difficulty filter */}
              <select
                value={filterDifficulty}
                onChange={(e) => {
                  setFilterDifficulty(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: 7,
                  border: '1px solid #E6E5DF',
                  background: '#FFFFFF',
                  color: '#292D32',
                  fontSize: 12,
                  fontWeight: 500,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="all">All Difficulties</option>
                <option value="easy">Easy Cases</option>
                <option value="medium">Medium Cases</option>
                <option value="hard">Hard Cases</option>
              </select>

              {(search || filterType !== 'all' || filterDifficulty !== 'all') && (
                <button
                  onClick={() => {
                    setSearch('');
                    setFilterType('all');
                    setFilterDifficulty('all');
                    setCurrentPage(1);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#829581',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <X size={12} /> Reset
                </button>
              )}
            </div>

            {/* Annotations Data Table */}
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
                    <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#737982' }}>TRACE ID</th>
                    <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#737982' }}>INSTRUCTION</th>
                    <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#737982' }}>DOMAIN</th>
                    <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#737982' }}>ANNOTATED CLASS</th>
                    <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#737982' }}>FLAGGED STEP</th>
                    <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#737982' }}>TRIGGER PHRASE</th>
                    <th style={{ padding: '11px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#737982' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '48px 16px', textAlign: 'center', color: '#737982' }}>
                        <Database size={32} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#292D32' }}>No reference annotations match your filter</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>Try clearing the search or reset filters to view all annotations.</div>
                      </td>
                    </tr>
                  ) : (
                    paginated.map((trace, idx) => {
                      const isDev = trace.ground_truth.deviation_detected;
                      const devType = trace.ground_truth.deviation_type;
                      const badgeColor = !isDev ? '#72947A' : devType === 'drift' ? '#C49A5B' : '#B97878';
                      const badgeBg = !isDev ? 'rgba(114, 148, 122, 0.12)' : devType === 'drift' ? 'rgba(196, 154, 91, 0.12)' : 'rgba(185, 120, 120, 0.12)';

                      return (
                        <tr
                          key={trace.trace_id}
                          onClick={() => setSelectedAnnotation(trace)}
                          style={{
                            borderBottom: idx < paginated.length - 1 ? '1px solid #F1F0E9' : 'none',
                            cursor: 'pointer',
                            transition: 'background 0.12s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#F8F7F3';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#FFFFFF';
                          }}
                        >
                          <td style={{ padding: '12px 16px' }}>
                            <span
                              style={{
                                fontFamily: 'IBM Plex Mono, monospace',
                                fontSize: 12,
                                fontWeight: 700,
                                color: '#292D32',
                                background: '#F0EFE9',
                                padding: '3px 7px',
                                borderRadius: 4,
                              }}
                            >
                              {trace.trace_id}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', maxWidth: 300 }}>
                            <div
                              style={{
                                fontSize: 12.5,
                                color: '#292D32',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={trace.original_prompt}
                            >
                              {trace.original_prompt}
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontSize: 11, color: '#737982' }}>{trace.domain}</span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: badgeColor,
                                background: badgeBg,
                                padding: '3px 8px',
                                borderRadius: 10,
                                textTransform: 'capitalize',
                              }}
                            >
                              {devType === 'none' ? 'Nominal / None' : devType.replace('_', ' ')}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontSize: 12, color: trace.ground_truth.flagged_step_id ? badgeColor : '#737982', fontWeight: 600 }}>
                              {trace.ground_truth.flagged_step_id ? `Step ${trace.ground_truth.flagged_step_id}` : '—'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            {trace.ground_truth.trigger_phrase ? (
                              <span
                                style={{
                                  fontSize: 11,
                                  color: '#292D32',
                                  background: '#F0EFE9',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  fontFamily: 'IBM Plex Mono, monospace',
                                }}
                              >
                                &ldquo;{trace.ground_truth.trigger_phrase}&rdquo;
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, color: '#A3A8B0' }}>None</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#829581' }}>
                              Inspect Annotation →
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              <div
                style={{
                  padding: '12px 18px',
                  borderTop: '1px solid #E6E5DF',
                  background: '#F8F7F3',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  color: '#737982',
                }}
              >
                <div>
                  Showing {filteredAnnotations.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} -{' '}
                  {Math.min(currentPage * pageSize, filteredAnnotations.length)} of {filteredAnnotations.length} annotations
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #E6E5DF',
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
                      border: '1px solid #E6E5DF',
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
          </div>
        )}

        {/* TAB 2: QUALITY GATEWAY & SPLITS */}
        {activeTab === 'gateway' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Dataset Info Header Banner */}
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: 12,
                border: '1px solid #E6E5DF',
                padding: '20px 24px',
                boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
                display: 'flex',
                gap: 20,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 10,
                  background: 'rgba(130,149,129,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Database size={22} color="#829581" strokeWidth={1.8} />
              </div>

              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#292D32', fontFamily: 'IBM Plex Mono, monospace' }}>
                  {DATASET_INFO.name}
                </div>
                <div style={{ fontSize: 12, color: '#737982', marginTop: 3 }}>
                  Expanded dataset verified across 12 realistic enterprise domains
                </div>
              </div>

              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                {[
                  { label: 'Validated Traces', value: DATASET_INFO.valid, color: '#829581' },
                  { label: 'Rejected by Gateway', value: DATASET_INFO.rejected, color: '#B97878' },
                  { label: 'Validation Status', value: '7/7 Passed', color: '#72947A' },
                ].map((stat) => (
                  <div key={stat.label}>
                    <div style={{ fontSize: 11, color: '#737982' }}>{stat.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: stat.color, marginTop: 2 }}>
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Dataset Splits */}
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: 12,
                border: '1px solid #E6E5DF',
                padding: '20px 24px',
                boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Layers size={16} color="#829581" strokeWidth={1.8} />
                <span style={{ fontSize: 14, fontWeight: 600, color: '#292D32' }}>
                  Dataset Splits (70% Train / 20% Val / 10% Test)
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
                {[
                  { name: 'Train Set', count: 210, pct: '70%', color: '#829581' },
                  { name: 'Validation Set', count: 60, pct: '20%', color: '#C49A5B' },
                  { name: 'Test Holdout', count: 30, pct: '10%', color: '#B97878' },
                ].map((s) => (
                  <div
                    key={s.name}
                    style={{
                      padding: '14px 16px',
                      borderRadius: 8,
                      background: '#F8F7F3',
                      border: '1px solid #E6E5DF',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 11, color: '#737982' }}>{s.name}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: s.color, margin: '4px 0', fontFamily: 'IBM Plex Mono, monospace' }}>
                      {s.count}
                    </div>
                    <div style={{ fontSize: 10, color: '#737982' }}>{s.pct}</div>
                  </div>
                ))}
              </div>

              {/* Visual Split Segmented Bar */}
              <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', height: 26 }}>
                <div style={{ width: '70%', background: '#829581', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>
                  70% Train (210)
                </div>
                <div style={{ width: '20%', background: '#C49A5B', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>
                  20% Val (60)
                </div>
                <div style={{ width: '10%', background: '#B97878', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>
                  10% Test (30)
                </div>
              </div>
            </div>

            {/* 7-Stage Gateway Checks */}
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: 12,
                border: '1px solid #E6E5DF',
                padding: '20px 24px',
                boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <ShieldCheck size={18} color="#829581" strokeWidth={2} />
                <span style={{ fontSize: 14, fontWeight: 600, color: '#292D32' }}>
                  7-Stage Deterministic Quality Gateway
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {GATEWAY_STAGES.map((stg) => (
                  <div
                    key={stg}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: '#F8F7F3',
                      border: '1px solid #E6E5DF',
                      fontSize: 12,
                      color: '#292D32',
                    }}
                  >
                    <CheckCircle2 size={15} color="#72947A" strokeWidth={2.2} />
                    <span>{stg}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Selected Annotation Detail Modal / Drawer */}
        {selectedAnnotation && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(41, 45, 50, 0.4)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
            onClick={() => setSelectedAnnotation(null)}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 620,
                background: '#FFFFFF',
                borderRadius: 12,
                border: '1px solid #E6E5DF',
                boxShadow: '0 20px 40px rgba(41, 45, 50, 0.15)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid #E6E5DF',
                  background: '#F8F7F3',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, fontWeight: 700, color: '#292D32', background: '#F0EFE9', padding: '3px 8px', borderRadius: 4 }}>
                    {selectedAnnotation.trace_id}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: selectedAnnotation.ground_truth.deviation_detected ? '#C49A5B' : '#72947A', textTransform: 'capitalize' }}>
                    {selectedAnnotation.ground_truth.deviation_type.replace('_', ' ')}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedAnnotation(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#737982' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#737982', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                    Audited Instruction
                  </div>
                  <div style={{ fontSize: 13, color: '#292D32', lineHeight: 1.5, background: '#F8F7F3', padding: '10px 14px', borderRadius: 6, border: '1px solid #E6E5DF' }}>
                    {selectedAnnotation.original_prompt}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#737982', marginBottom: 2 }}>Domain &amp; Scenario</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#292D32' }}>
                      {selectedAnnotation.domain} ({selectedAnnotation.seed_meta.scenario})
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#737982', marginBottom: 2 }}>Evaluation Difficulty</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#292D32', textTransform: 'capitalize' }}>
                      {selectedAnnotation.seed_meta.difficulty}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#737982', marginBottom: 2 }}>Flagged Deviation Step</div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: selectedAnnotation.ground_truth.flagged_step_id ? '#C49A5B' : '#72947A' }}>
                      {selectedAnnotation.ground_truth.flagged_step_id ? `Step ${selectedAnnotation.ground_truth.flagged_step_id}` : 'None (Compliant)'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#737982', marginBottom: 2 }}>Trigger Phrase</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#292D32', fontFamily: 'IBM Plex Mono, monospace' }}>
                      {selectedAnnotation.ground_truth.trigger_phrase ? `"${selectedAnnotation.ground_truth.trigger_phrase}"` : 'None'}
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#737982', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                    Ground-Truth Rationale
                  </div>
                  <p style={{ margin: 0, fontSize: 12.5, color: '#292D32', lineHeight: 1.55 }}>
                    {selectedAnnotation.ground_truth.explanation || 'Normal on-task execution without policy violations.'}
                  </p>
                </div>

                {selectedAnnotation.seed_meta.hard_case && (
                  <div style={{ background: '#FAF9F6', border: '1px solid #E6E5DF', borderRadius: 6, padding: '10px 14px', fontSize: 11.5, color: '#737982' }}>
                    <strong>Edge Condition:</strong> {selectedAnnotation.seed_meta.hard_case}
                  </div>
                )}
              </div>

              <div style={{ padding: '12px 20px', borderTop: '1px solid #E6E5DF', background: '#F8F7F3', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <Link
                  href={`/trace-analysis?id=${selectedAnnotation.trace_id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 16px',
                    borderRadius: 7,
                    background: '#829581',
                    color: '#FFFFFF',
                    textDecoration: 'none',
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  Open in Trace Review &amp; Analysis <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
