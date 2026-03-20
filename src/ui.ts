import type { Verdict, TestResult, TestId } from './types'
import { TEST_DEFINITIONS } from './guided'

type ViewName = 'landing' | 'quick-check' | 'guided' | 'live-monitor' | 'report'

export const UI = {
  appEl: null as HTMLElement | null,
  connectionBar: {
    dot: null as HTMLElement | null,
    text: null as HTMLElement | null,
    btn: null as HTMLButtonElement | null,
  },
  currentView: null as ViewName | null,
  onNavigate: null as ((view: ViewName) => void) | null,
  onConnect: null as (() => void) | null,
  onDisconnect: null as (() => void) | null,

  init(): void {
    this.appEl = document.getElementById('app')
    this.connectionBar.dot = document.getElementById('status-indicator')
    this.connectionBar.text = document.getElementById('status-text')
    this.connectionBar.btn = document.getElementById('connect-btn') as HTMLButtonElement
    this.connectionBar.btn.addEventListener('click', () => {
      if (this.connectionBar.dot?.classList.contains('connected')) {
        this.onDisconnect?.()
      } else {
        this.onConnect?.()
      }
    })
  },

  setConnected(connected: boolean): void {
    const { dot, text, btn } = this.connectionBar
    if (dot) {
      dot.classList.toggle('connected', connected)
      dot.classList.toggle('disconnected', !connected)
    }
    if (text) text.textContent = connected ? 'Connected' : 'No device connected'
    if (btn) btn.textContent = connected ? 'Disconnect' : 'Connect'
  },

  showView(name: ViewName, html: string, init?: () => void): void {
    if (!this.appEl) return
    this.currentView = name
    this.appEl.innerHTML = html
    init?.()
  },

  renderLanding(): void {
    this.showView('landing', `
      <div class="mode-cards">
        <div class="mode-card" data-mode="quick-check">
          <div class="mode-card-icon">&#9889;</div>
          <div class="mode-card-title">Quick Check</div>
          <div class="mode-card-desc">30-second automated test</div>
        </div>
        <div class="mode-card" data-mode="guided">
          <div class="mode-card-icon">&#128270;</div>
          <div class="mode-card-title">Guided Diagnostics</div>
          <div class="mode-card-desc">Step-by-step with physical tests</div>
        </div>
        <div class="mode-card" data-mode="live-monitor">
          <div class="mode-card-icon">&#128200;</div>
          <div class="mode-card-title">Live Monitor</div>
          <div class="mode-card-desc">Real-time data stream</div>
        </div>
      </div>
      <div style="text-align:center;">
        <button id="load-report-btn" class="back-btn">or load a saved report...</button>
      </div>
    `, () => {
      this.appEl!.querySelectorAll('.mode-card').forEach(card => {
        card.addEventListener('click', () => {
          const mode = (card as HTMLElement).dataset.mode as ViewName
          this.onNavigate?.(mode)
        })
      })
      document.getElementById('load-report-btn')?.addEventListener('click', () => {
        this.onNavigate?.('report')
      })
    })
  },

  verdictBadge(verdict: Verdict): string {
    return `<span class="verdict-${verdict}">${verdict.toUpperCase()}</span>`
  },

  // ── Quick Check ──────────────────────────────────────────────────────────

  renderQuickCheck(connected: boolean, onRun: () => void): void {
    this.showView('quick-check', `
      <div class="view-header">
        <button id="back-btn" class="back-btn">&#8592; Back</button>
        <h2>Quick Check</h2>
      </div>
      <div id="qc-action">
        ${connected
          ? `<button id="run-btn" class="primary-btn">Run Quick Check</button>`
          : `<p class="connect-hint">Connect a device first to run a quick check.</p>`
        }
      </div>
      <div id="qc-progress" style="display:none;">
        <div class="progress-bar-wrap">
          <div id="qc-progress-bar" class="progress-bar" style="width:0%"></div>
        </div>
        <p id="qc-status-text" class="status-text"></p>
      </div>
      <div id="qc-result" style="display:none;"></div>
    `, () => {
      document.getElementById('back-btn')?.addEventListener('click', () => {
        this.onNavigate?.('landing')
      })
      if (connected) {
        document.getElementById('run-btn')?.addEventListener('click', onRun)
      }
    })
  },

  showQuickCheckProgress(percent: number, status: string): void {
    const action = document.getElementById('qc-action')
    const progress = document.getElementById('qc-progress')
    const bar = document.getElementById('qc-progress-bar')
    const statusText = document.getElementById('qc-status-text')

    if (action) action.style.display = 'none'
    if (progress) progress.style.display = 'block'
    if (bar) bar.style.width = `${percent}%`
    if (statusText) statusText.textContent = status
  },

  showQuickCheckResult(results: TestResult[], overall: Verdict, summary: string): void {
    const progress = document.getElementById('qc-progress')
    const resultEl = document.getElementById('qc-result')

    if (progress) progress.style.display = 'none'
    if (!resultEl) return

    resultEl.style.display = 'block'
    resultEl.innerHTML = `
      <div class="result-overall">
        <span>Overall: </span>${this.verdictBadge(overall)}
        <p class="result-summary">${summary}</p>
      </div>
      <ul class="result-list">
        ${results.map(r => `
          <li class="result-item">
            ${this.verdictBadge(r.verdict)}
            <span class="result-test-id">${r.testId}</span>
            <span class="result-test-summary">${r.summary}</span>
          </li>
        `).join('')}
      </ul>
      <button id="run-again-btn" class="primary-btn">Run Again</button>
    `
    document.getElementById('run-again-btn')?.addEventListener('click', () => {
      this.onNavigate?.('quick-check')
    })
  },

  // ── Guided Diagnostics ───────────────────────────────────────────────────

  renderTestPicker(onStart: (selectedIds: TestId[]) => void): void {
    this.showView('guided', `
      <div class="view-header">
        <button id="back-btn" class="back-btn">&#8592; Back</button>
        <h2>Guided Diagnostics</h2>
      </div>
      <p class="picker-hint">Select the tests you want to run:</p>
      <ul class="test-picker-list">
        ${TEST_DEFINITIONS.map(t => `
          <li class="test-picker-item">
            <label>
              <input type="checkbox" class="test-checkbox" value="${t.id}" checked />
              <span class="test-picker-name">${t.name}</span>
              <span class="test-picker-desc">${t.description} (${t.durationEstimate})</span>
            </label>
          </li>
        `).join('')}
      </ul>
      <button id="start-guided-btn" class="primary-btn">Start</button>
    `, () => {
      document.getElementById('back-btn')?.addEventListener('click', () => {
        this.onNavigate?.('landing')
      })
      document.getElementById('start-guided-btn')?.addEventListener('click', () => {
        const checked = Array.from(
          document.querySelectorAll<HTMLInputElement>('.test-checkbox:checked')
        ).map(el => el.value as TestId)
        if (checked.length > 0) onStart(checked)
      })
    })
  },

  renderWizardInstruction(
    testName: string,
    description: string,
    testNum: number,
    totalTests: number,
    onReady: () => void
  ): void {
    this.showView('guided', `
      <div class="view-header">
        <h2>Guided Diagnostics</h2>
        <span class="wizard-progress">Test ${testNum} of ${totalTests}</span>
      </div>
      <div class="wizard-instruction">
        <h3>${testName}</h3>
        <p class="wizard-desc">${description}</p>
        <p class="wizard-instruction-text">${this._instructionText(testName)}</p>
        <button id="ready-btn" class="primary-btn">Ready</button>
      </div>
    `, () => {
      document.getElementById('ready-btn')?.addEventListener('click', onReady)
    })
  },

  renderWizardCollecting(testName: string, percent: number, sampleCount: number): void {
    if (this.currentView !== 'guided') return
    const bar = document.getElementById('wizard-progress-bar')
    const countEl = document.getElementById('wizard-sample-count')
    if (bar && countEl) {
      bar.style.width = `${percent}%`
      countEl.textContent = `${sampleCount} samples collected`
      return
    }
    // First render
    this.showView('guided', `
      <div class="view-header">
        <h2>${testName}</h2>
      </div>
      <div class="wizard-collecting">
        <p class="collecting-label">Collecting data…</p>
        <div class="progress-bar-wrap">
          <div id="wizard-progress-bar" class="progress-bar" style="width:${percent}%"></div>
        </div>
        <p id="wizard-sample-count" class="status-text">${sampleCount} samples collected</p>
      </div>
    `)
  },

  renderWizardMidAction(onConfirm: () => void): void {
    this.showView('guided', `
      <div class="view-header">
        <h2>Load Cell Bond</h2>
      </div>
      <div class="wizard-mid-action">
        <p class="wizard-instruction-text">Now place a weight on the scale</p>
        <button id="confirm-btn" class="primary-btn">Confirm</button>
      </div>
    `, () => {
      document.getElementById('confirm-btn')?.addEventListener('click', onConfirm)
    })
  },

  renderWizardResult(
    testName: string,
    result: TestResult,
    isLast: boolean,
    onNext: () => void
  ): void {
    this.showView('guided', `
      <div class="view-header">
        <h2>${testName}</h2>
      </div>
      <div class="wizard-result">
        <div class="result-overall">
          ${this.verdictBadge(result.verdict)}
          <p class="result-summary">${result.summary}</p>
        </div>
        <button id="next-btn" class="primary-btn">${isLast ? 'Finish' : 'Next Test'}</button>
      </div>
    `, () => {
      document.getElementById('next-btn')?.addEventListener('click', onNext)
    })
  },

  _instructionText(testName: string): string {
    switch (testName) {
      case 'Noise & Stability':
        return 'Remove everything from the scale and place it on a flat, stable surface'
      case 'Load Cell Bond':
        return 'Start with the scale empty'
      case 'Drift':
        return 'Remove everything from the scale and leave it still'
      case 'Connection Health':
        return 'Keep the scale connected and powered on'
      default:
        return 'Follow the on-screen instructions'
    }
  },
}
