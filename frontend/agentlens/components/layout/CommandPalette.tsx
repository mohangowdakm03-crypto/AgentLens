'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  LayoutDashboard,
  Plus,
  Layers,
  AlertTriangle,
  GitBranch,
  Sparkles,
  Clock,
  BarChart2,
  Database,
  ArrowRight,
  X,
  FileText,
} from 'lucide-react';
import { BENCHMARK_TRACES } from '@/lib/benchmark-traces';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const STATIC_PAGES = [
  { href: '/overview', title: 'Overview Dashboard', category: 'Navigation', icon: LayoutDashboard, desc: 'High-level auditing KPIs and outcome distribution' },
  { href: '/new-audit', title: 'New Audit Session', category: 'Actions', icon: Plus, desc: 'Execute live trace audit with counterfactual repair' },
  { href: '/trace-explorer', title: 'Trace Explorer', category: 'Observability', icon: Layers, desc: 'Browse, filter, and inspect all audited agent sessions' },
  { href: '/trace-analysis', title: 'Trace Analysis (AL-0299)', category: 'Observability', icon: FileText, desc: 'Deep dive execution timeline and failure localization' },
  { href: '/deviation-analysis', title: 'Deviation Analysis', category: 'Diagnostics', icon: AlertTriangle, desc: 'Compare nominal vs observed trajectory divergence' },
  { href: '/causal-explanation', title: 'Causal Explanation', category: 'Diagnostics', icon: GitBranch, desc: 'Identify root-cause trigger tokens & transition DAG' },
  { href: '/prompt-correction', title: 'Prompt Correction Studio', category: 'Repair', icon: Sparkles, desc: 'Side-by-side prompt diff with counterfactual safeguards' },
  { href: '/audit-history', title: 'Audit History', category: 'Records', icon: Clock, desc: 'Historical audit execution logs and run telemetry' },
  { href: '/evaluation', title: 'Benchmark Evaluation', category: 'Metrics', icon: BarChart2, desc: 'Model performance, confusion matrix & telemetry' },
  { href: '/dataset-manager', title: 'Dataset Manager', category: 'Data', icon: Database, desc: '300-trace split visualizer and 7-stage quality gateway' },
];

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      const resetId = window.setTimeout(() => {
        setQuery('');
        setSelectedIndex(0);
      }, 0);
      return () => window.clearTimeout(resetId);
    }
    return undefined;
  }, [isOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // open command palette
          const event = new CustomEvent('open-command-palette');
          window.dispatchEvent(event);
        }
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Filter pages
  const q = query.toLowerCase().trim();
  const filteredPages = STATIC_PAGES.filter(
    (p) => p.title.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
  );

  // Filter traces (up to 8)
  const matchingTraces = q.length > 0
    ? BENCHMARK_TRACES.filter(
        (t) =>
          t.trace_id.toLowerCase().includes(q) ||
          t.original_prompt.toLowerCase().includes(q) ||
          t.domain.toLowerCase().includes(q) ||
          t.ground_truth.deviation_type.toLowerCase().includes(q)
      ).slice(0, 8)
    : [];

  const totalResults = filteredPages.length + matchingTraces.length;

  const handleSelect = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(41, 45, 50, 0.45)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 640,
          background: '#FFFFFF',
          borderRadius: 12,
          border: '1px solid #E6E5DF',
          boxShadow: '0 20px 45px rgba(41, 45, 50, 0.16)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '75vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px 18px',
            borderBottom: '1px solid #E6E5DF',
            background: '#F8F7F3',
            gap: 12,
          }}
        >
          <Search size={18} color="#829581" strokeWidth={2.2} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search pages, traces, instructions, or failure types..."
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontSize: 14,
              color: '#292D32',
              fontWeight: 500,
            }}
          />
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 4,
              cursor: 'pointer',
              color: '#737982',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Results list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
          {totalResults === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: '#737982' }}>
              <Layers size={32} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
              <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>No matching pages or traces found</p>
              <p style={{ fontSize: 11.5, color: '#9CA3AF', margin: '4px 0 0' }}>Try searching for &quot;drift&quot;, &quot;invoices&quot;, or &quot;seed_002&quot;</p>
            </div>
          ) : (
            <>
              {/* Pages Section */}
              {filteredPages.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#737982', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 10px' }}>
                    Application Pages ({filteredPages.length})
                  </div>
                  {filteredPages.map((page, idx) => {
                    const Icon = page.icon;
                    return (
                      <div
                        key={page.href}
                        onClick={() => handleSelect(page.href)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 12px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          transition: 'background 0.12s ease',
                          background: idx === selectedIndex && matchingTraces.length === 0 ? 'rgba(130, 149, 129, 0.12)' : 'transparent',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(130, 149, 129, 0.12)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            background: '#F0EFE9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <Icon size={14} color="#829581" strokeWidth={2} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#292D32' }}>{page.title}</div>
                          <div style={{ fontSize: 11, color: '#737982', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {page.desc}
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: 10,
                            padding: '2px 7px',
                            background: '#F0EFE9',
                            color: '#737982',
                            borderRadius: 4,
                            fontWeight: 600,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {page.category}
                        </span>
                        <ArrowRight size={14} color="#829581" />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Traces Section */}
              {matchingTraces.length > 0 && (
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#737982', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 10px' }}>
                    Matching Benchmark Traces ({matchingTraces.length})
                  </div>
                  {matchingTraces.map((trace) => {
                    const isDev = trace.ground_truth.deviation_detected;
                    const devType = trace.ground_truth.deviation_type;
                    const badgeColor = !isDev ? '#72947A' : devType === 'drift' ? '#C49A5B' : '#B97878';
                    const badgeBg = !isDev ? 'rgba(114, 148, 122, 0.12)' : devType === 'drift' ? 'rgba(196, 154, 91, 0.12)' : 'rgba(185, 120, 120, 0.12)';

                    return (
                      <div
                        key={trace.trace_id}
                        onClick={() => handleSelect(`/trace-analysis?id=${trace.trace_id}`)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 12px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          transition: 'background 0.12s ease',
                          borderBottom: '1px solid #F1F0E9',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(130, 149, 129, 0.12)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'IBM Plex Mono, monospace',
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#292D32',
                            background: '#F0EFE9',
                            padding: '2px 7px',
                            borderRadius: 4,
                          }}
                        >
                          {trace.trace_id}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 12.5,
                              color: '#292D32',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {trace.original_prompt}
                          </div>
                          <div style={{ fontSize: 11, color: '#737982' }}>
                            {trace.domain} • {trace.steps.length} steps{trace.total_latency_ms != null ? ` • ${trace.total_latency_ms}ms` : ''}
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: 10.5,
                            padding: '3px 8px',
                            borderRadius: 12,
                            fontWeight: 600,
                            color: badgeColor,
                            background: badgeBg,
                            textTransform: 'capitalize',
                          }}
                        >
                          {devType === 'none' ? 'Correct' : devType.replace('_', ' ')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer shortcuts */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 18px',
            borderTop: '1px solid #E6E5DF',
            background: '#F8F7F3',
            fontSize: 11,
            color: '#737982',
          }}
        >
          <div style={{ display: 'flex', gap: 14 }}>
            <span><kbd style={{ background: '#FFFFFF', border: '1px solid #E6E5DF', padding: '1px 5px', borderRadius: 3 }}>↵</kbd> Select</span>
            <span><kbd style={{ background: '#FFFFFF', border: '1px solid #E6E5DF', padding: '1px 5px', borderRadius: 3 }}>esc</kbd> Dismiss</span>
          </div>
          <span>AgentLens Auditor Command Palette</span>
        </div>
      </div>
    </div>
  );
}
