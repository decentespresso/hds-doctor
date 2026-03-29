# Load Cell Bond Soft Fail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `overridable` flag to `TestResult` so the load cell bond test can soft-fail, letting the user accept a low-delta result as pass.

**Architecture:** `evaluateLoadCellBond` sets `overridable: true` on low-delta fails (not erratic). The wizard result screen conditionally shows an "Accept as Pass" button. Clicking it mutates the result before it enters `allResults`.

**Tech Stack:** TypeScript, Vitest, vanilla DOM

---

### Task 1: Add `overridable` to TestResult

**Files:**
- Modify: `src/types.ts:23-28`

- [ ] **Step 1: Add the optional field**

In `src/types.ts`, add `overridable` to `TestResult`:

```typescript
export interface TestResult {
  testId: string
  verdict: Verdict
  summary: string
  rawPackets: DebugPacket[]
  overridable?: boolean
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success (optional field, no consumers break)

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add overridable flag to TestResult type"
```

---

### Task 2: Set `overridable` in diagnostics

**Files:**
- Modify: `src/diagnostics.ts:58-87`
- Test: `tests/diagnostics.test.ts`

- [ ] **Step 1: Write failing tests**

Add these tests to `tests/diagnostics.test.ts` inside the `evaluateLoadCellBond` describe block:

```typescript
it('sets overridable on low-delta fail', () => {
  const empty = Array.from({ length: 5 }, () => makePacket({ smoothedValue: 1000 }))
  const loaded = Array.from({ length: 5 }, () => makePacket({ smoothedValue: 1050 }))
  const result = evaluateLoadCellBond(empty, loaded)
  expect(result.verdict).toBe('fail')
  expect(result.overridable).toBe(true)
})

it('does not set overridable on erratic fail', () => {
  const empty = Array.from({ length: 5 }, () => makePacket({ smoothedValue: 1000 }))
  const loaded = Array.from({ length: 5 }, (_, i) => makePacket({ smoothedValue: 1000 + i * 500 }))
  const result = evaluateLoadCellBond(empty, loaded)
  expect(result.verdict).toBe('fail')
  expect(result.overridable).not.toBe(true)
})

it('does not set overridable on pass', () => {
  const empty = Array.from({ length: 5 }, () => makePacket({ smoothedValue: 1000 }))
  const loaded = Array.from({ length: 5 }, () => makePacket({ smoothedValue: 50000 }))
  const result = evaluateLoadCellBond(empty, loaded)
  expect(result.verdict).toBe('pass')
  expect(result.overridable).not.toBe(true)
})

it('does not set overridable on warning', () => {
  const empty = Array.from({ length: 5 }, () => makePacket({ smoothedValue: 1000 }))
  const loaded = Array.from({ length: 5 }, () => makePacket({ smoothedValue: 6000 }))
  const result = evaluateLoadCellBond(empty, loaded)
  expect(result.verdict).toBe('warning')
  expect(result.overridable).not.toBe(true)
})
```

- [ ] **Step 2: Run tests to verify failures**

Run: `npm test`
Expected: the `overridable` tests fail (property not set yet)

- [ ] **Step 3: Implement overridable in evaluateLoadCellBond**

In `src/diagnostics.ts`, replace the `evaluateLoadCellBond` function:

```typescript
export function evaluateLoadCellBond(
  emptyPackets: DebugPacket[],
  loadedPackets: DebugPacket[]
): TestResult {
  const emptyAvg = emptyPackets.reduce((s, p) => s + p.smoothedValue, 0) / emptyPackets.length
  const loadedAvg = loadedPackets.reduce((s, p) => s + p.smoothedValue, 0) / loadedPackets.length
  const delta = Math.abs(loadedAvg - emptyAvg)

  const loadedValues = loadedPackets.map(p => p.smoothedValue)
  const loadedVariance = loadedValues.reduce((s, v) => s + (v - loadedAvg) ** 2, 0) / loadedValues.length

  let verdict: Verdict
  let summary: string
  let overridable: boolean | undefined

  if (loadedVariance > 500) {
    verdict = 'fail'
    summary = `Erratic readings (variance ${Math.round(loadedVariance)}) — unstable connection`
  } else if (delta < 1000) {
    verdict = 'fail'
    summary = `ADC delta only ${Math.round(delta)} — load cell may be damaged or disconnected`
    overridable = true
  } else if (delta < 10000) {
    verdict = 'warning'
    summary = `ADC delta ${Math.round(delta)} — lower than expected, check load cell bond`
  } else {
    verdict = 'pass'
    summary = `ADC delta ${Math.round(delta)} — load cell responding normally`
  }

  const rawPackets = [...emptyPackets, ...loadedPackets]
  return { testId: 'load-cell-bond', verdict, summary, rawPackets, ...(overridable && { overridable }) }
}
```

Note: the erratic variance check now comes first, so a low-delta + erratic result is a hard fail (not overridable).

- [ ] **Step 4: Run tests to verify all pass**

Run: `npm test`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/diagnostics.ts tests/diagnostics.test.ts
git commit -m "feat: set overridable flag on low-delta load cell bond fail"
```

---

### Task 3: Add override button to wizard result UI

**Files:**
- Modify: `src/ui.ts:287-307`

- [ ] **Step 1: Update renderWizardResult signature and template**

In `src/ui.ts`, replace the `renderWizardResult` method:

```typescript
renderWizardResult(
  testName: string,
  result: TestResult,
  isLast: boolean,
  onNext: () => void,
  onOverride?: () => void
): void {
  const overrideBtn = result.overridable && onOverride
    ? `<button id="override-btn" class="button small">Accept as Pass</button>`
    : ''

  this.showView('guided', `
    <div class="view-header">
      <h2>${testName}</h2>
    </div>
    <div class="wizard-result">
      <div class="result-overall">
        ${this.verdictBadge(result.verdict)}
        <p class="result-summary">${result.summary}</p>
      </div>
      ${overrideBtn}
      <button id="next-btn" class="button special">${isLast ? 'Finish' : 'Next Test'}</button>
    </div>
  `, () => {
    document.getElementById('next-btn')?.addEventListener('click', onNext)
    if (result.overridable && onOverride) {
      document.getElementById('override-btn')?.addEventListener('click', () => {
        onOverride()
        // Re-render with updated result
        this.renderWizardResult(testName, result, isLast, onNext)
      })
    }
  })
},
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success

- [ ] **Step 3: Commit**

```bash
git add src/ui.ts
git commit -m "feat: add Accept as Pass button to wizard result screen"
```

---

### Task 4: Wire override handler in main.ts

**Files:**
- Modify: `src/main.ts:184-191`

- [ ] **Step 1: Update the result phase in runGuided**

In `src/main.ts`, replace the result phase block (the `await new Promise` at line 188-191) with:

```typescript
      // result phase
      await new Promise<void>((resolve) => {
        UI.renderWizardResult(test.name, result!, isLast, resolve, () => {
          result!.verdict = 'pass'
          result!.summary = `ADC delta ${result!.summary.match(/\d+/)?.[0] ?? '?'} — accepted by user`
          result!.overridable = false
        })
      })
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire soft fail override handler in guided wizard"
```

---

### Task 5: Add override button styling

**Files:**
- Modify: `src/style.css`

- [ ] **Step 1: Add spacing for override button**

In `src/style.css`, add after the `.wizard-result` block (around line 288):

```css
#override-btn {
    margin-bottom: 0.75em;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success

- [ ] **Step 3: Commit**

```bash
git add src/style.css
git commit -m "style: add spacing for override button"
```
