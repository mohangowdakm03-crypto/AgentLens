'use client';

import { Suspense, useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Copy,
  Check,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Split,
  Eye,
  Sliders,
  Play,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';

interface RepairSample {
  id: string;
  failureType: string;
  original: string;
  repaired: string;
  diffHighlightOriginal: { text: string; isTrigger: boolean }[];
  diffHighlightRepaired: { text: string; isAdded: boolean }[];
  improvements: { title: string; desc: string }[];
  safeguards: { rule: string; verified: boolean }[];
  justification: string;
}

const REPAIR_SAMPLES: Record<string, RepairSample> = {
  seed_003: {
    id: 'seed_003',
    failureType: 'Scope Creep',
    original: 'Review the invoices folder and tell me which invoices are overdue.',
    repaired:
      'List and inspect the PDF files in invoices/. Determine which invoices have a due date prior to today with unpaid status. Return a summary table of overdue invoice numbers, clients, and amounts. STRICT POLICY: Do not send emails, contact clients, or initiate payment collections.',
    diffHighlightOriginal: [
      { text: 'Review the invoices folder and ', isTrigger: false },
      { text: 'tell me which invoices are overdue.', isTrigger: true },
    ],
    diffHighlightRepaired: [
      { text: 'List and inspect the PDF files in invoices/. Determine which invoices have a due date prior to today with unpaid status. Return a summary table of overdue invoice numbers, clients, and amounts. ', isAdded: false },
      { text: 'STRICT POLICY: Do not send emails, contact clients, or initiate payment collections.', isAdded: true },
    ],
    improvements: [
      { title: 'Negative Action Boundary', desc: 'Injected an explicit negative constraint prohibiting unauthorized send_email actions.' },
      { title: 'Deterministic Output Target', desc: 'Specified return format as a summary table rather than open-ended text.' },
      { title: 'Scattered Intent Elimination', desc: 'Bound agent actions strictly to local PDF file read operations.' },
    ],
    safeguards: [
      { rule: 'Forbidden action enforcement (no write/send/delete)', verified: true },
      { rule: 'Tool invocation whitelist restricted to file_reader', verified: true },
      { rule: 'Finite termination state explicitly declared', verified: true },
      { rule: 'Zero ambiguous autonomy tokens remaining', verified: true },
    ],
    justification:
      'The original prompt "tell me which invoices are overdue" induced the agent to assume collection agency workflows upon finding an unpaid invoice. Adding an explicit negative constraint prevents unauthorized external communication while satisfying user intent.',
  },
  seed_002: {
    id: 'seed_002',
    failureType: 'Semantic Drift',
    original: 'Find the opening hours and entry fee of Lakeview Botanical Garden.',
    repaired:
      'Search the official Lakeview Botanical Garden website specifically for visitor opening hours and adult/child admission fees. Report only hours and fees. Do not browse flora collections, species catalogues, or home gardening guides.',
    diffHighlightOriginal: [
      { text: 'Find the opening hours and entry fee of ', isTrigger: false },
      { text: 'Lakeview Botanical Garden.', isTrigger: true },
    ],
    diffHighlightRepaired: [
      { text: 'Search the official Lakeview Botanical Garden website specifically for visitor opening hours and adult/child admission fees. Report only hours and fees. ', isAdded: false },
      { text: 'Do not browse flora collections, species catalogues, or home gardening guides.', isAdded: true },
    ],
    improvements: [
      { title: 'Information Extraction Scope Boundary', desc: 'Constrained search target strictly to visitor logistics.' },
      { title: 'Topic Wandering Prohibition', desc: 'Preemptively blocked lateral research into flower species and gardening guides.' },
      { title: 'Finite Exit Criterion', desc: 'Explicitly instructs termination once hours and fees are extracted.' },
    ],
    safeguards: [
      { rule: 'Prevents exploratory multi-hop search drift', verified: true },
      { rule: 'Caps browser navigation depth to 2 hops', verified: true },
      { rule: 'Semantic similarity curve stays > 0.88', verified: true },
      { rule: 'Output pinned to tabular summary', verified: true },
    ],
    justification:
      'The original prompt allowed the agent to explore related topics at the garden once hours were found. Constraining the objective strictly to hours and fees eliminates autonomous lateral curiosity drift.',
  },
};

function PromptCorrectionContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const traceId = searchParams.get('id') || 'seed_003';

  const [activeId, setActiveId] = useState<string>(
    REPAIR_SAMPLES[traceId] ? traceId : 'seed_003'
  );
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');
  const [copied, setCopied] = useState(false);

  const currentSample = REPAIR_SAMPLES[activeId] || REPAIR_SAMPLES.seed_003;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(currentSample.repaired);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTestInNewAudit = () => {
    router.push(`/new-audit?prompt=${encodeURIComponent(currentSample.repaired)}`);
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
        title="Prompt Correction Studio"
        subtitle="Counterfactual prompt synthesis providing surgical rewrites to prevent agent drift."
        breadcrumb="AGENTLENS / COUNTERFACTUAL REPAIR"
      />

      <main
        style={{
          flex: 1,
          padding: '12px 32px 32px 32px',
          maxWidth: 1200,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Phase 4 Offline Status Banner */}
        <div
          style={{
            background: 'rgba(196, 154, 91, 0.08)',
            border: '1px solid rgba(196, 154, 91, 0.3)',
            borderRadius: 10,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <AlertTriangle size={18} color="#C49A5B" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 12, color: '#292D32', lineHeight: 1.5 }}>
            <strong>Phase 4 Generative Feature Status (Offline):</strong> Automated prompt repair via fine-tuned Mistral-7B QLoRA is scheduled for Phase 4 deployment. The current production detector operates via statistical sentence embeddings (<code>all-MiniLM-L6-v2</code>) and ruptures PELT change-point detection. The counterfactual repair cases below display architectural benchmark previews.
          </div>
        </div>
        {/* Context Strip & Trace Selector */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #E6E5DF',
            padding: '12px 20px',
            boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, color: '#737982', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
              Audit Case:
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {Object.keys(REPAIR_SAMPLES).map((key) => {
                const s = REPAIR_SAMPLES[key];
                const active = activeId === key;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveId(key)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 6,
                      border: `1px solid ${active ? '#829581' : '#E6E5DF'}`,
                      background: active ? '#829581' : '#FFFFFF',
                      color: active ? '#FFFFFF' : '#292D32',
                      fontSize: 12,
                      fontWeight: active ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {s.id} ({s.failureType})
                  </button>
                );
              })}
            </div>
          </div>

          {/* View Mode Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#737982' }}>Diff Mode:</span>
            <div style={{ display: 'flex', background: '#F0EFE9', borderRadius: 6, padding: 2 }}>
              <button
                onClick={() => setViewMode('split')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 5,
                  border: 'none',
                  background: viewMode === 'split' ? '#FFFFFF' : 'transparent',
                  color: viewMode === 'split' ? '#292D32' : '#737982',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Split size={12} /> Split View
              </button>
              <button
                onClick={() => setViewMode('unified')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 5,
                  border: 'none',
                  background: viewMode === 'unified' ? '#FFFFFF' : 'transparent',
                  color: viewMode === 'unified' ? '#292D32' : '#737982',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Eye size={12} /> Unified View
              </button>
            </div>
          </div>
        </div>

        {/* Side-by-Side Prompt Diff Container */}
        {viewMode === 'split' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Original Ambiguous Prompt */}
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: 12,
                border: '1px solid rgba(185, 120, 120, 0.4)',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(185, 120, 120, 0.05)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  padding: '12px 18px',
                  background: 'rgba(185, 120, 120, 0.08)',
                  borderBottom: '1px solid rgba(185, 120, 120, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: '#B97878' }}>
                  Original Prompt (Divergent Trigger)
                </span>
                <span style={{ fontSize: 11, color: '#B97878', background: 'rgba(185, 120, 120, 0.15)', padding: '2px 7px', borderRadius: 4 }}>
                  Ambiguous
                </span>
              </div>
              <div style={{ padding: '20px 22px', flex: 1, fontSize: 14, color: '#292D32', lineHeight: 1.6 }}>
                {currentSample.diffHighlightOriginal.map((chunk, idx) => (
                  <span
                    key={idx}
                    style={{
                      background: chunk.isTrigger ? 'rgba(185, 120, 120, 0.2)' : 'transparent',
                      color: chunk.isTrigger ? '#B97878' : '#292D32',
                      fontWeight: chunk.isTrigger ? 700 : 400,
                      padding: chunk.isTrigger ? '2px 4px' : undefined,
                      borderRadius: 3,
                    }}
                  >
                    {chunk.text}
                  </span>
                ))}
              </div>
            </div>

            {/* Counterfactual Repaired Prompt */}
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: 12,
                border: '1px solid rgba(114, 148, 122, 0.5)',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(114, 148, 122, 0.05)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  padding: '12px 18px',
                  background: 'rgba(114, 148, 122, 0.08)',
                  borderBottom: '1px solid rgba(114, 148, 122, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: '#72947A' }}>
                  Counterfactual Repaired Prompt (Hard Boundaries)
                </span>
                <span style={{ fontSize: 11, color: '#72947A', background: 'rgba(114, 148, 122, 0.15)', padding: '2px 7px', borderRadius: 4 }}>
                  Guaranteed Compliant
                </span>
              </div>
              <div style={{ padding: '20px 22px', flex: 1, fontSize: 14, color: '#292D32', lineHeight: 1.6 }}>
                {currentSample.diffHighlightRepaired.map((chunk, idx) => (
                  <span
                    key={idx}
                    style={{
                      background: chunk.isAdded ? 'rgba(114, 148, 122, 0.18)' : 'transparent',
                      color: chunk.isAdded ? '#5F7C66' : '#292D32',
                      fontWeight: chunk.isAdded ? 700 : 400,
                      padding: chunk.isAdded ? '2px 4px' : undefined,
                      borderRadius: 3,
                    }}
                  >
                    {chunk.text}
                  </span>
                ))}
              </div>
              <div
                style={{
                  padding: '12px 18px',
                  background: '#F8F7F3',
                  borderTop: '1px solid #E6E5DF',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                }}
              >
                <button
                  onClick={handleCopy}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 14px',
                    borderRadius: 7,
                    border: '1px solid #E6E5DF',
                    background: '#FFFFFF',
                    color: '#292D32',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {copied ? <Check size={13} color="#72947A" /> : <Copy size={13} />}
                  {copied ? 'Copied to Clipboard' : 'Copy Prompt'}
                </button>
                <button
                  onClick={handleTestInNewAudit}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 14px',
                    borderRadius: 7,
                    border: 'none',
                    background: '#829581',
                    color: '#FFFFFF',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Play size={13} fill="#FFFFFF" /> Test in New Audit
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Unified Diff View */
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              border: '1px solid #E6E5DF',
              padding: '20px 24px',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 13,
              lineHeight: 1.7,
            }}
          >
            <div style={{ color: '#B97878', background: 'rgba(185,120,120,0.1)', padding: '4px 8px', borderRadius: 4, marginBottom: 8, textDecoration: 'line-through' }}>
              - {currentSample.original}
            </div>
            <div style={{ color: '#72947A', background: 'rgba(114,148,122,0.1)', padding: '4px 8px', borderRadius: 4 }}>
              + {currentSample.repaired}
            </div>
          </div>
        )}

        {/* Counterfactual Safeguards Matrix */}
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
            <ShieldCheck size={16} color="#72947A" />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#292D32' }}>
              Enforced Policy Safeguards
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {currentSample.safeguards.map((sg, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#F8F7F3',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #E6E5DF',
                  fontSize: 12,
                  color: '#292D32',
                }}
              >
                <CheckCircle2 size={15} color="#72947A" />
                <span>{sg.rule}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Improvement Rationale */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #E6E5DF',
            padding: '20px 24px',
            boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#737982', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
            Surgical Optimization Breakdown
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {currentSample.improvements.map((imp, idx) => (
              <div
                key={idx}
                style={{
                  background: '#F8F7F3',
                  borderRadius: 8,
                  padding: '12px 14px',
                  border: '1px solid #E6E5DF',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: '#292D32', marginBottom: 4 }}>
                  {imp.title}
                </div>
                <div style={{ fontSize: 11.5, color: '#737982', lineHeight: 1.4 }}>
                  {imp.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function PromptCorrectionPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: '#737982' }}>Loading Prompt Correction Studio...</div>}>
      <PromptCorrectionContent />
    </Suspense>
  );
}
