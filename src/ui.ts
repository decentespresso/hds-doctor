import type { Verdict, TestResult, TestId, DebugPacket, Report } from './types'
import { TEST_DEFINITIONS } from './guided'
import { LiveChart } from './chart'

type ViewName = 'landing' | 'quick-check' | 'guided' | 'live-monitor' | 'report'

const SELECTED_METHOD_KEY = 'hdsDoctor.connectMethod'

export const UI = {
  appEl: null as HTMLElement | null,
  connectionBar: {
    dot: null as HTMLElement | null,
    text: null as HTMLElement | null,
    btn: null as HTMLButtonElement | null,
    caret: null as HTMLButtonElement | null,
    menu: null as HTMLElement | null,
  },
  currentView: null as ViewName | null,
  capabilities: { hasSerial: false, hasBluetooth: false },
  selectedMethod: 'usb' as 'usb' | 'ble',
  onNavigate: null as ((view: ViewName) => void) | null,
  onConnect: null as (() => void) | null,
  onConnectBle: null as (() => void) | null,
  onDisconnect: null as (() => void) | null,

  init(caps?: { hasSerial: boolean; hasBluetooth: boolean }): void {
    this.appEl = document.getElementById('app')
    this.connectionBar.dot = document.getElementById('status-indicator')
    this.connectionBar.text = document.getElementById('status-text')
    this.connectionBar.btn = document.getElementById('connect-btn') as HTMLButtonElement
    this.connectionBar.caret = document.getElementById('connect-caret') as HTMLButtonElement
    this.connectionBar.menu = document.getElementById('connect-menu')
    if (caps) this.capabilities = caps

    // Pick default method: persisted choice if still available, else first available transport.
    const stored = (typeof localStorage !== 'undefined' ? localStorage.getItem(SELECTED_METHOD_KEY) : null) as 'usb' | 'ble' | null
    if (stored === 'ble' && this.capabilities.hasBluetooth) this.selectedMethod = 'ble'
    else if (stored === 'usb' && this.capabilities.hasSerial) this.selectedMethod = 'usb'
    else this.selectedMethod = this.capabilities.hasSerial ? 'usb' : 'ble'

    this.connectionBar.btn.addEventListener('click', () => {
      if (this.connectionBar.dot?.classList.contains('connected')) {
        this.onDisconnect?.()
      } else {
        this._fireConnect()
      }
    })
    this._initSplitDropdown()
    this._updateConnectButton(false)

    // No usable transport — hide the connect bar entirely; user can still load reports.
    if (!this.capabilities.hasSerial && !this.capabilities.hasBluetooth) {
      document.getElementById('connection-bar')?.classList.add('hidden')
    }
  },

  _fireConnect(): void {
    if (this.selectedMethod === 'ble') this.onConnectBle?.()
    else this.onConnect?.()
  },

  _initSplitDropdown(): void {
    const { caret, menu } = this.connectionBar
    if (!caret || !menu) return

    // Only show the caret when the user actually has a choice.
    const bothAvailable = this.capabilities.hasSerial && this.capabilities.hasBluetooth
    if (!bothAvailable) {
      caret.classList.add('hidden')
      return
    }
    caret.classList.remove('hidden')

    const closeMenu = () => {
      menu.classList.add('hidden')
      caret.setAttribute('aria-expanded', 'false')
    }
    const openMenu = () => {
      menu.classList.remove('hidden')
      caret.setAttribute('aria-expanded', 'true')
    }

    caret.addEventListener('click', (e) => {
      e.stopPropagation()
      if (menu.classList.contains('hidden')) openMenu()
      else closeMenu()
    })

    document.addEventListener('click', (e) => {
      if (menu.classList.contains('hidden')) return
      if (!menu.contains(e.target as Node) && e.target !== caret) closeMenu()
    })

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.classList.contains('hidden')) closeMenu()
    })

    menu.querySelectorAll<HTMLElement>('.connect-menu-item').forEach(item => {
      const method = item.dataset.method as 'usb' | 'ble'
      // Hide options the browser can't run.
      if (method === 'usb' && !this.capabilities.hasSerial) item.style.display = 'none'
      if (method === 'ble' && !this.capabilities.hasBluetooth) item.style.display = 'none'
      const activate = () => {
        this.selectedMethod = method
        try { localStorage.setItem(SELECTED_METHOD_KEY, method) } catch {}
        closeMenu()
        const isConnected = this.connectionBar.dot?.classList.contains('connected')
        this._updateConnectButton(!!isConnected)
        if (!isConnected) this._fireConnect()
      }
      item.addEventListener('click', activate)
      item.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
          e.preventDefault()
          activate()
        }
      })
    })
  },

  _updateConnectButton(connected: boolean): void {
    const { btn, caret } = this.connectionBar
    if (!btn) return
    if (connected) {
      btn.textContent = 'Disconnect'
      caret?.classList.add('hidden')
    } else {
      btn.textContent = this.selectedMethod === 'ble' ? 'Connect via BLE' : 'Connect via USB'
      // Restore caret visibility only when both transports are available.
      if (this.capabilities.hasSerial && this.capabilities.hasBluetooth) {
        caret?.classList.remove('hidden')
      }
    }
  },

  setConnected(
    connected: boolean,
    deviceInfo?: { firmwareVersion: string; battery: number } | null,
    transportKind?: 'usb' | 'ble',
  ): void {
    const { dot, text } = this.connectionBar
    if (dot) {
      dot.classList.toggle('connected', connected)
      dot.classList.toggle('disconnected', !connected)
      dot.setAttribute('aria-label', connected ? 'Connected' : 'Disconnected')
    }
    const transportLabel = transportKind === 'ble' ? ' (BLE)' : transportKind === 'usb' ? ' (USB)' : ''
    if (text) {
      if (connected && deviceInfo) {
        text.textContent = `Connected — FW ${deviceInfo.firmwareVersion}${transportLabel}`
      } else {
        text.textContent = connected ? `Connected${transportLabel}` : 'No device connected'
      }
    }
    this._updateConnectButton(connected)
  },

  showView(name: ViewName, html: string, init?: () => void): void {
    if (!this.appEl) return
    this.currentView = name
    this.appEl.innerHTML = html
    init?.()
  },

  renderLanding(): void {
    this.showView('landing', `
      <h1>HDS Doctor</h1>
      <div class="mode-cards">
        <div class="mode-card" data-mode="quick-check" role="button" tabindex="0">
          <div class="mode-card-icon">&#9889;</div>
          <div class="mode-card-title">Quick Check</div>
          <div class="mode-card-desc">10-second automated test</div>
        </div>
        <div class="mode-card" data-mode="guided" role="button" tabindex="0">
          <div class="mode-card-icon">&#128270;</div>
          <div class="mode-card-title">Guided Diagnostics</div>
          <div class="mode-card-desc">Step-by-step with physical tests</div>
        </div>
        <div class="mode-card" data-mode="live-monitor" role="button" tabindex="0">
          <div class="mode-card-icon">&#128200;</div>
          <div class="mode-card-title">Live Monitor</div>
          <div class="mode-card-desc">Real-time data stream</div>
        </div>
      </div>
      <p class="power-on-hint">Make sure your scale is powered on before connecting.</p>
      <div style="text-align:center;">
        <button id="load-report-btn" class="button small">Load a saved report</button>
      </div>
    `, () => {
      this.appEl!.querySelectorAll('.mode-card').forEach(card => {
        const handler = () => {
          const mode = (card as HTMLElement).dataset.mode as ViewName
          this.onNavigate?.(mode)
        }
        card.addEventListener('click', handler)
        card.addEventListener('keydown', (e) => {
          if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
            e.preventDefault()
            handler()
          }
        })
      })
      document.getElementById('load-report-btn')?.addEventListener('click', () => {
        this.onNavigate?.('report')
      })
    })
  },

  renderUnsupported(): void {
    this.showView('landing', `
      <h1>HDS Doctor</h1>
      <div class="firmware-error">
        <h2>Browser Not Supported</h2>
        <p>Live diagnostics require Web Serial or Web Bluetooth. Safari and Firefox do not support these APIs.</p>
        <p>To connect a scale, use <strong>Chrome</strong>, <strong>Edge</strong>, or <strong>Opera</strong> on desktop, or <strong>Chrome on Android</strong>.</p>
        <p>You can still load and inspect a previously saved diagnostic report below.</p>
      </div>
      <div style="text-align:center; margin-top:1.5em;">
        <button id="load-report-btn" class="button special small">Load a saved report</button>
      </div>
    `, () => {
      document.getElementById('load-report-btn')?.addEventListener('click', () => {
        this.onNavigate?.('report')
      })
    })
  },

  renderFirmwareError(version: string): void {
    this.showView('landing', `
      <h1>HDS Doctor</h1>
      <div class="firmware-error">
        <h2>Firmware Update Required</h2>
        <p>Your scale is running firmware <strong>${version}</strong>, which does not support debug mode.</p>
        <p>Update to firmware <strong>3.0.7</strong> or later to use HDS Doctor.</p>
      </div>
      <button id="back-btn" class="button small" style="display:block;margin:1.5em auto 0;">Back to Home</button>
    `, () => {
      document.getElementById('back-btn')?.addEventListener('click', () => {
        this.onNavigate?.('landing')
      })
    })
  },

  renderDeviceNotDetected(): void {
    this.showView('landing', `
      <h1>HDS Doctor</h1>
      <div class="device-not-detected">
        <h2>Device Not Recognized</h2>
        <p>No response received from the scale. This device may not be a Decent scale, or it may be running firmware that does not support debug mode.</p>
      </div>
      <button id="back-btn" class="button small" style="display:block;margin:1.5em auto 0;">Back to Home</button>
    `, () => {
      document.getElementById('back-btn')?.addEventListener('click', () => {
        this.onNavigate?.('landing')
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
      <div id="qc-progress" class="hidden">
        <div class="progress-bar-wrap" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" id="qc-progress-wrap">
          <div id="qc-progress-bar" class="progress-bar" style="width:0%"></div>
        </div>
        <p id="qc-status-text" class="status-text" aria-live="polite"></p>
      </div>
      <div id="qc-result" class="hidden"></div>
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
    document.getElementById('qc-action')?.classList.add('hidden')
    document.getElementById('qc-progress')?.classList.remove('hidden')
    const bar = document.getElementById('qc-progress-bar')
    if (bar) bar.style.width = `${percent}%`
    const wrap = document.getElementById('qc-progress-wrap')
    if (wrap) wrap.setAttribute('aria-valuenow', String(Math.round(percent)))
    const statusText = document.getElementById('qc-status-text')
    if (statusText) statusText.textContent = status
  },

  showQuickCheckResult(results: TestResult[], overall: Verdict, summary: string, onRunAgain: () => void): void {
    document.getElementById('qc-progress')?.classList.add('hidden')
    const resultEl = document.getElementById('qc-result')
    if (!resultEl) return

    resultEl.classList.remove('hidden')
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
            ${r.rawPatternDiagnostic ? `
              <div class="raw-pattern-tip">
                <span class="raw-pattern-label">Raw ADC:</span>
                <code class="raw-pattern-hex">${r.rawPatternDiagnostic.rawValueHex}</code>
                <span class="raw-pattern-desc">${r.rawPatternDiagnostic.description}</span>
              </div>
            ` : ''}
          </li>
        `).join('')}
      </ul>
      <button id="run-again-btn" class="button special">Run Again</button>
    `
    document.getElementById('run-again-btn')?.addEventListener('click', onRunAgain)
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
          <option value="1" selected>1</option>
          <option value="2">2</option>
          <option value="4">4</option>
        </select>
        <span class="settings-warning">Advanced — only change if instructed to do so</span>
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

  onCancelCollection: null as (() => void) | null,

  renderWizardCollecting(testName: string, percent: number, sampleCount: number, onCancel?: () => void): void {
    if (this.currentView !== 'guided') return
    if (onCancel) this.onCancelCollection = onCancel
    const bar = document.getElementById('wizard-progress-bar')
    const countEl = document.getElementById('wizard-sample-count')
    if (bar && countEl) {
      bar.style.width = `${percent}%`
      countEl.textContent = `${sampleCount} readings collected`
      const wrap = document.getElementById('wizard-progress-wrap')
      if (wrap) wrap.setAttribute('aria-valuenow', String(Math.round(percent)))
      return
    }
    // First render
    this.showView('guided', `
      <div class="view-header">
        <h2>${testName}</h2>
      </div>
      <div class="wizard-collecting">
        <p class="collecting-label">Collecting data…</p>
        <div class="progress-bar-wrap" role="progressbar" aria-valuenow="${Math.round(percent)}" aria-valuemin="0" aria-valuemax="100" id="wizard-progress-wrap">
          <div id="wizard-progress-bar" class="progress-bar" style="width:${percent}%"></div>
        </div>
        <p id="wizard-sample-count" class="status-text" aria-live="polite">${sampleCount} readings collected</p>
        <button id="cancel-collection-btn" class="back-btn">Cancel</button>
      </div>
    `, () => {
      document.getElementById('cancel-collection-btn')?.addEventListener('click', () => {
        this.onCancelCollection?.()
      })
    })
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
    onNext: () => void,
    onOverride?: () => void,
    onRetest?: () => void
  ): void {
    const overrideBtn = result.overridable && onOverride
      ? `<button id="override-btn" class="button small">Accept as Pass</button>`
      : ''

    const rawDiagnostic = result.rawPatternDiagnostic
      ? `<div class="raw-pattern-tip">
           <span class="raw-pattern-label">Raw ADC:</span>
           <code class="raw-pattern-hex">${result.rawPatternDiagnostic.rawValueHex}</code>
           <span class="raw-pattern-desc">${result.rawPatternDiagnostic.description}</span>
         </div>`
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
        ${rawDiagnostic}
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
      </div>
      <div class="lm-controls">
        <label for="sample-count-select">Samples:</label>
        <select id="sample-count-select" class="lm-select">
          <option value="1" selected>1</option>
          <option value="2">2</option>
          <option value="4">4</option>
        </select>
        <span class="settings-warning">Advanced — only change if instructed to do so</span>
      </div>
      <div>
        ${connected
          ? `<button id="lm-toggle-btn" class="button special" data-running="false">Start Streaming</button>`
          : `<p class="connect-hint">Connect a device first to start streaming.</p>`
        }
      </div>
      <div id="lm-data-panel" class="lm-data-panel hidden">
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
        packet.dataStdDev < 25 ? 'lm-stddev-good'
        : packet.dataStdDev <= 60 ? 'lm-stddev-warn'
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
        <p class="report-meta">${new Date(report.timestamp).toLocaleString()} &nbsp;·&nbsp; App v${report.appVersion}${report.deviceInfo?.firmwareVersion ? ` &nbsp;·&nbsp; FW ${report.deviceInfo.firmwareVersion}` : ''}</p>
      </div>
      <ul class="report-test-list">
        ${report.testsRun.map((r, i) => `
          <li class="report-test-item" id="report-test-${i}">
            <div class="report-test-header" data-idx="${i}" role="button" tabindex="0" aria-expanded="false" aria-controls="report-packets-${i}">
              ${this.verdictBadge(r.verdict)}
              <span class="report-test-id">${r.testId}</span>
              <span class="report-test-summary">${r.summary}</span>
              ${r.rawPatternDiagnostic ? `
                <span class="raw-pattern-hex-inline">${r.rawPatternDiagnostic.rawValueHex}</span>
              ` : ''}
              <span class="report-test-expand">&#9660;</span>
            </div>
            <div class="report-test-packets hidden" id="report-packets-${i}">
              ${r.rawPatternDiagnostic && r.rawPatternDiagnostic.pattern !== 'responsive' ? `
                <div class="raw-pattern-tip">
                  <span class="raw-pattern-label">Pattern: <strong>${r.rawPatternDiagnostic.pattern}</strong></span>
                  <p class="raw-pattern-desc">${r.rawPatternDiagnostic.description}</p>
                </div>
              ` : ''}
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
        const toggle = () => {
          const idx = (header as HTMLElement).dataset.idx!
          const packets = document.getElementById(`report-packets-${idx}`)
          const arrow = header.querySelector('.report-test-expand') as HTMLElement | null
          if (packets) {
            const expanded = !packets.classList.contains('hidden')
            packets.classList.toggle('hidden')
            ;(header as HTMLElement).setAttribute('aria-expanded', String(!expanded))
            if (arrow) arrow.textContent = expanded ? '\u25BC' : '\u25B2'
          }
        }
        header.addEventListener('click', toggle)
        header.addEventListener('keydown', (e) => {
          if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
            e.preventDefault()
            toggle()
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
