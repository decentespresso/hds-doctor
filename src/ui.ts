import type { Verdict } from './types'

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
}
