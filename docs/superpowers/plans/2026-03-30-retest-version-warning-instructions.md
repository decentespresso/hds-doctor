# Re-test, Version Warning, Pre-connection Instructions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add re-test capability to guided wizard results, block usage on firmware < 3.0.7, and remind users to power on the scale before connecting.

**Architecture:** Three independent features touching the guided wizard state machine (`guided.ts`), UI rendering (`ui.ts`), app wiring (`main.ts`), and version comparison logic (`decoder.ts`). All features are UI/state changes with no new modules needed.

**Tech Stack:** TypeScript, Vitest, Vite dev server

---

## File Map

| File | Changes |
|------|---------|
| `src/guided.ts` | Add `restartCurrentTest()` method to `GuidedWizard` |
| `src/ui.ts` | Add re-test button to wizard result, add `renderFirmwareError()` view, add power-on hint to landing page |
| `src/main.ts` | Handle re-test action in `runGuided` loop, add firmware version check after connection |
| `src/decoder.ts` | Add `compareFirmwareVersion()` helper |
| `src/style.css` | Style firmware error view |
| `src/guided.test.ts` | Test `restartCurrentTest()` |
| `tests/decoder.test.ts` | Test `compareFirmwareVersion()` |

---

### Task 1: Add `restartCurrentTest()` to GuidedWizard

**Files:**
- Modify: `src/guided.ts:40-91`
- Test: `src/guided.test.ts`

- [ ] **Step 1: Write failing tests for `restartCurrentTest()`**

Add to `src/guided.test.ts`:

```typescript
it('restartCurrentTest resets phase to instruction from result', () => {
  const wizard = new GuidedWizard(['noise-stability', 'drift'])
  // advance to result phase of first test
  wizard.advance() // instruction -> collecting
  wizard.advance() // collecting -> result
  expect(wizard.phase).toBe('result')

  wizard.restartCurrentTest()
  expect(wizard.phase).toBe('instruction')
  expect(wizard.currentTestIndex).toBe(0)
  expect(wizard.isDone).toBe(false)
})

it('restartCurrentTest works for load-cell-bond', () => {
  const wizard = new GuidedWizard(['load-cell-bond'])
  wizard.advance() // instruction -> collecting
  wizard.advance() // collecting -> mid-action
  wizard.advance() // mid-action -> collecting
  wizard.advance() // collecting -> result
  expect(wizard.phase).toBe('result')

  wizard.restartCurrentTest()
  expect(wizard.phase).toBe('instruction')
  expect(wizard.currentTestIndex).toBe(0)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --reporter verbose`
Expected: FAIL — `restartCurrentTest is not a function`

- [ ] **Step 3: Implement `restartCurrentTest()`**

Add method to `GuidedWizard` class in `src/guided.ts`, after the `advance()` method:

```typescript
restartCurrentTest(): void {
  this.phase = 'instruction'
  this.collectingSubPhase = 'first'
}
```

Note: `collectingSubPhase` is private, so this method needs to be inside the class where it has access.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --reporter verbose`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/guided.ts src/guided.test.ts
git commit -m "feat: add restartCurrentTest to GuidedWizard"
```

---

### Task 2: Add re-test button to wizard result UI and wire it in main.ts

**Files:**
- Modify: `src/ui.ts:287-320` (renderWizardResult)
- Modify: `src/main.ts:123-196` (runGuided loop)

- [ ] **Step 1: Add `onRetest` callback to `renderWizardResult`**

In `src/ui.ts`, change the `renderWizardResult` signature and add the re-test button:

```typescript
renderWizardResult(
  testName: string,
  result: TestResult,
  isLast: boolean,
  onNext: () => void,
  onOverride?: () => void,
  onRetest?: () => void
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
      <div class="wizard-result-actions">
        <button id="retest-btn" class="button small">Re-test</button>
        <button id="next-btn" class="button special">${isLast ? 'Finish' : 'Next Test'}</button>
      </div>
    </div>
  `, () => {
    document.getElementById('next-btn')?.addEventListener('click', onNext)
    document.getElementById('retest-btn')?.addEventListener('click', () => onRetest?.())
    if (result.overridable && onOverride) {
      document.getElementById('override-btn')?.addEventListener('click', () => {
        onOverride()
        this.renderWizardResult(testName, result, isLast, onNext, undefined, onRetest)
      })
    }
  })
},
```

- [ ] **Step 2: Add CSS for result actions row**

In `src/style.css`, add after the `#override-btn` rule:

```css
.wizard-result-actions {
    display: flex;
    gap: 0.75em;
}
```

- [ ] **Step 3: Wire re-test into the `runGuided` loop in `main.ts`**

Replace the guided loop in `src/main.ts` (lines 123-208) with a version that handles re-test. The key change: when the user clicks re-test, we call `wizard.restartCurrentTest()`, remove the last result from `allResults`, and `continue` the while loop instead of advancing:

```typescript
async runGuided(selectedIds: TestId[]): Promise<void> {
  const wizard = new GuidedWizard(selectedIds)
  const allResults: TestResult[] = []

  while (!wizard.isDone) {
    const test = wizard.currentTest
    const testNum = wizard.currentTestIndex + 1
    const totalTests = wizard.selectedTests.length

    // instruction phase
    await new Promise<void>((resolve) => {
      UI.renderWizardInstruction(test.name, test.description, testNum, totalTests, resolve)
    })
    wizard.advance() // instruction -> collecting

    // first collection
    const firstPackets = await this._collectPackets(
      test.pollIntervalMs,
      test.collectionDurationMs,
      test.name
    )
    if (!firstPackets) { this.navigate('guided'); return }
    wizard.advance() // collecting -> mid-action (load-cell-bond) or result

    let secondPackets: DebugPacket[] = []

    if (wizard.phase === 'mid-action') {
      // mid-action: ask user to place weight
      await new Promise<void>((resolve) => {
        UI.renderWizardMidAction(resolve)
      })
      wizard.advance() // mid-action -> collecting

      // second collection
      const loaded = await this._collectPackets(
        test.pollIntervalMs,
        test.collectionDurationMs,
        test.name
      )
      if (!loaded) { this.navigate('guided'); return }
      secondPackets = loaded
      wizard.advance() // collecting -> result
    }

    // evaluate
    let result: TestResult
    switch (test.id) {
      case 'noise-stability':
        result = evaluateNoiseStability(firstPackets)
        break
      case 'connection-health':
        result = evaluateConnectionHealth(firstPackets)
        break
      case 'load-cell-bond':
        result = evaluateLoadCellBond(firstPackets, secondPackets)
        break
      case 'drift':
        result = evaluateDrift(firstPackets)
        break
    }

    const isLast = wizard.currentTestIndex === wizard.selectedTests.length - 1

    // result phase — wait for next or re-test
    let retest = false
    await new Promise<void>((resolve) => {
      UI.renderWizardResult(test.name, result!, isLast, resolve, () => {
        result!.verdict = 'pass'
        result!.summary = `ADC delta ${result!.summary.match(/\d+/)?.[0] ?? '?'} — accepted by user`
        result!.overridable = false
      }, () => {
        retest = true
        resolve()
      })
    })

    if (retest) {
      wizard.restartCurrentTest()
      continue
    }

    allResults.push(result!)
    wizard.advance() // result -> next instruction or done
  }

  // All tests complete — navigate to report view
  const overall = overallVerdict(allResults)
  const summaryText = overall === 'pass' ? 'Scale hardware appears healthy'
    : overall === 'warning' ? 'Some issues detected'
    : 'Problems detected'
  const reportJson = generateReport(allResults, overall, summaryText, Serial.deviceInfo ? {
    firmwareVersion: Serial.deviceInfo.firmwareVersion,
    battery: Serial.deviceInfo.battery,
  } : undefined)
  const report = parseReport(reportJson)!
  this.showReport(report)
},
```

Key changes from original:
- `allResults.push(result!)` moved AFTER the re-test check (so re-tested results don't accumulate)
- `retest` flag set by new `onRetest` callback
- If `retest` is true, call `wizard.restartCurrentTest()` and `continue` the loop

- [ ] **Step 4: Verify the app builds**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 5: Run tests**

Run: `npm test -- --reporter verbose`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui.ts src/main.ts src/style.css
git commit -m "feat: add re-test button to guided wizard results"
```

---

### Task 3: Add firmware version comparison helper

**Files:**
- Modify: `src/decoder.ts`
- Test: `tests/decoder.test.ts`

- [ ] **Step 1: Write failing tests for `compareFirmwareVersion()`**

Add to `tests/decoder.test.ts`:

```typescript
import { compareFirmwareVersion } from '../src/decoder'

describe('compareFirmwareVersion', () => {
  it('returns 0 for equal versions', () => {
    expect(compareFirmwareVersion('3.0.7', '3.0.7')).toBe(0)
  })

  it('returns negative when a < b', () => {
    expect(compareFirmwareVersion('3.0.6', '3.0.7')).toBeLessThan(0)
  })

  it('returns positive when a > b', () => {
    expect(compareFirmwareVersion('3.1.0', '3.0.7')).toBeGreaterThan(0)
  })

  it('compares major version first', () => {
    expect(compareFirmwareVersion('2.9.9', '3.0.0')).toBeLessThan(0)
  })

  it('compares minor version second', () => {
    expect(compareFirmwareVersion('3.1.0', '3.0.9')).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --reporter verbose`
Expected: FAIL — `compareFirmwareVersion` is not exported

- [ ] **Step 3: Implement `compareFirmwareVersion()`**

Add to `src/decoder.ts`:

```typescript
export function compareFirmwareVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --reporter verbose`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/decoder.ts tests/decoder.test.ts
git commit -m "feat: add firmware version comparison helper"
```

---

### Task 4: Add firmware version check after connection

**Files:**
- Modify: `src/main.ts:30-33` (onLedResponse handler)
- Modify: `src/ui.ts` (add renderFirmwareError view)
- Modify: `src/style.css` (style firmware error)

- [ ] **Step 1: Add `renderFirmwareError()` to UI**

Add to `src/ui.ts`, after `renderLanding()`:

```typescript
renderFirmwareError(version: string): void {
  this.showView('landing', `
    <h1>HDS Doctor</h1>
    <div class="firmware-error">
      <h2>Firmware Update Required</h2>
      <p>Your scale is running firmware <strong>${version}</strong>, which does not support debug mode.</p>
      <p>Update to firmware <strong>3.0.7</strong> or later to use HDS Doctor.</p>
    </div>
  `)
},
```

- [ ] **Step 2: Add CSS for firmware error**

Add to `src/style.css`, after the `.connect-hint` rule:

```css
.firmware-error {
    background: var(--color-panel-bg);
    border: solid 2px var(--color-verdict-fail);
    border-radius: 0.5em;
    padding: 1.5em;
    text-align: center;
    max-width: 500px;
    margin: 2em auto;
}

.firmware-error h2 {
    color: var(--color-verdict-fail);
    font-size: 1.2em;
    margin: 0 0 0.75em;
}

.firmware-error p {
    color: var(--color-text-body);
    font-size: 0.9em;
    margin: 0.5em 0;
}
```

- [ ] **Step 3: Wire version check in `main.ts`**

In `src/main.ts`, add the import and update the `onLedResponse` handler:

Add import:
```typescript
import { compareFirmwareVersion } from './decoder'
```

Change the `onLedResponse` handler (line 30-33) to:

```typescript
Serial.onLedResponse = (info) => {
  Serial.deviceInfo = info
  UI.setConnected(true, info)
  if (compareFirmwareVersion(info.firmwareVersion, '3.0.7') < 0) {
    UI.renderFirmwareError(info.firmwareVersion)
  }
}
```

- [ ] **Step 4: Verify the app builds**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 5: Run tests**

Run: `npm test -- --reporter verbose`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/ui.ts src/style.css
git commit -m "feat: block usage on firmware < 3.0.7 with error view"
```

---

### Task 5: Add pre-connection power-on instruction

**Files:**
- Modify: `src/ui.ts:57-98` (renderLanding)

- [ ] **Step 1: Add power-on hint to landing page**

In `src/ui.ts`, in the `renderLanding()` method, add a hint below the mode cards and above the "Load a saved report" button:

Replace the `<div style="text-align:center;">` block with:

```html
<p class="power-on-hint">Make sure your scale is powered on before connecting.</p>
<div style="text-align:center;">
  <button id="load-report-btn" class="button small">Load a saved report</button>
</div>
```

- [ ] **Step 2: Add CSS for power-on hint**

Add to `src/style.css`, after the `.firmware-error p` rule:

```css
.power-on-hint {
    color: var(--color-text-muted);
    font-size: 0.85em;
    text-align: center;
    font-style: italic;
    margin: 0 0 1em;
}
```

- [ ] **Step 3: Verify the app builds**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/ui.ts src/style.css
git commit -m "feat: add power-on instruction to landing page"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm test -- --reporter verbose`
Expected: All tests PASS

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Clean build, no errors

- [ ] **Step 3: Manual verification checklist**

Open `https://localhost:5173/hds-doctor/` and verify:
1. Landing page shows "Make sure your scale is powered on before connecting." hint
2. After connecting a scale with FW < 3.0.7, a blocking error view appears
3. In guided diagnostics, each test result shows a "Re-test" button alongside "Next Test"/"Finish"
4. Clicking "Re-test" restarts the current test from the instruction phase
5. Re-tested results don't duplicate in the final report
