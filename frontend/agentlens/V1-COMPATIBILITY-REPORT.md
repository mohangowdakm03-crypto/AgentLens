# AgentLens V1 Frontend Compatibility Report

**Status:** The V1 response envelope is now supplied. Nested analysis/result schemas and the request contract remain unspecified; the live detector endpoint is not connected in this workspace.

## What is known

The supplied V1 response envelope names `trace_id`, `original_prompt`, `steps`, `intent`, `similarity_analysis`, `drift_analysis`, `scope_analysis`, `result`, and `ground_truth`. The frontend now requires this envelope before showing a live API response. The nested `result` is validated against the detector source's `Deviation` dataclass fields: `step_id`, `type`, `confidence`, `similarity_curve`, and `flagged_steps`. The three implemented classifications are `none`, `drift`, and `scope_creep`.

The current frontend request still uses the prior shape: `user_instruction`, `trace` (raw step strings), `deviation_step`, and `failure_type`. The request type requires a numeric deviation step and uses legacy display labels for `failure_type`. The supplied V1 information describes a response envelope, not the request JSON shape, so the request has not been changed by guessing.

The nested structures for `similarity_analysis`, `drift_analysis`, `scope_analysis`, and `ground_truth` have not been specified. The frontend displays these returned values without interpreting undocumented nested keys. Null diagnostics are rendered as unavailable. The plotted similarity curve is taken from `result.similarity_curve` and mapped by the response's preserved step ordering.

The workspace's `/api/audit` route is a mock endpoint. It requires truthy `user_instruction`, `trace`, and `deviation_step`, then returns the fixed legacy sample response in `lib/mock-data.ts`. The frontend now rejects that response as non-V1 and does not present it as a completed audit.

## Compatibility gaps

- The current request's required `deviation_step` prevents normal traces from reaching the mock endpoint; the endpoint rejects requests without one.
- The request's legacy `failure_type` shape does not match the known V1 classifications, but the final request contract is not supplied.
- Causal explanation and evidence are not fields on the detector's `Deviation` dataclass or among the supplied response envelope fields.
- Causal explanation, corrected prompt, diff, and justification are not present as named top-level V1 fields. Their source and exact API representation are unspecified.
- The current mock response is illustrative only; it is rejected by the V1 response validator.

## Contract information needed

Please provide the authoritative request JSON and the nested schemas for analysis/ground truth, including required/optional/null rules, plus the source/API contract for causal explanation and prompt repair. Confirm whether evaluation metrics have a separate endpoint/payload; `ground_truth` alone is not an evaluation report.

Until then, do not rename request fields or interpret undocumented analysis fields. The V1 top-level envelope and detector `Deviation` result are rendered; detailed diagnostics, causal explanation, prompt repair, and evaluation metrics still depend on additional API outputs.

## Files for integration after the contract is supplied

- `lib/types.ts` — request/response contract types and normalized detector result type.
- `components/agentlens/AuditDashboard.tsx` — request construction, response validation/mapping, timeout and lifecycle behavior.
- `components/agentlens/CausalDiagnosisCard.tsx` — render detector classification, flagged step, confidence, explanation, and evidence.
- `components/agentlens/TraceTimeline.tsx` and `components/agentlens/StepCard.tsx` — synchronize actual detector step identifiers with timeline selection/highlighting.
- `components/agentlens/PromptRepairStudio.tsx` — only if the final V1 repair fields differ from the current mapped response shape.
- `app/api/audit/route.ts` — backend-owned integration point; currently returns mock data and is outside the frontend change scope.

## Validation performed

- `npm run lint` — passed with one unused-variable warning in the unchanged mock route `app/api/audit/route.ts`.
- `npx tsc --noEmit` — passed.
- `npm run build` — passed after setting the script to `next build --webpack`; default Turbopack builds repeatedly panicked while launching a CSS-processing child process in this environment.
- Parser smoke checks passed for a V1 trace envelope, nonconsecutive step IDs, JSONL steps, and ReAct reasoning/output.
- Browser upload and audit UI interactions were not re-run because the in-app browser failed to attach. Prior UI smoke checks covered search/navigation/copy/export feedback and responsive layouts.
- No existing automated test script is defined in `package.json`.
