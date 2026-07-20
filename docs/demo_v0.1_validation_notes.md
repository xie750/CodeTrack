# CodeTrack Demo V0.1 Validation Notes

Date: 2026-07-15

## Scope Verified

This note records the current engineering validation for the first Demo V0.1 vertical slice described in `Dorc/第一阶段/CodeTrack_dev_docs_v0.1`.

Verified flow:

```text
task detail -> code submission -> immutable version -> sandbox execution
-> structured test results -> rule fallback diagnosis -> progressive hints
-> resubmission path -> capability evidence -> teacher timeline
```

## Commands Run

```powershell
python -m pytest -q
```

Result:

```text
39 passed
```

```powershell
$env:CODETRACK_DATABASE_URL='sqlite:///./codetrack_migration_check.db'
python -m alembic upgrade head
python .\scripts\seed_demo.py
```

Result:

```text
CodeTrack demo seed data is ready.
tasks 1
tests 5
sources 4
```

```powershell
npm run build
```

Previous result after frontend changes:

```text
vite build succeeded
```

```powershell
npm run evidence:screenshots
```

Result:

```text
Evidence written to D:\Office_File\other\CodeTrack\docs\evidence
```

Generated artifacts:

- `docs/evidence/student-workspace-after-diagnosis.png`
- `docs/evidence/student-workspace-after-level2-hint.png`
- `docs/evidence/teacher-timeline.png`
- `docs/evidence/mobile-initial.png`
- `docs/evidence/qa-report.json`

```powershell
python .\scripts\verify_demo_release.py
```

Result:

```text
overall_status BLOCKED
screenshot_evidence PASS
clean_migration_seed PASS
docker_runtime_available BLOCKED
required_artifacts_present PASS
```

Generated artifacts:

- `docs/evidence/release-status.json`
- `docs/evidence/release-status.md`

## Covered Acceptance Items

- Standard wrong linked-list code fails the head-node deletion test.
- Correct code passes all required tests.
- Empty code returns `SUBMISSION_CODE_EMPTY`.
- Non-CPP language returns `SUBMISSION_LANGUAGE_NOT_SUPPORTED`.
- Oversized source code returns `SUBMISSION_CODE_TOO_LARGE`.
- Compile error returns compiler output as tool fact.
- Infinite loop is terminated and reported as `TIMEOUT`.
- Forbidden custom `main` is rejected as `SECURITY_REJECTED`.
- Sandbox service failures are converted to terminal `INFRASTRUCTURE_ERROR` executions instead of leaving submissions running.
- Repeated `Idempotency-Key` returns the same version and execution IDs.
- Version history returns authorized historical source code plus `code_hash`; tests verify old source and hash remain unchanged after resubmission.
- Repeated `Idempotency-Key` requests are verified not to create extra versions, even when the repeated payload differs.
- Missing user, users outside the course, and teacher-as-student submission are rejected.
- Task listing filters by course membership and does not expose open tasks from unrelated courses.
- Closed tasks reject new submissions with `TASK_NOT_OPEN`.
- Failed linked-list run creates `RULE_FALLBACK` diagnosis with real test evidence and real knowledge source IDs.
- Diagnosis responses include source IDs plus readable knowledge-source entries so students can inspect the referenced original course material.
- When no course knowledge source is available, diagnosis enters `REVIEW_REQUIRED`, no hint is unlocked, and the student can still see tool results.
- Level 1 hint avoids full repair code.
- Level 2 hint can be requested and repeated requests return the existing record.
- Hint rules prevent skipping directly to level 3, and level-3 hint content still avoids complete repair code.
- Resubmitting a failed solution creates a new diagnosis for the new version while the old diagnosis remains readable through its original version ID.
- Teacher timeline includes submit, execution, test result, diagnosis, hint, and capability evidence events where applicable.
- Independent first-pass submissions create `STRONG` / `INDEPENDENT_PASS` capability evidence and update capability state to `MASTERED` with a reason summary.
- Passing after only the automatic level-1 hint creates `MODERATE` / `PASSED_AFTER_LEVEL_1_HINT` evidence.
- Repeated same-boundary failures create `NEGATIVE` / `REPEATED_BOUNDARY_FAILURE` evidence and update capability state to `NEEDS_SUPPORT` with a reason summary.
- Teacher submission list `version_count` and `highest_hint_level` are checked against the underlying student summary.
- Completion summary includes total duration and next-step suggestion, and tests verify these fields for passed submissions.
- Alembic migration plus seed script can rebuild Demo configuration data from a clean database.
- Sandbox service HTTP contract returns structured compile/test results.
- Local sandbox runner truncates oversized compiler stdout/stderr to bounded output.
- Backend now uses a sandbox adapter; Docker deployment can set `CODETRACK_SANDBOX_SERVICE_URL` to call the independent sandbox service.
- Per-run Docker command construction is covered by tests for `--network none`, non-root user, read-only filesystem, capability drop, no-new-privileges, PID, memory and CPU limits.
- Model gateway adapter validates diagnosis schema, evidence references, knowledge-source references, confidence range and level-1 hint leakage before storing model output.
- Real model integration is configurable through either `CODETRACK_MODEL_GATEWAY_URL` or an OpenAI-compatible chat endpoint using `CODETRACK_MODEL_API_KEY`, `CODETRACK_MODEL_API_BASE_URL` and `CODETRACK_MODEL_NAME`.
- Invalid model output falls back to `RULE_FALLBACK` without changing compile or test facts.
- Low-confidence model output is stored as `LOW_CONFIDENCE`, requires teacher review, and does not unlock ordinary hints by default.
- Playwright evidence script exercises the student diagnosis path, level-2 hint request, teacher timeline and mobile initial view.
- Playwright evidence report now verifies teacher timeline execution and diagnosis events, not only screenshot file existence.
- Mobile page-level horizontal overflow was detected by screenshot QA and fixed; current report shows `canScrollX: false`.
- OpenAPI includes the Demo V0.1 contract paths.
- OpenAPI now exposes the version-history response schema with `source_code` and `code_hash`, and tests verify these contract fields.
- OpenAPI now exposes the completion-summary response schema with `total_duration_ms` and `next_step_suggestion`.
- `/ready` performs a real database dependency query and returns `database: ok`; OpenAPI exposes its response schema.
- Audit logs are created for submission, execution, diagnosis and hint events, and tests verify source code and sensitive configuration keys, including model API key names, are not stored in audit details.

## Known Limitations

- Real model calls require deployment-time credentials; no external provider key is bundled or hardcoded.
- `.env.example` contains current backend, sandbox and model integration keys with empty secret placeholders; release verification checks that model credentials are not filled in.
- Docker-based sandbox service configuration has been added, but Docker is not installed in the current environment, so container startup and resource limits have not been executed here.
- The current sandbox service includes a per-execution Docker path that creates one-time containers with `--network none`, but actual container execution could not be run in this environment because Docker is unavailable.
- Alembic initial migration is metadata-based; future schema changes should use explicit incremental migrations.
- Frontend bundle size warning is expected because Monaco and Ant Design are loaded in the main bundle.
