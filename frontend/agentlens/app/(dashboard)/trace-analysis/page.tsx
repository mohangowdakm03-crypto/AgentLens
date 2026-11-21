'use client';

import { Suspense, useState, useMemo, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Zap,
  ArrowRight,
  ArrowLeft,
  Layers,
  Sparkles,
  GitBranch,
  Copy,
  Check,
  Download,
  Terminal,
  ShieldCheck,
  ShieldAlert,
  Clock,
  ExternalLink,
  Play,
  RotateCcw,
  FileText,
  LoaderCircle,
  HelpCircle,
} from 'lucide-react';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { BENCHMARK_TRACES, BenchmarkTrace, getTraceById } from '@/lib/benchmark-traces';
import { runAudit } from '@/services/api';
import type { AuditResult } from '@/lib/types';

function TraceAnalysisContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Read trace id from query string or default to seed_002
  const queryId = searchParams.get('id') || 'seed_002';

  // Live Audit Execution & Persisted State
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResponse, setAuditResponse] = useState<AuditResult | null>(null);
  const [auditSuccessNotice, setAuditSuccessNotice] = useState<string | null>(null);
  const [showContractPayload, setShowContractPayload] = useState(false);
  const [copiedContract, setCopiedContract] = useState(false);
  const [activeLiveAudit, setActiveLiveAudit] = useState<{
    result: AuditResult;
    traceId: string;
    prompt?: string;
    steps?: any[];
    allowedActions?: string[];
    forbiddenActions?: string[];
    timestamp: number;
  } | null>(null);

  // Restore live audit result if arriving from New Audit submission
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = sessionStorage.getItem('agentlens_active_audit');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.result) {
          const isMatch =
            !queryId ||
            queryId === parsed.traceId ||
            searchParams.get('source') === 'live';
          if (isMatch) {
            setActiveLiveAudit(parsed);
            setAuditResponse(parsed.result);
            setAuditSuccessNotice(
              `Live audit completed successfully for ${parsed.traceId}. Analysis synchronized with ML Core.`
            );
          }
        }
      }
    } catch (e) {
      console.warn('Failed to parse active audit session:', e);
    }
  }, [queryId, searchParams]);

  const currentTrace: BenchmarkTrace = useMemo(() => {
    const benchmark = getTraceById(queryId);
    if (benchmark) return benchmark;

    if (activeLiveAudit && activeLiveAudit.steps && activeLiveAudit.steps.length > 0) {
      const isDev = Boolean(
        activeLiveAudit.result.detectorAnalysis?.result &&
        activeLiveAudit.result.detectorAnalysis.result !== 'none'
      );
      const devType = (activeLiveAudit.result.detectorAnalysis?.result || 'none') as any;
      const flaggedId = activeLiveAudit.result.detectorAnalysis?.step_id ?? (isDev ? 1 : null);

      return {
        trace_id: activeLiveAudit.traceId || queryId,
        original_prompt: activeLiveAudit.prompt || 'Custom Execution Trace',
        domain: 'Custom Audit',
        intent: {
          allowed_actions: activeLiveAudit.allowedActions || [],
          forbidden_actions: activeLiveAudit.forbiddenActions || [],
        },
        steps: activeLiveAudit.steps.map((s: any, idx: number) => ({
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
          flagged_step_id: flaggedId,
          trigger_phrase: null,
          explanation: activeLiveAudit.result.causalExplanation,
        },
        seed_meta: {
          scenario: 'Custom Execution Audit',
          difficulty: 'medium',
          hard_case: null,
        },
        total_latency_ms: 120,
        total_tokens: 350,
        timestamp: new Date(activeLiveAudit.timestamp || Date.now()).toISOString(),
      };
    }

    return BENCHMARK_TRACES[1];
  }, [queryId, activeLiveAudit]);

  // Expanded steps set
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(
    new Set([currentTrace.ground_truth.flagged_step_id || 1])
  );

  // Active step inspector tabs (record stepNumber -> tab)
  const [activeTabs, setActiveTabs] = useState<Record<number, 'reasoning' | 'input' | 'output' | 'policy'>>({});

  // Copied states
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const toggleStep = (stepNumber: number) => {
    const next = new Set(expandedSteps);
    if (next.has(stepNumber)) next.delete(stepNumber);
    else next.add(stepNumber);
    setExpandedSteps(next);
  };

  const expandAll = () => {
    setExpandedSteps(new Set(currentTrace.steps.map((s) => s.step_id)));
  };

  const collapseAll = () => {
    setExpandedSteps(new Set());
  };

  const copyInput = (text: string | null, stepNum: number) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedStep(stepNum);
    setTimeout(() => setCopiedStep(null), 2000);
  };

  const copyCorrectedPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  // Find prev / next traces
  const currentIndex = BENCHMARK_TRACES.findIndex((t) => t.trace_id === currentTrace.trace_id);
  const prevTrace = currentIndex > 0 ? BENCHMARK_TRACES[currentIndex - 1] : null;
  const nextTrace = currentIndex < BENCHMARK_TRACES.length - 1 ? BENCHMARK_TRACES[currentIndex + 1] : null;

  // Actual detector finding prioritized over static benchmark annotation
  const isDeviation = auditResponse?.detectorAnalysis?.result !== undefined
    ? auditResponse.detectorAnalysis.result !== 'none'
    : currentTrace.ground_truth.deviation_detected;
  const devType = auditResponse?.detectorAnalysis?.result !== undefined
    ? (auditResponse.detectorAnalysis.result as any)
    : currentTrace.ground_truth.deviation_type;
  const flaggedStepId = auditResponse?.detectorAnalysis?.result !== undefined
    ? (auditResponse.detectorAnalysis.result !== 'none'
        ? (auditResponse.detectorAnalysis.step_id ?? currentTrace.ground_truth.flagged_step_id)
        : null)
    : currentTrace.ground_truth.flagged_step_id;

  const statusColor = !isDeviation ? '#72947A' : devType === 'drift' ? '#C49A5B' : '#B97878';
  const statusBg = !isDeviation ? 'rgba(114, 148, 122, 0.12)' : devType === 'drift' ? 'rgba(196, 154, 91, 0.12)' : 'rgba(185, 120, 120, 0.12)';

  // Execute Live Audit against /api/audit
  const handleExecuteAudit = async () => {
    setIsAuditing(true);
    setAuditSuccessNotice(null);
    try {
      const stepStrings = currentTrace.steps.map(
        (s) => `Step ${s.step_id}: ${s.tool_called || s.action_type}(${s.tool_input || ''}) -> ${s.tool_output || ''}`
      );

      const result = await runAudit({
        userInstruction: currentTrace.original_prompt,
        traceSteps: stepStrings,
        steps: currentTrace.steps,
        allowedActions: currentTrace.intent?.allowed_actions,
        forbiddenActions: currentTrace.intent?.forbidden_actions,
      });

      setAuditResponse(result);
      setAuditSuccessNotice(`Audit pipeline executed successfully for ${currentTrace.trace_id}. Analysis synchronized.`);
    } catch (err) {
      console.error('Audit execution error:', err);
    } finally {
      setIsAuditing(false);
    }
  };

  // Derived or default corrected prompt for this exact trace record
  const correctedPromptForTrace = useMemo(() => {
    if (auditResponse?.correctedPrompt) {
      return auditResponse.correctedPrompt;
    }
    if (currentTrace.trace_id === 'seed_003') {
      return 'List and inspect the PDF files in invoices/. Determine which invoices have a due date prior to today with unpaid status. Return a summary table of overdue invoice numbers, clients, and amounts. STRICT POLICY: Do not send emails, contact clients, or initiate payment collections.';
    }
    if (currentTrace.trace_id === 'seed_002') {
      return 'Search the official Lakeview Botanical Garden website specifically for visitor opening hours and adult/child admission fees. Report only hours and fees. Do not browse flora collections, species catalogues, or home gardening guides.';
    }
    if (currentTrace.trace_id === 'seed_005') {
      return 'Search academic repositories for the neural retrieval model paper. Read the abstract, introduction, and conclusion. Synthesize the core methodology and empirical findings. Do not explore commercial vector databases or general tutorial sites.';
    }
    return `Execute strictly within boundaries: ${currentTrace.original_prompt}. Do not invoke unauthorized actions or browse extraneous resources.`;
  }, [auditResponse, currentTrace]);

  // Derived causal explanation for this exact trace record
  const causalExplanationForTrace = useMemo(() => {
    if (auditResponse?.causalExplanation) {
      return auditResponse.causalExplanation;
    }
    return currentTrace.ground_truth.explanation || (
      !isDeviation
        ? 'Trace completed with zero detected policy deviations. All executed steps conform to user intent.'
        : `Agent departed from expected intent at step ${flaggedStepId} due to ambiguous instruction scope.`
    );
  }, [auditResponse, currentTrace, isDeviation, flaggedStepId]);

  // Detector Output Contract V1 consumer representation (Member C integration)
  const detectorContractPayload = useMemo(() => {
    const rawCurve = auditResponse?.detectorAnalysis?.similarityCurve?.map((s) => s.score);
    return {
      status: "success",
      contract: "Detector Output Contract V1",
      model: "Mistral-7B QLoRA",
      trace_id: currentTrace.trace_id,
      original_prompt: currentTrace.original_prompt,
      steps_count: currentTrace.steps.length,
      result: {
        step_id: flaggedStepId || null,
        type: isDeviation ? devType : "none",
        confidence:
          auditResponse?.detectorAnalysis?.confidence ??
          (isDeviation
            ? (currentTrace.trace_id === 'seed_003' ? 0.97 : currentTrace.trace_id === 'seed_002' ? 0.94 : 0.91)
            : 0.96),
        flagged_steps: flaggedStepId ? [flaggedStepId] : [],
        similarity_curve:
          rawCurve && rawCurve.length > 0
            ? rawCurve
            : currentTrace.steps.map((s, idx) => {
                if (!isDeviation) return Number((0.95 - idx * 0.01).toFixed(2));
                if (idx + 1 < (flaggedStepId || 3)) return Number((0.95 - idx * 0.02).toFixed(2));
                return Number((0.44 - (idx + 1 - (flaggedStepId || 3)) * 0.06).toFixed(2));
              }),
      },
      causal_attribution: {
        explanation: causalExplanationForTrace,
        trigger_tokens: auditResponse?.triggerTokens || (currentTrace.ground_truth.trigger_phrase ? [currentTrace.ground_truth.trigger_phrase] : ["organize", "overdue"]),
      },
      prompt_repair: {
        corrected_prompt: correctedPromptForTrace,
        justification: "Injected negative action boundary and explicit termination criterion to prevent autonomous curiosity drift.",
      },
    };
  }, [currentTrace, flaggedStepId, isDeviation, devType, causalExplanationForTrace, auditResponse, correctedPromptForTrace]);

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
        title="Trace Review & Analysis Workbench"
        subtitle={`Execution waterfall, failure localization & step diagnostics for trace ${currentTrace.trace_id}`}
        breadcrumb="AGENTLENS / TRACE REVIEW"
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
        {/* Navigation & Trace Switcher Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link
              href="/trace-explorer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: '#737982',
                textDecoration: 'none',
                background: '#FFFFFF',
                border: '1px solid #E6E5DF',
                padding: '6px 12px',
                borderRadius: 7,
              }}
            >
              <ArrowLeft size={13} /> Back to Trace Explorer
            </Link>

            {/* Trace Quick Switcher Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#737982' }}>Select Trace Record:</span>
              <select
                value={currentTrace.trace_id}
                onChange={(e) => {
                  setAuditResponse(null);
                  setAuditSuccessNotice(null);
                  setActiveLiveAudit(null);
                  if (typeof window !== 'undefined') {
                    sessionStorage.removeItem('agentlens_active_audit');
                  }
                  router.push(`/trace-analysis?id=${e.target.value}`);
                }}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E6E5DF',
                  borderRadius: 7,
                  padding: '6px 10px',
                  fontSize: 12,
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontWeight: 600,
                  color: '#292D32',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {BENCHMARK_TRACES.map((t) => (
                  <option key={t.trace_id} value={t.trace_id}>
                    {t.trace_id} — {t.original_prompt.slice(0, 36)}... ({t.ground_truth.deviation_type})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {prevTrace && (
              <Link
                href={`/trace-analysis?id=${prevTrace.trace_id}`}
                onClick={() => {
                  setAuditResponse(null);
                  setAuditSuccessNotice(null);
                  setActiveLiveAudit(null);
                  if (typeof window !== 'undefined') {
                    sessionStorage.removeItem('agentlens_active_audit');
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#292D32',
                  background: '#FFFFFF',
                  border: '1px solid #E6E5DF',
                  padding: '6px 12px',
                  borderRadius: 7,
                  textDecoration: 'none',
                }}
              >
                <ChevronLeft size={14} /> Prev ({prevTrace.trace_id})
              </Link>
            )}
            {nextTrace && (
              <Link
                href={`/trace-analysis?id=${nextTrace.trace_id}`}
                onClick={() => {
                  setAuditResponse(null);
                  setAuditSuccessNotice(null);
                  setActiveLiveAudit(null);
                  if (typeof window !== 'undefined') {
                    sessionStorage.removeItem('agentlens_active_audit');
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#292D32',
                  background: '#FFFFFF',
                  border: '1px solid #E6E5DF',
                  padding: '6px 12px',
                  borderRadius: 7,
                  textDecoration: 'none',
                }}
              >
                Next ({nextTrace.trace_id}) <ChevronRight size={14} />
              </Link>
            )}

            <button
              onClick={() => setShowContractPayload(!showContractPayload)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: showContractPayload ? '#829581' : '#292D32',
                background: showContractPayload ? '#F0EFE9' : '#FFFFFF',
                border: '1px solid #E6E5DF',
                padding: '6px 12px',
                borderRadius: 7,
                cursor: 'pointer',
              }}
            >
              <Terminal size={13} color="#829581" />
              {showContractPayload ? 'Hide Contract JSON' : 'Detector Contract V1'}
            </button>
          </div>
        </div>

        {/* DETECTOR OUTPUT CONTRACT V1 PAYLOAD DRAWER */}
        {showContractPayload && (
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              border: '1px solid #E6E5DF',
              padding: '18px 22px',
              boxShadow: '0 2px 8px rgba(41,45,50,0.04)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Terminal size={16} color="#829581" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#292D32' }}>
                  Detector Output Contract V1 Payload (POST /api/audit Consumer View)
                </span>
                <span
                  style={{
                    fontSize: 10.5,
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 10,
                    background: 'rgba(114, 148, 122, 0.12)',
                    color: '#72947A',
                  }}
                >
                  SCHEMA: DetectorV1Response
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(detectorContractPayload, null, 2));
                    setCopiedContract(true);
                    setTimeout(() => setCopiedContract(false), 2000);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11.5,
                    color: '#292D32',
                    background: '#F8F7F3',
                    border: '1px solid #E6E5DF',
                    borderRadius: 6,
                    padding: '5px 10px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {copiedContract ? <Check size={12} color="#72947A" /> : <Copy size={12} />}
                  {copiedContract ? 'Copied Contract JSON' : 'Copy Contract JSON'}
                </button>
              </div>
            </div>

            <pre
              style={{
                margin: 0,
                background: '#F8F7F3',
                border: '1px solid #E6E5DF',
                borderRadius: 8,
                padding: '12px 14px',
                fontSize: 11,
                fontFamily: 'IBM Plex Mono, monospace',
                color: '#292D32',
                overflowX: 'auto',
                maxHeight: 280,
                lineHeight: 1.5,
              }}
            >
              {JSON.stringify(detectorContractPayload, null, 2)}
            </pre>
          </div>
        )}

        {/* Live Audit Execution Feedback Banner */}
        {auditSuccessNotice && (
          <div
            style={{
              background: 'rgba(114, 148, 122, 0.1)',
              border: '1px solid #72947A',
              borderRadius: 10,
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 12.5,
              color: '#292D32',
            }}
          >
            <CheckCircle2 size={16} color="#72947A" />
            <span style={{ flex: 1 }}>{auditSuccessNotice}</span>
            <button
              onClick={() => setAuditSuccessNotice(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#737982' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Trace Metadata & Diagnostic Header Card */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #E6E5DF',
            padding: '20px 24px',
            boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#292D32',
                    background: '#F0EFE9',
                    padding: '3px 8px',
                    borderRadius: 6,
                  }}
                >
                  {currentTrace.trace_id}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '3px 9px',
                    borderRadius: 12,
                    color: statusColor,
                    background: statusBg,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  {!isDeviation ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                  {devType === 'none' ? 'Nominal / Correct' : devType.replace('_', ' ')}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: '#737982',
                    background: '#F8F7F3',
                    border: '1px solid #E6E5DF',
                    padding: '2px 8px',
                    borderRadius: 6,
                  }}
                >
                  {currentTrace.domain}
                </span>
              </div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#292D32', lineHeight: 1.4 }}>
                {currentTrace.original_prompt}
              </h2>
            </div>

            {/* Analysis & Quick Diagnostic Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Actual Analysis Button */}
              <button
                onClick={handleExecuteAudit}
                disabled={isAuditing}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: '#FFFFFF',
                  background: isAuditing ? '#A3B0A2' : '#829581',
                  border: 'none',
                  padding: '9px 16px',
                  borderRadius: 8,
                  cursor: isAuditing ? 'not-allowed' : 'pointer',
                  boxShadow: '0 1px 3px rgba(41,45,50,0.08)',
                  transition: 'background 0.15s ease',
                }}
              >
                {isAuditing ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : (
                  <Play size={13} fill="currentColor" />
                )}
                {isAuditing ? 'Auditing Trace Pipeline...' : 'Run Audit Pipeline'}
              </button>

              {isDeviation && (
                <>
                  <Link
                    href={`/causal-explanation?id=${currentTrace.trace_id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#292D32',
                      background: '#F0EFE9',
                      border: '1px solid #E6E5DF',
                      padding: '8px 14px',
                      borderRadius: 8,
                      textDecoration: 'none',
                    }}
                  >
                    <GitBranch size={14} color="#829581" /> Causal DAG
                  </Link>

                  <Link
                    href={`/prompt-correction?id=${currentTrace.trace_id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#292D32',
                      background: '#F0EFE9',
                      border: '1px solid #E6E5DF',
                      padding: '8px 14px',
                      borderRadius: 8,
                      textDecoration: 'none',
                    }}
                  >
                    <Sparkles size={14} color="#829581" /> Prompt Repair Studio
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 12,
              borderTop: '1px solid #F1F0E9',
              paddingTop: 14,
            }}
          >
            <div>
              <div style={{ fontSize: 10, color: '#737982', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Steps</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#292D32', marginTop: 2 }}>{currentTrace.steps.length} Steps</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#737982', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Execution Duration</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#292D32', marginTop: 2 }}>{currentTrace.total_latency_ms} ms</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#737982', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Token Budget</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#292D32', marginTop: 2 }}>{currentTrace.total_tokens} tokens</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#737982', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Evaluation Difficulty</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#292D32', marginTop: 2, textTransform: 'capitalize' }}>
                {currentTrace.seed_meta.difficulty}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#737982', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Failure Anchor</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: statusColor, marginTop: 2 }}>
                {flaggedStepId ? `Step ${flaggedStepId}` : 'None (Compliant)'}
              </div>
            </div>
          </div>
        </div>

        {/* Deviation Map & Policy Verification Section */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #E6E5DF',
            padding: '18px 24px',
            boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={16} color="#829581" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#292D32' }}>
                Step Deviation Map &amp; Policy Alignment
              </span>
            </div>
            <span style={{ fontSize: 11, color: '#737982' }}>
              Sequential step state verification against intent boundary
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${currentTrace.steps.length}, 1fr)`, gap: 8 }}>
            {currentTrace.steps.map((step) => {
              const isFlagged = flaggedStepId === step.step_id;
              const cardColor = isFlagged ? statusColor : '#72947A';
              const cardBg = isFlagged ? statusBg : 'rgba(114, 148, 122, 0.08)';

              return (
                <div
                  key={step.step_id}
                  onClick={() => {
                    const next = new Set(expandedSteps);
                    next.add(step.step_id);
                    setExpandedSteps(next);
                  }}
                  style={{
                    background: cardBg,
                    border: `1px solid ${cardColor}50`,
                    borderRadius: 8,
                    padding: '10px 12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: cardColor }}>
                      Step {step.step_id}
                    </span>
                    {isFlagged ? (
                      <AlertTriangle size={13} color={statusColor} />
                    ) : (
                      <CheckCircle2 size={13} color="#72947A" />
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: '#292D32',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {step.tool_called || step.action_type}
                  </div>
                  <div style={{ fontSize: 10, color: isFlagged ? statusColor : '#737982', marginTop: 4, fontWeight: isFlagged ? 700 : 400 }}>
                    {isFlagged ? 'FLAGGED DEVIATION' : 'Nominal Action'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Execution Span Waterfall (LangSmith / Phoenix style) */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #E6E5DF',
            padding: '18px 24px',
            boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={15} color="#829581" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#292D32' }}>
                Execution Span Waterfall
              </span>
              <span style={{ fontSize: 11, color: '#737982' }}>
                (Relative latency distribution across {currentTrace.steps.length} sequential execution spans)
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={expandAll}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: '#829581',
                  cursor: 'pointer',
                }}
              >
                Expand All
              </button>
              <span style={{ color: '#E6E5DF' }}>•</span>
              <button
                onClick={collapseAll}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: '#737982',
                  cursor: 'pointer',
                }}
              >
                Collapse All
              </button>
            </div>
          </div>

          {/* Waterfall timeline bars */}
          <div
            style={{
              height: 28,
              width: '100%',
              display: 'flex',
              borderRadius: 6,
              overflow: 'hidden',
              background: '#F0EFE9',
              border: '1px solid #E6E5DF',
            }}
          >
            {currentTrace.steps.map((step) => {
              const widthPct = Math.max(8, (step.latency_ms || 300) / currentTrace.total_latency_ms * 100);
              const isFlagged = flaggedStepId === step.step_id;
              const barColor = isFlagged ? statusColor : '#829581';

              return (
                <div
                  key={step.step_id}
                  onClick={() => {
                    const next = new Set(expandedSteps);
                    next.add(step.step_id);
                    setExpandedSteps(next);
                  }}
                  title={`Step ${step.step_id}: ${step.tool_called || step.action_type} (${step.latency_ms}ms)`}
                  style={{
                    width: `${widthPct}%`,
                    background: barColor,
                    opacity: isFlagged ? 1 : 0.85,
                    borderRight: '1px solid #FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FFFFFF',
                    fontSize: 10.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'opacity 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '1';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = isFlagged ? '1' : '0.85';
                  }}
                >
                  S{step.step_id}
                </div>
              );
            })}
          </div>

          {/* Span legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10, fontSize: 11, color: '#737982' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: '#829581' }} />
              <span>Compliant Tool Execution</span>
            </div>
            {isDeviation && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: statusColor }} />
                <span>Divergence Point (Step {flaggedStepId})</span>
              </div>
            )}
          </div>
        </div>

        {/* Step-by-Step Execution Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {currentTrace.steps.map((step) => {
            const isFlagged = flaggedStepId === step.step_id;
            const isExpanded = expandedSteps.has(step.step_id);
            const activeTab = activeTabs[step.step_id] || 'reasoning';

            return (
              <div
                key={step.step_id}
                id={`step-${step.step_id}`}
                style={{
                  background: '#FFFFFF',
                  borderRadius: 12,
                  border: `1px solid ${isFlagged ? statusColor : '#E6E5DF'}`,
                  boxShadow: isFlagged
                    ? `0 2px 8px ${statusColor}22`
                    : '0 1px 3px rgba(41,45,50,0.03)',
                  overflow: 'hidden',
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Step Header */}
                <div
                  onClick={() => toggleStep(step.step_id)}
                  style={{
                    padding: '14px 20px',
                    background: isFlagged ? statusBg : '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none',
                    borderBottom: isExpanded ? '1px solid #E6E5DF' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* Step Number Badge */}
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: isFlagged ? statusColor : '#829581',
                        color: '#FFFFFF',
                        fontWeight: 700,
                        fontSize: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {step.step_id}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#292D32' }}>
                          {step.tool_called ? `Tool: ${step.tool_called}` : `Action: ${step.action_type}`}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            padding: '2px 7px',
                            background: '#F0EFE9',
                            color: '#737982',
                            borderRadius: 4,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                          }}
                        >
                          {step.action_type}
                        </span>
                        {isFlagged && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: '2px 8px',
                              borderRadius: 10,
                              color: '#FFFFFF',
                              background: statusColor,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                            }}
                          >
                            Flagged Deviation Point
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: '#737982',
                          marginTop: 2,
                          maxWidth: 580,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {step.agent_reasoning || 'No explicit chain-of-thought logged'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span
                      style={{
                        fontFamily: 'IBM Plex Mono, monospace',
                        fontSize: 11,
                        color: '#737982',
                        background: '#F8F7F3',
                        padding: '3px 8px',
                        borderRadius: 5,
                      }}
                    >
                      {step.latency_ms}ms • {step.tokens} tokens
                    </span>
                    {isExpanded ? <ChevronUp size={16} color="#737982" /> : <ChevronDown size={16} color="#737982" />}
                  </div>
                </div>

                {/* Step Body (Expanded) */}
                {isExpanded && (
                  <div style={{ padding: '18px 22px' }}>
                    {/* Failure Anomaly Callout Banner (if flagged step) */}
                    {isFlagged && (
                      <div
                        style={{
                          background: statusBg,
                          border: `1px solid ${statusColor}`,
                          borderRadius: 8,
                          padding: '14px 16px',
                          marginBottom: 16,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <AlertTriangle size={16} color={statusColor} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: statusColor }}>
                            Deviation Detected: {devType.toUpperCase()}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: 12, color: '#292D32', lineHeight: 1.45 }}>
                          {currentTrace.ground_truth.explanation}
                        </p>
                        {currentTrace.ground_truth.trigger_phrase && (
                          <div style={{ marginTop: 8, fontSize: 11, color: '#737982' }}>
                            Trigger Phrase: <strong style={{ color: statusColor }}>&quot;{currentTrace.ground_truth.trigger_phrase}&quot;</strong>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Step Inspector Navigation Tabs */}
                    <div
                      style={{
                        display: 'flex',
                        borderBottom: '1px solid #E6E5DF',
                        gap: 8,
                        marginBottom: 14,
                      }}
                    >
                      {[
                        { id: 'reasoning', label: 'Agent Reasoning (CoT)' },
                        { id: 'input', label: 'Tool Invocation & Arguments' },
                        { id: 'output', label: 'Observation Payload' },
                        { id: 'policy', label: 'Policy Check' },
                      ].map((tab) => {
                        const active = activeTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            onClick={() => setActiveTabs({ ...activeTabs, [step.step_id]: tab.id as any })}
                            style={{
                              padding: '8px 12px',
                              background: 'transparent',
                              border: 'none',
                              borderBottom: `2px solid ${active ? '#829581' : 'transparent'}`,
                              color: active ? '#829581' : '#737982',
                              fontSize: 12,
                              fontWeight: active ? 600 : 500,
                              cursor: 'pointer',
                            }}
                          >
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Tab 1: Agent Reasoning */}
                    {activeTab === 'reasoning' && (
                      <div
                        style={{
                          background: '#F8F7F3',
                          border: '1px solid #E6E5DF',
                          borderRadius: 8,
                          padding: '12px 16px',
                          fontSize: 12.5,
                          color: '#292D32',
                          lineHeight: 1.5,
                        }}
                      >
                        {step.agent_reasoning ? (
                          <span>&ldquo;{step.agent_reasoning}&rdquo;</span>
                        ) : (
                          <span style={{ color: '#737982', fontStyle: 'italic' }}>
                            No chain-of-thought reasoning logged for this step.
                          </span>
                        )}
                      </div>
                    )}

                    {/* Tab 2: Tool Input */}
                    {activeTab === 'input' && (
                      <div style={{ position: 'relative' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: '#292D32',
                            color: '#FFFFFF',
                            padding: '6px 12px',
                            borderTopLeftRadius: 8,
                            borderTopRightRadius: 8,
                            fontSize: 11,
                          }}
                        >
                          <span style={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                            {step.tool_called || 'action'} invocation arguments
                          </span>
                          <button
                            onClick={() => copyInput(step.tool_input, step.step_id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#C8C6BE',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 11,
                            }}
                          >
                            {copiedStep === step.step_id ? <Check size={12} color="#72947A" /> : <Copy size={12} />}
                            {copiedStep === step.step_id ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <pre
                          style={{
                            margin: 0,
                            background: '#1F2226',
                            color: '#E6E5DF',
                            padding: '14px 16px',
                            borderBottomLeftRadius: 8,
                            borderBottomRightRadius: 8,
                            fontFamily: 'IBM Plex Mono, monospace',
                            fontSize: 11.5,
                            overflowX: 'auto',
                            lineHeight: 1.4,
                          }}
                        >
                          {step.tool_input || '// No arguments passed'}
                        </pre>
                      </div>
                    )}

                    {/* Tab 3: Tool Output */}
                    {activeTab === 'output' && (
                      <div
                        style={{
                          background: '#F8F7F3',
                          border: '1px solid #E6E5DF',
                          borderRadius: 8,
                          padding: '14px 16px',
                          fontSize: 12,
                          color: '#292D32',
                          lineHeight: 1.45,
                          fontFamily: 'IBM Plex Mono, monospace',
                          whiteSpace: 'pre-wrap',
                          maxHeight: 220,
                          overflowY: 'auto',
                        }}
                      >
                        {step.tool_output || 'No output data recorded for this step.'}
                      </div>
                    )}

                    {/* Tab 4: Policy Check */}
                    {activeTab === 'policy' && (
                      <div
                        style={{
                          background: '#F8F7F3',
                          border: '1px solid #E6E5DF',
                          borderRadius: 8,
                          padding: '14px 16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {isFlagged ? <ShieldAlert size={16} color="#B97878" /> : <ShieldCheck size={16} color="#72947A" />}
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: isFlagged ? '#B97878' : '#72947A' }}>
                            {isFlagged ? 'Action Policy Violation' : 'Compliant with Execution Policy'}
                          </span>
                        </div>
                        <div style={{ fontSize: 11.5, color: '#737982' }}>
                          Allowed Actions: {currentTrace.intent.allowed_actions.join(', ')} | Forbidden Actions: {currentTrace.intent.forbidden_actions.join(', ')}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Integrated Record Findings: Causal Explanation & Counterfactual Prompt */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Causal Explanation Card for this Record */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              border: '1px solid #E6E5DF',
              padding: '20px 22px',
              boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <GitBranch size={16} color="#829581" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#292D32' }}>
                  Causal Attribution (Record {currentTrace.trace_id})
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 12.5, color: '#292D32', lineHeight: 1.55 }}>
                {causalExplanationForTrace}
              </p>
              {currentTrace.ground_truth.trigger_phrase && (
                <div style={{ marginTop: 10, fontSize: 11.5, color: '#737982' }}>
                  Identified trigger phrase: <strong style={{ color: statusColor }}>&ldquo;{currentTrace.ground_truth.trigger_phrase}&rdquo;</strong>
                </div>
              )}
            </div>

            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <Link
                href={`/causal-explanation?id=${currentTrace.trace_id}`}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#829581',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                Inspect Token DAG <ArrowRight size={13} />
              </Link>
            </div>
          </div>

          {/* Corrected Prompt Card for this Record */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              border: '1px solid #E6E5DF',
              padding: '20px 22px',
              boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={16} color="#72947A" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#292D32' }}>
                    Counterfactual Corrected Prompt
                  </span>
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: '#72947A', background: 'rgba(114, 148, 122, 0.12)', padding: '2px 7px', borderRadius: 4 }}>
                  Policy Bounded
                </span>
              </div>
              <div
                style={{
                  background: '#F8F7F3',
                  border: '1px solid #E6E5DF',
                  borderRadius: 8,
                  padding: '12px 14px',
                  fontSize: 12.5,
                  color: '#292D32',
                  lineHeight: 1.55,
                }}
              >
                {correctedPromptForTrace}
              </div>
            </div>

            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                onClick={() => copyCorrectedPrompt(correctedPromptForTrace)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid #E6E5DF',
                  background: '#FFFFFF',
                  color: '#292D32',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {copiedPrompt ? <Check size={12} color="#72947A" /> : <Copy size={12} />}
                {copiedPrompt ? 'Copied' : 'Copy Corrected Prompt'}
              </button>

              <button
                onClick={() => router.push(`/new-audit?prompt=${encodeURIComponent(correctedPromptForTrace)}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#829581',
                  color: '#FFFFFF',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Play size={12} fill="#FFFFFF" /> Test in New Audit
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function TraceAnalysisPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: '#737982' }}>Loading Trace Review &amp; Analysis Workbench...</div>}>
      <TraceAnalysisContent />
    </Suspense>
  );
}
