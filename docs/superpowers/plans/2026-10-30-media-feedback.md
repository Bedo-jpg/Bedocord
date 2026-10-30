# Bedocord Media Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add local stream preview, optional action sounds, and clear own-message status.

**Architecture:** A renderer component downsamples the existing capture stream. A small Web Audio module plays successful-action cues. Existing receipts continue to mean backup by another peer; only the message label changes.

**Tech Stack:** React 19, TypeScript, Electron 45, Web Audio, Canvas.

**Spec:** `docs/superpowers/specs/2026-10-30-media-feedback-design.md`

## Global Constraints

- Preserve private networking and 10-member group behavior.
- Do not capture an additional screen stream or play the local preview audio.
- Existing preferences must load with sounds enabled by default.

## Review Focus

- A one-person group shows a local-save label, not pending send.
- A failed action plays no confirmation sound.
- Muting or leaving cannot leak captured audio through preview.
- Closing the preview leaves screen sharing active.
- Existing preferences remain valid.

---

### Task 1: Message state

**Files:** `src/ui/App.tsx`, `src/ui/message-status.ts`, `tests/message-status.test.ts`.

- [x] Write a failing test for solo local save, waiting for backup, and backed-up labels.
- [x] Run the focused test and confirm it fails.
- [x] Implement the status helper and replace the hourglass with clear text.
- [x] Run the focused test and typecheck.

### Task 2: Optional action sounds

**Files:** `src/ui/sounds.ts`, `src/ui/App.tsx`, `src/ui/api.ts`, `src/desktop/main.ts`, `src/desktop/policy.ts`, `tests/sounds.test.ts`.

- [x] Write a failing test for distinct bounded cue patterns and persisted sound setting schema.
- [x] Run the focused test and confirm it fails.
- [x] Implement Web Audio cues, settings toggle, and success-only call sites.
- [x] Run the focused test and typecheck.

### Task 3: Local preview

**Files:** `src/ui/LocalPreview.tsx`, `src/ui/App.tsx`, `src/ui/styles.css`.

- [x] Implement a muted canvas preview fed by the existing screen stream and a hide/restore control.
- [x] Verify canvas size, frame cap, cleanup, and that the stream is not stopped by hiding.
- [x] Run typecheck and build.

### Task 4: Package and verify

**Files:** `README.md`, `VERIFICATION.md`, `outputs/Bedocord-*`.

- [x] Run full tests, typecheck, and package.
- [x] Rebuild output ZIPs and update usage notes.
- [x] Inspect package contents and commit source changes.
