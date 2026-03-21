import type { Verdict, TestResult, TestId, DebugPacket, Report } from './types'
import { TEST_DEFINITIONS } from './guided'
import { LiveChart } from './chart'

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

  setConnected(connected: boolean, deviceInfo?: { firmwareVersion: string; battery: number } | null): void {
    const { dot, text, btn } = this.connectionBar
    if (dot) {
      dot.classList.toggle('connected', connected)
      dot.classList.toggle('disconnected', !connected)
    }
    if (text) {
      if (connected && deviceInfo) {
        text.textContent = `Connected — FW ${deviceInfo.firmwareVersion}`
      } else {
        text.textContent = connected ? 'Connected' : 'No device connected'
      }
    }
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
          ? `<button id="run-btn" class="button special">Run Quick Check</button>`
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
      <button id="run-again-btn" class="button special">Run Again</button>
    `
    document.getElementById('run-again-btn')?.addEventListener('click', () => {
      this.onNavigate?.('quick-check')
    })
  },

  // ── Guided Diagnostics ───────────────────────────────────────────────────

  renderTestPicker(onStart: (selectedIds: TestId[], sampleCount: 1 | 2 | 4) => void): void {
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
      <div class="picker-settings">
        <label for="guided-sample-count">Samples per reading:</label>
        <select id="guided-sample-count" class="lm-select">
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="4" selected>4</option>
        </select>
      </div>
      <button id="start-guided-btn" class="button special">Start</button>
    `, () => {
      document.getElementById('back-btn')?.addEventListener('click', () => {
        this.onNavigate?.('landing')
      })
      document.getElementById('start-guided-btn')?.addEventListener('click', () => {
        const checked = Array.from(
          document.querySelectorAll<HTMLInputElement>('.test-checkbox:checked')
        ).map(el => el.value as TestId)
        const sampleCountSelect = document.getElementById('guided-sample-count') as HTMLSelectElement
        const sampleCount = parseInt(sampleCountSelect.value, 10) as 1 | 2 | 4
        if (checked.length > 0) onStart(checked, sampleCount)
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
        <button id="ready-btn" class="button special">Ready</button>
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
        <button id="confirm-btn" class="button special">Confirm</button>
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
        <button id="next-btn" class="button special">${isLast ? 'Finish' : 'Next Test'}</button>
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

  // ── Live Monitor ─────────────────────────────────────────────────────────

  renderLiveMonitor(
    connected: boolean,
    onStart: (intervalMs: number, sampleCount: 1 | 2 | 4) => void,
    onStop: () => void
  ): void {
    this.showView('live-monitor', `
      <div class="view-header">
        <button id="back-btn" class="back-btn">&#8592; Back</button>
        <h2>Live Monitor</h2>
      </div>
      <div class="lm-controls">
        <label for="poll-interval-select">Poll interval:</label>
        <select id="poll-interval-select" class="lm-select">
          <option value="50">50 ms</option>
          <option value="100" selected>100 ms</option>
          <option value="200">200 ms</option>
          <option value="500">500 ms</option>
          <option value="1000">1000 ms</option>
        </select>
        <label for="sample-count-select">Samples:</label>
        <select id="sample-count-select" class="lm-select">
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="4" selected>4</option>
        </select>
        ${connected
          ? `<button id="lm-toggle-btn" class="button special" data-running="false">Start Streaming</button>`
          : `<p class="connect-hint">Connect a device first to start streaming.</p>`
        }
      </div>
      <div id="lm-data-panel" class="lm-data-panel" style="display:none;">
        <div class="lm-metrics-grid">
          <div class="lm-metric"><span class="lm-metric-label">Raw Value</span><span id="lm-raw" class="lm-metric-value">—</span></div>
          <div class="lm-metric"><span class="lm-metric-label">Smoothed</span><span id="lm-smoothed" class="lm-metric-value">—</span></div>
          <div class="lm-metric"><span class="lm-metric-label">Tare Offset</span><span id="lm-tare" class="lm-metric-value">—</span></div>
          <div class="lm-metric"><span class="lm-metric-label">Std Dev</span><span id="lm-stddev" class="lm-metric-value">—</span></div>
          <div class="lm-metric"><span class="lm-metric-label">SPS</span><span id="lm-sps" class="lm-metric-value">—</span></div>
          <div class="lm-metric"><span class="lm-metric-label">Conv Time</span><span id="lm-conv" class="lm-metric-value">—</span></div>
        </div>
        <div class="lm-flags">
          <span class="lm-flag"><span id="flag-oor" class="lm-flag-dot"></span> OutOfRange</span>
          <span class="lm-flag"><span id="flag-timeout" class="lm-flag-dot"></span> Timeout</span>
          <span class="lm-flag"><span id="flag-tare" class="lm-flag-dot"></span> TareInProgress</span>
        </div>
        <div id="lm-chart" class="lm-chart-container"></div>
        <div class="lm-stats-grid">
          <div class="lm-metric"><span class="lm-metric-label">Min</span><span id="lm-min" class="lm-metric-value">—</span></div>
          <div class="lm-metric"><span class="lm-metric-label">Max</span><span id="lm-max" class="lm-metric-value">—</span></div>
          <div class="lm-metric"><span class="lm-metric-label">Avg</span><span id="lm-avg" class="lm-metric-value">—</span></div>
          <div class="lm-metric"><span class="lm-metric-label">Range</span><span id="lm-range" class="lm-metric-value">—</span></div>
        </div>
        <div class="lm-history-wrap">
          <table class="lm-history-table">
            <thead>
              <tr><th>Time (ms)</th><th>Raw</th><th>Smoothed</th><th>Std Dev</th></tr>
            </thead>
            <tbody id="lm-history-body"></tbody>
          </table>
        </div>
      </div>
    `, () => {
      document.getElementById('back-btn')?.addEventListener('click', () => {
        onStop()
        this.onNavigate?.('landing')
      })
      if (connected) {
        const toggleBtn = document.getElementById('lm-toggle-btn') as HTMLButtonElement | null
        toggleBtn?.addEventListener('click', () => {
          const running = toggleBtn.dataset.running === 'true'
          if (running) {
            onStop()
            toggleBtn.dataset.running = 'false'
            toggleBtn.textContent = 'Start Streaming'
          } else {
            const intervalSelect = document.getElementById('poll-interval-select') as HTMLSelectElement
            const intervalMs = parseInt(intervalSelect.value, 10)
            const sampleCountSelect = document.getElementById('sample-count-select') as HTMLSelectElement
            const sampleCount = parseInt(sampleCountSelect.value, 10) as 1 | 2 | 4
            const panel = document.getElementById('lm-data-panel')
            if (panel) panel.style.display = 'block'
            onStart(intervalMs, sampleCount)
            toggleBtn.dataset.running = 'true'
            toggleBtn.textContent = 'Stop Streaming'
          }
        })
      }
    })
  },

  updateLiveData(packet: DebugPacket): void {
    const set = (id: string, val: string) => {
      const el = document.getElementById(id)
      if (el) el.textContent = val
    }

    set('lm-raw', String(packet.rawValue))
    set('lm-smoothed', String(packet.smoothedValue))
    set('lm-tare', String(packet.tareOffset))
    set('lm-sps', packet.sps.toFixed(2))
    set('lm-conv', packet.conversionTime.toFixed(2) + ' ms')
    set('lm-min', String(packet.dataMin))
    set('lm-max', String(packet.dataMax))
    set('lm-avg', String(packet.dataAvg))
    set('lm-range', String(packet.dataMax - packet.dataMin))

    const stdDevEl = document.getElementById('lm-stddev')
    if (stdDevEl) {
      stdDevEl.textContent = packet.dataStdDev.toFixed(1)
      stdDevEl.className = 'lm-metric-value ' + (
        packet.dataStdDev < 10 ? 'lm-stddev-good'
        : packet.dataStdDev <= 50 ? 'lm-stddev-warn'
        : 'lm-stddev-bad'
      )
    }

    const setFlag = (id: string, active: boolean) => {
      const dot = document.getElementById(id)
      if (dot) {
        dot.className = 'lm-flag-dot ' + (active ? 'lm-flag-active' : 'lm-flag-inactive')
      }
    }
    setFlag('flag-oor', packet.dataOutOfRange)
    setFlag('flag-timeout', packet.signalTimeout)
    setFlag('flag-tare', packet.tareInProgress)

    const tbody = document.getElementById('lm-history-body') as HTMLTableSectionElement | null
    if (tbody) {
      const tr = document.createElement('tr')
      tr.innerHTML = `<td>${packet.timestamp}</td><td>${packet.rawValue}</td><td>${packet.smoothedValue}</td><td>${packet.dataStdDev.toFixed(1)}</td>`
      tbody.prepend(tr)
      while (tbody.rows.length > 50) {
        tbody.deleteRow(tbody.rows.length - 1)
      }
    }
  },

  // ── Report View ───────────────────────────────────────────────────────────

  renderReport(report: Report, onExport: () => void, onRunAgain: () => void): void {
    this.showView('report', `
      <div class="view-header">
        <button id="back-btn" class="back-btn">&#8592; Back</button>
        <h2>Diagnostic Report</h2>
      </div>
      <div class="report-overall">
        <div class="report-verdict ${`verdict-${report.overallVerdict}`}">
          ${report.overallVerdict.toUpperCase()}
        </div>
        <p class="report-summary">${report.overallSummary}</p>
        <p class="report-meta">${new Date(report.timestamp).toLocaleString()} &nbsp;·&nbsp; v${report.appVersion}</p>
      </div>
      <ul class="report-test-list">
        ${report.testsRun.map((r, i) => `
          <li class="report-test-item" id="report-test-${i}">
            <div class="report-test-header" data-idx="${i}">
              ${this.verdictBadge(r.verdict)}
              <span class="report-test-id">${r.testId}</span>
              <span class="report-test-summary">${r.summary}</span>
              <span class="report-test-expand">&#9660;</span>
            </div>
            <div class="report-test-packets" id="report-packets-${i}" style="display:none;">
              <table class="report-packets-table">
                <thead>
                  <tr><th>Time (ms)</th><th>Raw</th><th>Smoothed</th><th>StdDev</th><th>SPS</th><th>Flags</th></tr>
                </thead>
                <tbody>
                  ${r.rawPackets.map(p => `
                    <tr>
                      <td>${p.timestamp}</td>
                      <td>${p.rawValue}</td>
                      <td>${p.smoothedValue}</td>
                      <td>${p.dataStdDev.toFixed(1)}</td>
                      <td>${p.sps.toFixed(1)}</td>
                      <td>${[
                        p.dataOutOfRange ? 'OOR' : '',
                        p.signalTimeout ? 'TMO' : '',
                        p.tareInProgress ? 'TARE' : '',
                      ].filter(Boolean).join(' ') || '—'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </li>
        `).join('')}
      </ul>
      <div class="report-actions">
        <button id="export-btn" class="button special">Export Report (JSON)</button>
        <button id="run-again-btn" class="button special">Run Again</button>
      </div>
    `, () => {
      document.getElementById('back-btn')?.addEventListener('click', () => {
        this.onNavigate?.('landing')
      })
      document.getElementById('export-btn')?.addEventListener('click', onExport)
      document.getElementById('run-again-btn')?.addEventListener('click', onRunAgain)

      document.querySelectorAll('.report-test-header').forEach(header => {
        header.addEventListener('click', () => {
          const idx = (header as HTMLElement).dataset.idx!
          const packets = document.getElementById(`report-packets-${idx}`)
          const arrow = header.querySelector('.report-test-expand') as HTMLElement | null
          if (packets) {
            const visible = packets.style.display !== 'none'
            packets.style.display = visible ? 'none' : 'block'
            if (arrow) arrow.textContent = visible ? '▼' : '▲'
          }
        })
      })
    })
  },

  initChart(): void {
    const container = document.getElementById('lm-chart')
    if (container) LiveChart.init(container)
  },

  destroyChart(): void {
    LiveChart.destroy()
  },
}
