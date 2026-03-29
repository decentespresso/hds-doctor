# Load Cell Bond — Soft Fail with User Override

## Problem

The load cell bond test currently hard-fails when the ADC delta between empty and loaded states is below 1,000. Some scales produce a small but real delta that indicates a working load cell. Users have no way to accept borderline results.

## Design

Add an `overridable` flag to `TestResult`. When the load cell bond test fails due to low delta (not erratic variance), the wizard offers an "Accept as Pass" button that lets the user override the verdict.

### Thresholds (unchanged)

| Verdict | Condition |
|---------|-----------|
| Pass | Delta > 10,000 |
| Warning | Delta 1,000–10,000 |
| Soft fail | Delta < 1,000, variance <= 500 — user can override |
| Hard fail | Variance > 500 — no override |

### Override behavior

- The wizard result screen shows an "Accept as Pass" button when `result.overridable === true`
- Clicking it changes `verdict` to `pass` and `summary` to `"ADC delta {delta} — accepted by user"`
- The overridden result is stored in the report like any other pass, with the summary making the override visible

### File changes

**`src/types.ts`**
- Add `overridable?: boolean` to `TestResult`

**`src/diagnostics.ts`**
- `evaluateLoadCellBond`: when verdict is `fail` due to low delta (not erratic variance), set `overridable: true`

**`src/ui.ts`**
- `renderWizardResult`: when `result.overridable` is true, render an "Accept as Pass" button alongside the existing "Next Test" / "Finish" button
- Add an `onOverride` callback parameter

**`src/main.ts`**
- In `runGuided`, pass an override handler to `renderWizardResult` that mutates the result's verdict and summary before continuing

**Tests**
- `diagnostics.test.ts`: verify `overridable: true` on low-delta fail, `overridable` absent/false on erratic fail and on pass/warning
- `guided.test.ts`: no changes needed (wizard state machine unchanged)

### What doesn't change

- Report format (no new verdict types)
- Quick check (doesn't run load cell bond)
- Other tests (noise, drift, connection health)
- Overall verdict logic
