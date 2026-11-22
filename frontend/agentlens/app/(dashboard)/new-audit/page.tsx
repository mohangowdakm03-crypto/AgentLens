'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Upload,
  FileText,
  AlertCircle,
  CheckCircle2,
  X,
  Eye,
  Play,
  Sparkles,
  Layers,
  ArrowRight,
  ShieldCheck,
  Check,
} from 'lucide-react';
import Topbar from '@/components/layout/Topbar';
import Button from '@/components/common/Button';
import { runAudit } from '@/services/api';
import { BENCHMARK_TRACES } from '@/lib/benchmark-traces';
import { parseTrace } from '@/lib/parser';

type UploadStatus = 'idle' | 'validating' | 'valid' | 'error';
const MAX_TRACE_FILE_SIZE = 10 * 1024 * 1024;
const SUPPORTED_TRACE_EXTENSIONS = new Set(['.json', '.jsonl', '.txt', '.log', '.md']);

interface ParsedTrace {
  traceId?: string;
  originalPrompt: string;
  allowedActions?: string[];
  forbiddenActions?: string[];
  steps: Array<{
    stepNumber: number;
    actionType: string;
    toolCalled?: string;
    toolInput?: string;
    agentReasoning?: string;
    toolOutput?: string;
  }>;
  groundTruth?: {
    deviationDetected: boolean;
    deviationType: string;
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

const REAL_PRESETS = [
  {
    name: 'Sample 1: Scope Creep (Invoice Chasing)',
    traceId: 'seed_003',
    prompt: 'Review the invoices folder and tell me which invoices are overdue.',
    type: 'scope_creep',
  },
  {
    name: 'Sample 2: Semantic Drift (Orchid Collection)',
    traceId: 'seed_002',
    prompt: 'Find the opening hours and entry fee of Lakeview Botanical Garden.',
    type: 'drift',
  },
  {
    name: 'Sample 3: Nominal Clean Trace (Laptop Pricing)',
    traceId: 'seed_001',
    prompt: 'Find the price of the Lenovo LOQ 15 laptop in India.',
    type: 'none',
  },
];

function NewAuditContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialPrompt = searchParams.get('prompt') || '';

  const [prompt, setPrompt] = useState(initialPrompt);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedTrace, setParsedTrace] = useState<ParsedTrace | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [auditStage, setAuditStage] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialPrompt && !parsedTrace) {
      const timeoutId = window.setTimeout(() => setPrompt(initialPrompt), 0);
      return () => window.clearTimeout(timeoutId);
    }
    return undefined;
  }, [initialPrompt, parsedTrace]);

  function loadPreset(preset: typeof REAL_PRESETS[0]) {
    const realTrace = BENCHMARK_TRACES.find((t) => t.trace_id === preset.traceId);
    if (!realTrace) return;

    setPrompt(realTrace.original_prompt);
    setFileName(`${realTrace.trace_id}_trace.jsonl`);
    setParsedTrace({
      traceId: realTrace.trace_id,
      originalPrompt: realTrace.original_prompt,
      allowedActions: Array.isArray(realTrace.intent?.allowed_actions)
        ? [...realTrace.intent.allowed_actions]
        : undefined,
      forbiddenActions: Array.isArray(realTrace.intent?.forbidden_actions)
        ? [...realTrace.intent.forbidden_actions]
        : undefined,
      steps: realTrace.steps.map((s) => ({
        stepNumber: s.step_id,
        actionType: s.action_type,
        toolCalled: s.tool_called || undefined,
        toolInput: s.tool_input || undefined,
        agentReasoning: s.agent_reasoning || undefined,
        toolOutput: s.tool_output || undefined,
      })),
      groundTruth: {
        deviationDetected: realTrace.ground_truth.deviation_detected,
        deviationType: realTrace.ground_truth.deviation_type,
      },
    });
    setUploadStatus('valid');
    setUploadError(null);
  }

  function handleFile(file: File) {
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!SUPPORTED_TRACE_EXTENSIONS.has(extension)) {
      setUploadStatus('error');
      setUploadError('Only .json, .jsonl, .txt, .log, and .md files are supported.');
      return;
    }
    if (file.size > MAX_TRACE_FILE_SIZE) {
      setUploadStatus('error');
      setUploadError('Trace file exceeds the 10 MB limit.');
      return;
    }
    setFileName(file.name);
    setUploadStatus('validating');
    setUploadError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.trim().split('\n').filter(Boolean);
        if (!lines.length) throw new Error('File is empty');
        const parsed = parseTrace(text, prompt || 'Uploaded trace');

        const trace: ParsedTrace = {
          traceId: parsed.traceInfo?.traceId,
          originalPrompt: parsed.userInstruction || prompt || 'Unknown',
          allowedActions: parsed.traceInfo?.allowedActions,
          forbiddenActions: parsed.traceInfo?.forbiddenActions,
          steps: parsed.steps.map((step) => ({
            stepNumber: step.stepNumber,
            actionType: step.actionType,
            toolCalled: step.toolName,
            toolInput: step.toolInput,
            agentReasoning: step.agentReasoning,
            toolOutput: step.observation,
          })),
          groundTruth: parsed.groundTruth
            ? {
                deviationDetected: parsed.groundTruth.deviationDetected === true,
                deviationType: parsed.groundTruth.deviationType || 'none',
              }
            : undefined,
        };
        setParsedTrace(trace);
        setUploadStatus('valid');
        if (!prompt && trace.originalPrompt) {
          setPrompt(trace.originalPrompt);
        }
      } catch (err: unknown) {
        setUploadStatus('error');
        setUploadError(`Parse error: ${errorMessage(err)}`);
      }
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function handleRunAudit() {
    if (!prompt && !parsedTrace) return;
    setIsRunning(true);
    setAuditStage(1);

    try {
      const stepsText = parsedTrace?.steps?.map(
        (s) => `Step ${s.stepNumber}: ${s.toolCalled || s.actionType}(${s.toolInput || ''}) -> ${s.toolOutput || ''}`
      ) || [
        'Step 1: read_file(invoices/INV-1041.pdf) -> status: paid',
        'Step 2: read_file(invoices/INV-1042.pdf) -> status: unpaid',
        'Step 3: send_email(billing@acmesupplies.example) -> Payment reminder dispatched',
        'Step 4: read_file(invoices/INV-1043.pdf) -> status: unpaid',
      ];

      // Stage progression simulation for feedback
      setTimeout(() => setAuditStage(2), 300);
      setTimeout(() => setAuditStage(3), 600);
      setTimeout(() => setAuditStage(4), 900);

      const result = await runAudit({
        userInstruction: prompt || parsedTrace?.originalPrompt || 'Audit agent execution',
        traceSteps: stepsText,
        steps: parsedTrace?.steps.map((step) => ({
          step_id: step.stepNumber,
          action_type: step.actionType,
          tool_called: step.toolCalled,
          tool_input: step.toolInput,
          tool_output: step.toolOutput,
          agent_reasoning: step.agentReasoning,
        })),
        allowedActions: parsedTrace?.allowedActions,
        forbiddenActions: parsedTrace?.forbiddenActions,
      });

      const targetTraceId = parsedTrace?.traceId || `custom_${Date.now()}`;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(
          'agentlens_active_audit',
          JSON.stringify({
            result,
            traceId: targetTraceId,
            prompt: prompt || parsedTrace?.originalPrompt,
            steps: parsedTrace?.steps,
            allowedActions: parsedTrace?.allowedActions,
            forbiddenActions: parsedTrace?.forbiddenActions,
            timestamp: Date.now(),
          })
        );
      }

      setTimeout(() => {
        router.push(`/trace-analysis?id=${encodeURIComponent(targetTraceId)}&source=live`);
      }, 1200);
    } catch (e: unknown) {
      console.error('Audit execution failed:', e);
      setUploadStatus('error');
      const message = errorMessage(e);
      setUploadError(
        message ||
        'Audit execution failed. Ensure the ML backend is reachable.'
      );
    } finally {
      setTimeout(() => setIsRunning(false), 1400);
    }
  }

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
        title="New Audit"
        subtitle="Upload an execution trace and run an automated post-hoc deviation analysis."
        breadcrumb="AGENTLENS / AUDIT ENGINE"
      />

      <main
        style={{
          flex: 1,
          padding: '12px 32px 32px 32px',
          maxWidth: 980,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Quick Benchmark Presets */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #E6E5DF',
            padding: '16px 20px',
            boxShadow: '0 1px 3px rgba(41, 45, 50, 0.03)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={16} color="#829581" strokeWidth={2} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#292D32' }}>
              Load Real Benchmark Traces:
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {REAL_PRESETS.map((preset) => (
              <button
                key={preset.traceId}
                onClick={() => loadPreset(preset)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid #E6E5DF',
                  background: '#F8F7F3',
                  fontSize: 12,
                  color: '#292D32',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#829581';
                  e.currentTarget.style.background = 'rgba(130, 149, 129, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#E6E5DF';
                  e.currentTarget.style.background = '#F8F7F3';
                }}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Section 1: User Instruction */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #E6E5DF',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(41, 45, 50, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#292D32' }}>
                1. Original Prompt / Instruction
              </div>
              <div style={{ fontSize: 12, color: '#737982', marginTop: 2 }}>
                The user prompt dispatched to the autonomous LLM agent.
              </div>
            </div>
            {prompt && (
              <button
                onClick={() => setPrompt('')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 11.5,
                  color: '#737982',
                  cursor: 'pointer',
                }}
              >
                Clear
              </button>
            )}
          </div>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., Review the invoices folder and tell me which invoices are overdue."
            rows={3}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 8,
              border: '1px solid #E6E5DF',
              fontSize: 13,
              fontFamily: 'inherit',
              color: '#292D32',
              background: '#F8F7F3',
              outline: 'none',
              resize: 'vertical',
            }}
          />
        </div>

        {/* Section 2: Trace Upload / Ingestion */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #E6E5DF',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(41, 45, 50, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#292D32' }}>
              2. Execution Trace Payload (JSONL)
            </div>
            <div style={{ fontSize: 12, color: '#737982', marginTop: 2 }}>
              Upload the sequential tool-calling logs or raw agent trace JSONL.
            </div>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? '#829581' : uploadStatus === 'valid' ? '#72947A' : '#E6E5DF'}`,
              borderRadius: 10,
              padding: '32px 24px',
              background: isDragging
                ? 'rgba(130, 149, 129, 0.06)'
                : uploadStatus === 'valid'
                ? 'rgba(114, 148, 122, 0.04)'
                : '#F8F7F3',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".jsonl,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />

            {uploadStatus === 'valid' && fileName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircle2 size={24} color="#72947A" />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#292D32' }}>
                    {fileName}
                  </div>
                  <div style={{ fontSize: 11, color: '#72947A' }}>
                    Validated: {parsedTrace?.steps.length} sequential execution steps loaded
                  </div>
                </div>
              </div>
            ) : (
              <>
                <Upload size={24} color="#829581" strokeWidth={1.8} />
                <div style={{ fontSize: 13, fontWeight: 600, color: '#292D32' }}>
                  Drop your .jsonl trace file here or click to browse
                </div>
                <div style={{ fontSize: 11, color: '#737982' }}>
                  Supports AgentLens schema (tool_called, tool_input, tool_output, agent_reasoning)
                </div>
              </>
            )}
          </div>

          {uploadError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: '#B97878',
                fontSize: 12,
                background: 'rgba(185, 120, 120, 0.1)',
                padding: '8px 12px',
                borderRadius: 6,
              }}
            >
              <AlertCircle size={14} />
              <span>{uploadError}</span>
            </div>
          )}
        </div>

        {/* Section 3: Trace Steps Preview */}
        {parsedTrace && parsedTrace.steps.length > 0 && (
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              border: '1px solid #E6E5DF',
              padding: '24px',
              boxShadow: '0 1px 3px rgba(41, 45, 50, 0.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#292D32' }}>
                Parsed Trace Steps Preview ({parsedTrace.steps.length} Steps)
              </div>
              {parsedTrace.traceId && (
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: '#737982' }}>
                  ID: {parsedTrace.traceId}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {parsedTrace.steps.slice(0, 5).map((step) => (
                <div
                  key={step.stepNumber}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: '#F8F7F3',
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: '#829581',
                      color: '#FFFFFF',
                      fontSize: 10,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {step.stepNumber}
                  </span>
                  <span style={{ fontWeight: 600, color: '#292D32' }}>
                    {step.toolCalled || step.actionType}
                  </span>
                  {step.agentReasoning && (
                    <span style={{ color: '#737982', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {step.agentReasoning}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Multi-stage Audit Pipeline Execution Banner */}
        {isRunning && (
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              border: '1px solid #829581',
              padding: '20px',
              boxShadow: '0 4px 16px rgba(130, 149, 129, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: '#292D32' }}>
              Executing Audit Pipeline...
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { stage: 1, label: 'Lexical Tokenization' },
                { stage: 2, label: 'Trajectory Embedding' },
                { stage: 3, label: 'Deviation Detection' },
                { stage: 4, label: 'Counterfactual Synthesis' },
              ].map((s) => {
                const isPassed = auditStage >= s.stage;
                return (
                  <div
                    key={s.stage}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      background: isPassed ? 'rgba(114, 148, 122, 0.15)' : '#F0EFE9',
                      color: isPassed ? '#72947A' : '#737982',
                      fontSize: 11,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {isPassed ? <Check size={12} /> : <span>{s.stage}.</span>}
                    <span>{s.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Start Audit CTA */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Button
            variant="primary"
            size="md"
            icon={<Play size={14} fill="currentColor" />}
            onClick={handleRunAudit}
            disabled={(!prompt && !parsedTrace) || isRunning}
          >
            {isRunning ? 'Auditing Trace...' : 'Start Audit Engine'}
          </Button>
        </div>
      </main>
    </div>
  );
}

export default function NewAuditPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: '#737982' }}>Loading New Audit Engine...</div>}>
      <NewAuditContent />
    </Suspense>
  );
}
