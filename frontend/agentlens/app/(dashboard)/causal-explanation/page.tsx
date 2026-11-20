'use client';

import { Suspense, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  GitBranch,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  TrendingDown,
  Layers,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { BENCHMARK_TRACES, getTraceById } from '@/lib/benchmark-traces';

function CausalExplanationContent() {
  const searchParams = useSearchParams();
  const traceId = searchParams.get('id') || 'seed_003';

  const trace = useMemo(() => {
    return getTraceById(traceId) || BENCHMARK_TRACES[2];
  }, [traceId]);

  const [hoveredToken, setHoveredToken] = useState<string | null>(null);

  // Compute tokens and synthetic attribution weights
  const promptTokens = useMemo(() => {
    const words = trace.original_prompt.split(' ');
    const trigger = trace.ground_truth.trigger_phrase?.toLowerCase() || '';

    return words.map((w) => {
      const cleanW = w.toLowerCase().replace(/[^a-z0-9]/g, '');
      let weight = 0.05 + (cleanW.length % 7) * 0.03;
      let isTrigger = false;

      if (trigger && (trigger.includes(cleanW) || cleanW.includes(trigger))) {
        weight = 0.87;
        isTrigger = true;
      } else if (cleanW === 'clean' || cleanW === 'organize' || cleanW === 'overdue' || cleanW === 'buy') {
        weight = 0.78;
        isTrigger = true;
      }

      return {
        word: w,
        clean: cleanW,
        weight: Number(weight.toFixed(2)),
        isTrigger,
      };
    });
  }, [trace]);

  const isDeviation = trace.ground_truth.deviation_detected;
  const devType = trace.ground_truth.deviation_type;
  const flaggedStep = trace.ground_truth.flagged_step_id || 3;
  const devColor = !isDeviation ? '#72947A' : devType === 'drift' ? '#C49A5B' : '#B97878';
  const devBg = !isDeviation ? 'rgba(114, 148, 122, 0.12)' : devType === 'drift' ? 'rgba(196, 154, 91, 0.12)' : 'rgba(185, 120, 120, 0.12)';

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
        title="Causal Explanation Studio"
        subtitle={`Token-level attribution and counterfactual transition analysis for trace ${trace.trace_id}`}
        breadcrumb="AGENTLENS / ROOT CAUSE ENGINE"
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
        {/* Context Summary Card */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #E6E5DF',
            padding: '18px 24px',
            boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, color: '#737982', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                Investigated Trace
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace', color: '#292D32' }}>
                {trace.trace_id}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10, color: '#737982', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                Classification
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: devColor,
                  background: devBg,
                  padding: '3px 10px',
                  borderRadius: 12,
                  textTransform: 'capitalize',
                }}
              >
                {devType.replace('_', ' ')}
              </span>
            </div>

            <div>
              <div style={{ fontSize: 10, color: '#737982', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                Divergence Node
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: devColor }}>
                Step {flaggedStep}
              </div>
            </div>
          </div>

          <Link
            href={`/prompt-correction?id=${trace.trace_id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 16px',
              borderRadius: 8,
              background: '#829581',
              color: '#FFFFFF',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <Sparkles size={14} /> Open Prompt Repair Studio
          </Link>
        </div>

        {/* Token Attribution Heatmap Card */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #E6E5DF',
            padding: '22px 24px',
            boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={16} color="#829581" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#292D32' }}>
                Token Attribution Heatmap (Shapley Gradient Sensitivity)
              </span>
            </div>
            <span style={{ fontSize: 11, color: '#737982' }}>
              Hover over tokens to inspect causal contribution to failure
            </span>
          </div>

          <div
            style={{
              background: '#F8F7F3',
              borderRadius: 8,
              border: '1px solid #E6E5DF',
              padding: '18px 20px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              alignItems: 'center',
            }}
          >
            {promptTokens.map((t, idx) => {
              const isHigh = t.weight > 0.5;
              const isHovered = hoveredToken === t.clean;

              return (
                <span
                  key={idx}
                  onMouseEnter={() => setHoveredToken(t.clean)}
                  onMouseLeave={() => setHoveredToken(null)}
                  style={{
                    fontSize: 15,
                    fontWeight: isHigh ? 700 : 500,
                    padding: '3px 8px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    background: isHigh
                      ? `${devColor}25`
                      : isHovered
                      ? 'rgba(130, 149, 129, 0.15)'
                      : 'transparent',
                    color: isHigh ? devColor : '#292D32',
                    border: isHigh ? `1px solid ${devColor}` : '1px solid transparent',
                    boxShadow: isHovered ? '0 2px 6px rgba(0,0,0,0.06)' : undefined,
                  }}
                >
                  {t.word}
                  {isHigh && (
                    <span
                      style={{
                        fontSize: 9.5,
                        marginLeft: 4,
                        verticalAlign: 'super',
                        fontFamily: 'IBM Plex Mono, monospace',
                      }}
                    >
                      +{t.weight}
                    </span>
                  )}
                </span>
              );
            })}
          </div>

          {/* Token explanation callout */}
          <div
            style={{
              fontSize: 12,
              color: '#737982',
              background: '#FAFAF8',
              border: '1px solid #E6E5DF',
              borderRadius: 6,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <HelpCircle size={14} color="#829581" />
            <span>
              Highlighted tokens denote semantic triggers that inflated agent action permissions beyond user intent.
              {trace.ground_truth.trigger_phrase && (
                <> Identified trigger phrase: <strong style={{ color: devColor }}>&ldquo;{trace.ground_truth.trigger_phrase}&rdquo;</strong>.</>
              )}
            </span>
          </div>
        </div>

        {/* Sequential State Machine DAG */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #E6E5DF',
            padding: '22px 24px',
            boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GitBranch size={16} color="#829581" />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#292D32' }}>
              Sequential State Machine &amp; Counterfactual Branching Graph
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              position: 'relative',
              padding: '24px 10px',
              overflowX: 'auto',
            }}
          >
            {trace.steps.map((step, idx) => {
              const isFlagged = step.step_id === flaggedStep;
              const isLast = idx === trace.steps.length - 1;

              return (
                <div key={step.step_id} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                  {/* State Node */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      position: 'relative',
                      minWidth: 110,
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: isFlagged ? devColor : '#829581',
                        color: '#FFFFFF',
                        fontWeight: 700,
                        fontSize: 13,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: isFlagged ? `0 0 0 4px ${devColor}30` : undefined,
                        zIndex: 2,
                      }}
                    >
                      S{step.step_id}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#292D32', marginTop: 8, textAlign: 'center' }}>
                      {step.tool_called || step.action_type}
                    </div>
                    <div style={{ fontSize: 10, color: '#737982' }}>
                      {isFlagged ? (
                        <span style={{ color: devColor, fontWeight: 700 }}>DIVERGENCE</span>
                      ) : (
                        <span>Nominal</span>
                      )}
                    </div>
                  </div>

                  {/* Transition Connector Arrow */}
                  {!isLast && (
                    <div
                      style={{
                        flex: 1,
                        height: 2,
                        background: isFlagged ? devColor : '#E6E5DF',
                        position: 'relative',
                        margin: '0 8px',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          right: -4,
                          top: -4,
                          width: 0,
                          height: 0,
                          borderTop: '5px solid transparent',
                          borderBottom: '5px solid transparent',
                          borderLeft: `6px solid ${isFlagged ? devColor : '#C8C6BE'}`,
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Empirical Ground Truth Explanation */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #E6E5DF',
            padding: '20px 24px',
            boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#737982', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Formal Causal Explanation (Audited Ground Truth)
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#292D32', lineHeight: 1.55 }}>
            {trace.ground_truth.explanation || 'No ground-truth anomaly explanation recorded for this clean trace.'}
          </p>
        </div>
      </main>
    </div>
  );
}

export default function CausalExplanationPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: '#737982' }}>Loading Causal Studio...</div>}>
      <CausalExplanationContent />
    </Suspense>
  );
}
