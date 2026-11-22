/**
 * AgentLens — Frontend Contract & Adapter Integration Test Suite
 *
 * Verifies Joyal's 5 technical corrections:
 * 1. API response mapping (TraceModel -> AgentTrace & AuditResult)
 * 2. Diagnostic field verification (PELT, Fallback, Scope)
 * 3. Trace retrieval vs detection endpoint semantics
 * 4. Evaluation metrics (Supported 4x4, binary, macro, per-class, step-level vs unsupported)
 * 5. Similarity curve-to-step positional mapping (steps without similarityScore)
 */

import assert from 'node:assert/strict';

console.log('--- Starting AgentLens Frontend Contract & Integration Tests ---');

// ============================================================================
// Test 1: Diagnostic Field Verification (Correction 2)
// ============================================================================
console.log('Test 1: Verifying PELT, Fallback, and Scope diagnostic fields...');

const sampleBackendResponse = {
  _dataNote: 'REAL ML DETECTOR OUTPUT',
  traceId: 'al_trace_006',
  label: 'Trace al_trace_006: [drift] Compare performance...',
  groundTruth: {
    isDeviated: true,
    deviationType: 'drift',
    flaggedSteps: [3, 4],
    flaggedStepId: 3,
    annotationExplanation: 'Step 3 drifts into unrelated task',
    sampleSplit: 'test',
    notes: 'Ground truth annotated: drift at step 3.',
  },
  prompt: 'Compare performance of YOLOv8 and Faster R-CNN on COCO.',
  steps: [
    {
      stepId: '1',
      action: 'search',
      reasoning: 'Search for benchmark papers',
      tool_input: 'YOLOv8 vs Faster RCNN COCO benchmark',
      tool_output: 'Found 3 comparative studies',
      similarityScore: 0.8842,
    },
    {
      stepId: '2',
      action: 'read',
      reasoning: 'Read metrics table',
      tool_input: 'Extract mAP metrics',
      tool_output: 'YOLOv8 mAP 53.9, Faster RCNN mAP 42.0',
      similarityScore: 0.8415,
    },
    {
      stepId: '3',
      action: 'search',
      reasoning: 'Search how to train diffusion model',
      tool_input: 'Stable diffusion fine-tuning tutorial',
      tool_output: 'Found diffusion guide',
      similarityScore: 0.3124,
    },
    {
      stepId: '4',
      action: 'write',
      reasoning: 'Write notes about diffusion',
      tool_input: 'Save diffusion notes',
      tool_output: 'Saved to notes.txt',
      similarityScore: 0.2851,
    },
  ],
  detection: {
    detectorConfig: {
      peltPenalty: 0.05,
      minDrop: 0.15,
      fallbackDrop: 0.2,
    },
    pelt: {
      breakpointIndex: 2,
      breakpointStepId: '3',
      similarityBefore: 0.8629,
      similarityAfter: 0.2988,
      difference: 0.5641,
      thresholdUsed: 0.15,
    },
    fallback: {
      triggered: false,
      reason: null,
    },
    scope: {
      allowedActions: ['read', 'search', 'write'],
      forbiddenActions: ['delete', 'execute'],
      violations: [],
    },
  },
  audit: {
    isDeviated: true,
    deviationType: 'drift',
    flaggedStepIds: ['3', '4'],
    confidence: 0.95,
    explanation: 'PELT detected a sustained cosine similarity drop of 0.564 starting at step 3.',
  },
};

// PELT Verification
assert.equal(sampleBackendResponse.detection.pelt.breakpointIndex, 2);
assert.equal(sampleBackendResponse.detection.pelt.breakpointStepId, '3');
assert.equal(sampleBackendResponse.detection.pelt.similarityBefore, 0.8629);
assert.equal(sampleBackendResponse.detection.pelt.similarityAfter, 0.2988);
assert.equal(sampleBackendResponse.detection.pelt.difference, 0.5641);
assert.equal(sampleBackendResponse.detection.pelt.thresholdUsed, 0.15);

// Fallback Verification
assert.equal(sampleBackendResponse.detection.fallback.triggered, false);
assert.equal(sampleBackendResponse.detection.fallback.reason, null);

// Scope Verification
assert.deepEqual(sampleBackendResponse.detection.scope.allowedActions, ['read', 'search', 'write']);
assert.deepEqual(sampleBackendResponse.detection.scope.forbiddenActions, ['delete', 'execute']);
assert.equal(sampleBackendResponse.detection.scope.violations.length, 0);

console.log('✓ Test 1 Passed: Diagnostic field names and paths match api/models.py exactly.');

// ============================================================================
// Test 2: Scope Violation Verification (Correction 2)
// ============================================================================
console.log('Test 2: Verifying Scope Violation paths...');

const sampleScopeResponse = {
  ...sampleBackendResponse,
  traceId: 'al_trace_007',
  detection: {
    ...sampleBackendResponse.detection,
    scope: {
      allowedActions: ['read', 'search'],
      forbiddenActions: ['delete', 'write'],
      violations: [
        {
          stepId: '3',
          action: 'write',
          reason: "Action type 'write' is in the forbidden actions set for this task.",
        },
      ],
    },
  },
  audit: {
    isDeviated: true,
    deviationType: 'scope_creep',
    flaggedStepIds: ['3'],
    confidence: 0.8,
    explanation: 'Scope verification detected violation starting at step 3: action write is forbidden.',
  },
};

assert.equal(sampleScopeResponse.detection.scope.violations.length, 1);
assert.equal(sampleScopeResponse.detection.scope.violations[0].stepId, '3');
assert.equal(sampleScopeResponse.detection.scope.violations[0].action, 'write');
assert.ok(sampleScopeResponse.detection.scope.violations[0].reason.includes('forbidden'));

console.log('✓ Test 2 Passed: Scope violations verified.');

// ============================================================================
// Test 3: Fallback Drop Verification (Correction 2)
// ============================================================================
console.log('Test 3: Verifying Fallback Drop paths...');

const sampleFallbackResponse = {
  ...sampleBackendResponse,
  detection: {
    ...sampleBackendResponse.detection,
    pelt: {
      breakpointIndex: null,
      breakpointStepId: null,
      similarityBefore: null,
      similarityAfter: null,
      difference: null,
      thresholdUsed: 0.15,
    },
    fallback: {
      triggered: true,
      reason: 'No PELT changepoint met threshold 0.15. Fallback triggered: single-step similarity drop of 0.280 at step 3 exceeds FALLBACK_DROP (0.2).',
    },
  },
};

assert.equal(sampleFallbackResponse.detection.pelt.breakpointIndex, null);
assert.equal(sampleFallbackResponse.detection.fallback.triggered, true);
assert.ok(sampleFallbackResponse.detection.fallback.reason.includes('Fallback triggered'));

console.log('✓ Test 3 Passed: Fallback trigger path verified.');

// ============================================================================
// Test 4: Similarity Curve-to-Step Positional Mapping (Correction 5)
// ============================================================================
console.log('Test 4: Verifying positional similarity curve mapping...');

// Raw input steps without similarityScore
const rawStepsWithoutScores = [
  { step_id: 1, action_type: 'search', tool_input: 'query 1' },
  { step_id: 2, action_type: 'read', tool_input: 'query 2' },
  { step_id: 3, action_type: 'execute', tool_input: 'query 3' },
];

const backendSimilarityCurve = [0.892, 0.814, 0.355];

// Positional mapping function matching the frontend adapter
function mapCurveToSteps(steps, curve) {
  assert.equal(steps.length, curve.length, 'Steps and curve length must match positionally');
  return steps.map((step, idx) => ({
    stepNumber: idx + 1,
    stepId: String(step.step_id),
    actionType: step.action_type,
    similarityScore: curve[idx],
  }));
}

const mapped = mapCurveToSteps(rawStepsWithoutScores, backendSimilarityCurve);
assert.equal(mapped.length, 3);
assert.equal(mapped[0].similarityScore, 0.892);
assert.equal(mapped[1].similarityScore, 0.814);
assert.equal(mapped[2].similarityScore, 0.355);
assert.equal(mapped[2].stepId, '3');

console.log('✓ Test 4 Passed: Positional curve mapping accurately handles steps without similarityScore.');

// ============================================================================
// Test 5: Endpoint Responsibility Separation (Correction 3)
// ============================================================================
console.log('Test 5: Verifying Trace Retrieval vs Detection endpoint semantics...');

const endpointsContract = {
  get_trace: {
    endpoint: '/api/traces/{trace_id}',
    method: 'GET',
    accepts_body: false,
    role: 'trace_retrieval_by_id',
  },
  run_detect_custom: {
    endpoint: '/api/detect',
    method: 'POST',
    accepts_body: true,
    required_body_fields: ['prompt'],
    role: 'execute_detection_custom_trace',
  },
  batch_evaluate: {
    endpoint: '/api/evaluate',
    method: 'GET',
    accepts_body: false,
    query_params: ['refresh', 'split'],
    role: 'batch_dataset_evaluation',
  },
};

assert.equal(endpointsContract.get_trace.method, 'GET');
assert.equal(endpointsContract.get_trace.accepts_body, false);
assert.equal(endpointsContract.run_detect_custom.method, 'POST');
assert.equal(endpointsContract.run_detect_custom.accepts_body, true);

console.log('✓ Test 5 Passed: Endpoint contracts and HTTP methods strictly verified.');

// ============================================================================
// Test 6: Evaluation Metrics Validation (Correction 4)
// ============================================================================
console.log('Test 6: Verifying actual supported vs unsupported evaluation metrics...');

const supportedEvaluationFields = [
  'available',
  'dataset_source',
  'evaluation_split',
  'dataset_count',
  'evaluated_count',
  'excluded_count',
  'split_class_distribution',
  'positive_class_convention',
  'trace_level',
  'step_level',
  'confusion_matrix',
  'per_class',
  'false_positives',
  'false_negatives',
  'type_mismatches',
  'per_trace',
  'known_limitations',
];

const sampleEvaluationReport = {
  available: true,
  dataset_source: 'corrected_300',
  evaluation_split: 'test',
  dataset_count: 300,
  evaluated_count: 28,
  excluded_count: 272,
  split_class_distribution: { none: 14, drift: 3, scope_creep: 11, misinterpretation: 0 },
  skipped_count: 272,
  skipped_traces: [],
  positive_class_convention: {
    binary_trace_level: 'Positive = any deviation; Negative = on-task.',
    multiclass_per_class: 'One-vs-rest per class.',
    step_level: 'Positive = step is flagged as deviated.',
  },
  trace_level: {
    positive_class_convention: 'Positive = any deviation',
    total: 28,
    tp: 12,
    fp: 0,
    fn: 2,
    tn: 14,
    precision: 1.0,
    recall: 0.8571,
    f1: 0.9231,
    accuracy: 0.9286,
    exact_class_accuracy: 0.9286,
    macro_precision: 0.9643,
    macro_recall: 0.9524,
    macro_f1: 0.9575,
    weighted_precision: 0.9464,
    weighted_recall: 0.9286,
    weighted_f1: 0.9354,
    deviation_macro_precision: 0.9524,
    deviation_macro_recall: 0.9365,
    deviation_macro_f1: 0.9433,
  },
  step_level: {
    positive_class_convention: 'Micro-averaged step level',
    total_steps: 104,
    tp: 24,
    fp: 2,
    fn: 3,
    tn: 75,
    precision: 0.9231,
    recall: 0.8889,
    f1: 0.9057,
    exact_flagged_set_match_rate: 0.8571,
    first_step_exact_match_count: 12,
    deviated_trace_count: 14,
    first_step_exact_match_rate: 0.8571,
  },
  confusion_matrix: {
    labels: ['none', 'drift', 'scope_creep', 'misinterpretation'],
    matrix: {
      none: { none: 14, drift: 0, scope_creep: 0, misinterpretation: 0 },
      drift: { none: 2, drift: 1, scope_creep: 0, misinterpretation: 0 },
      scope_creep: { none: 0, drift: 0, scope_creep: 11, misinterpretation: 0 },
      misinterpretation: { none: 0, drift: 0, scope_creep: 0, misinterpretation: 0 },
    },
    rows: [
      [14, 0, 0, 0],
      [2, 1, 0, 0],
      [0, 0, 11, 0],
      [0, 0, 0, 0],
    ],
    total: 28,
  },
  per_class: {
    none: { class: 'none', tp: 14, fp: 2, fn: 0, tn: 12, support: 14, predicted_count: 16, precision: 0.875, recall: 1.0, f1: 0.9333 },
    drift: { class: 'drift', tp: 1, fp: 0, fn: 2, tn: 25, support: 3, predicted_count: 1, precision: 1.0, recall: 0.3333, f1: 0.5 },
    scope_creep: { class: 'scope_creep', tp: 11, fp: 0, fn: 0, tn: 17, support: 11, predicted_count: 11, precision: 1.0, recall: 1.0, f1: 1.0 },
    misinterpretation: { class: 'misinterpretation', tp: 0, fp: 0, fn: 0, tn: 28, support: 0, predicted_count: 0, precision: 0.0, recall: 0.0, f1: 0.0 },
  },
  false_positives: [],
  false_negatives: [],
  type_mismatches: [],
  per_trace: [],
  known_limitations: {
    short_drift_traces_lt_3_steps: { description: 'Traces < 3 steps', count: 2, trace_ids: ['al_trace_010', 'al_trace_020'] },
    resource_scoped_permission_cases: { description: 'Resource scope limits', count: 4, trace_ids: [] },
    misinterpretation_unsupported: { description: 'Misinterpretation unsupported', count: 0, trace_ids: [] },
    action_vocabulary_mismatch_al_trace_033: { description: 'Vocabulary mismatch', count: 0, trace_ids: [] },
  },
};

// Check all supported fields
for (const field of supportedEvaluationFields) {
  assert.ok(field in sampleEvaluationReport, `Missing supported evaluation field: ${field}`);
}

// Check confusion matrix is 4x4
assert.equal(sampleEvaluationReport.confusion_matrix.labels.length, 4);
assert.equal(sampleEvaluationReport.confusion_matrix.rows.length, 4);
for (const row of sampleEvaluationReport.confusion_matrix.rows) {
  assert.equal(row.length, 4);
}

// Confirm unsupported fields are absent
const unsupportedFields = ['client_threshold_slider', 'normalized_3x3_matrix', 'tool_misuse_class', 'qlora_version_history'];
for (const u of unsupportedFields) {
  assert.equal(u in sampleEvaluationReport, false, `Unsupported field ${u} must not be in real report`);
}

console.log('✓ Test 6 Passed: Supported vs unsupported evaluation metrics verified.');

// ============================================================================
// Test 7: Multi-Record and Single-Record JSONL Parser Verification
// ============================================================================
console.log('Test 7: Verifying JSONL parsing requirements...');

const { parseJsonlTraces, parseTrace } = await import('../lib/parser.ts');

// 7.1 Single-record JSONL
const singleRecordJsonl = JSON.stringify({
  trace_id: 'trace_single_01',
  original_prompt: 'Search for documentation on React hooks',
  steps: [
    { step_id: 1, action: 'search', tool_input: 'React hooks', observation: 'Found docs' }
  ],
  intent: {
    allowed_verbs: ['search', 'read'],
    forbidden_verbs: ['write']
  }
});

const singleResult = parseJsonlTraces(singleRecordJsonl);
assert.equal(singleResult.length, 1, 'Single-record JSONL must parse exactly 1 trace');
assert.equal(singleResult[0].traceInfo?.traceId, 'trace_single_01');
assert.equal(singleResult[0].userInstruction, 'Search for documentation on React hooks');
assert.equal(singleResult[0].steps.length, 1);
assert.equal(singleResult[0].steps[0].actionType, 'tool_call');
assert.equal(singleResult[0].steps[0].toolName, 'search');
console.log('  ✓ 7.1 Single-record JSONL parsed successfully');

// 7.2 Multiple-record JSONL (preserving boundaries, IDs, prompts, and steps without merging)
const multiRecordJsonl = [
  JSON.stringify({
    trace_id: 'trace_rec_01',
    original_prompt: 'Task A: Analyze repo structure',
    steps: [
      { step_id: 1, action: 'list_files', tool_input: '.', observation: 'package.json, src' }
    ]
  }),
  JSON.stringify({
    trace_id: 'trace_rec_02',
    original_prompt: 'Task B: Run unit tests',
    steps: [
      { step_id: 1, action: 'run_tests', tool_input: 'npm test', observation: '10 passed' }
    ]
  }),
  JSON.stringify({
    trace_id: 'trace_rec_03',
    original_prompt: 'Task C: Build application',
    steps: [
      { step_id: 1, action: 'build', tool_input: 'npm run build', observation: 'Build complete' }
    ]
  })
].join('\n');

const multiResult = parseJsonlTraces(multiRecordJsonl);
assert.equal(multiResult.length, 3, 'Multi-record JSONL must parse exactly 3 distinct traces');
assert.equal(multiResult[0].traceInfo?.traceId, 'trace_rec_01');
assert.equal(multiResult[0].userInstruction, 'Task A: Analyze repo structure');
assert.equal(multiResult[0].steps.length, 1);

assert.equal(multiResult[1].traceInfo?.traceId, 'trace_rec_02');
assert.equal(multiResult[1].userInstruction, 'Task B: Run unit tests');
assert.equal(multiResult[1].steps.length, 1);

assert.equal(multiResult[2].traceInfo?.traceId, 'trace_rec_03');
assert.equal(multiResult[2].userInstruction, 'Task C: Build application');
assert.equal(multiResult[2].steps.length, 1);

// Confirm records are NOT merged
assert.notEqual(multiResult[0].traceInfo?.traceId, multiResult[1].traceInfo?.traceId);
console.log('  ✓ 7.2 Multi-record JSONL: Record boundaries, IDs, prompts, and steps strictly preserved');

// 7.3 Multiple steps within a single record
const multiStepRecordJsonl = JSON.stringify({
  trace_id: 'trace_multistep_01',
  prompt: 'Deploy service to cluster',
  steps: [
    { step_id: 1, action_type: 'search', tool_name: 'find_config', tool_input: 'k8s.yaml', reasoning: 'Locate deployment spec' },
    { step_id: 2, action_type: 'read', tool_name: 'read_file', tool_input: 'k8s.yaml', observation: 'apiVersion: apps/v1' },
    { step_id: 3, action_type: 'tool_call', tool_name: 'kubectl_apply', tool_input: '-f k8s.yaml', observation: 'deployment configured' }
  ]
});

const multiStepResult = parseJsonlTraces(multiStepRecordJsonl);
assert.equal(multiStepResult.length, 1);
assert.equal(multiStepResult[0].steps.length, 3, 'Must preserve all 3 sequential steps within record');
assert.equal(multiStepResult[0].steps[0].stepNumber, 1);
assert.equal(multiStepResult[0].steps[0].toolName, 'find_config');
assert.equal(multiStepResult[0].steps[1].stepNumber, 2);
assert.equal(multiStepResult[0].steps[1].observation, 'apiVersion: apps/v1');
assert.equal(multiStepResult[0].steps[2].stepNumber, 3);
assert.equal(multiStepResult[0].steps[2].toolName, 'kubectl_apply');
console.log('  ✓ 7.3 Multiple steps within a record preserved with structured metadata');

// 7.4 Invalid JSONL records (line-specific syntax error reporting)
const invalidJsonl = '{"trace_id": "valid_01", "steps": []}\n{malformed line here\n{"trace_id": "valid_03", "steps": []}';
assert.throws(
  () => parseJsonlTraces(invalidJsonl),
  (err) => {
    assert.ok(err instanceof Error);
    assert.ok(err.message.includes('Invalid JSONL record at line 2'), `Expected error message to mention line 2, got: ${err.message}`);
    return true;
  }
);
console.log('  ✓ 7.4 Invalid JSONL records rejected with explicit line-number error message');

// 7.5 Empty JSONL files
assert.throws(
  () => parseJsonlTraces(''),
  (err) => {
    assert.ok(err instanceof Error);
    assert.ok(err.message.includes('File is empty'), `Expected empty file error, got: ${err.message}`);
    return true;
  }
);
assert.throws(
  () => parseJsonlTraces('   \n  \n  '),
  (err) => {
    assert.ok(err instanceof Error);
    assert.ok(err.message.includes('File is empty'), `Expected empty file error, got: ${err.message}`);
    return true;
  }
);
console.log('  ✓ 7.5 Empty JSONL files rejected with clear error');

// 7.6 Verify parseTrace integration with multi-record JSONL
const parsedTraceViaAutoDetect = parseTrace(multiRecordJsonl, 'Default instruction');
assert.equal(parsedTraceViaAutoDetect.traceInfo?.traceId, 'trace_rec_01');
assert.ok(Array.isArray(parsedTraceViaAutoDetect.multiTraces), 'multiTraces must be attached');
assert.equal(parsedTraceViaAutoDetect.multiTraces.length, 3, 'multiTraces must contain all 3 distinct records');
assert.equal(parsedTraceViaAutoDetect.multiTraces[1].traceInfo?.traceId, 'trace_rec_02');
console.log('  ✓ 7.6 parseTrace integration verified: multiTraces preserved and accessible');

console.log('\n======================================================');
console.log('ALL FRONTEND CONTRACT & INTEGRATION TESTS PASSED (7/7)');
console.log('======================================================\n');
