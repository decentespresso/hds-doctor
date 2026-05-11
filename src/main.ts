import { UI } from './ui'
import { Serial } from './serial'
import { BLE } from './ble'
import { LiveChart } from './chart'
import {
  evaluateNoiseStability,
  evaluateConnectionHealth,
  evaluateLoadCellBond,
  evaluateDrift,
  overallVerdict,
} from './diagnostics'
import { compareFirmwareVersion } from './decoder'
import { GuidedWizard } from './guided'
import { generateReport, parseReport, downloadReport, loadReportFromFile } from './report'
import type { Transport, TransportKind } from './transport'
import type { DebugPacket, TestResult, TestId, Report } from './types'
import './style.css'

const App = {
  _connectWatchdog: null as ReturnType<typeof setTimeout> | null,
  transport: Serial as Transport,
  transportKind: 'usb' as TransportKind,
  _supported: false,

  init(): void {
    const hasSerial = 'serial' in navigator
    const hasBluetooth = 'bluetooth' in navigator
    this._supported = hasSerial || hasBluetooth

    UI.init({ hasSerial, hasBluetooth })
    UI.onConnect = () => this.connectUsb()
    UI.onConnectBle = () => this.connectBle()
    UI.onDisconnect = () => this.disconnect()
    UI.onNavigate = (view) => this.navigate(view)

    if (!this._supported) {
      UI.renderUnsupported()
      return
    }

    this._wireTransport(Serial as Transport, 'usb')
    if (hasBluetooth) this._wireTransport(BLE as Transport, 'ble')

    UI.renderLanding()
  },

  _wireTransport(t: Transport, kind: TransportKind): void {
    t.onLedResponse = (info) => {
      if (this._connectWatchdog) {
        clearTimeout(this._connectWatchdog)
        this._connectWatchdog = null
      }
      t.deviceInfo = info
      UI.setConnected(true, info, kind)
      if (compareFirmwareVersion(info.firmwareVersion, '3.0.7') < 0) {
        UI.renderFirmwareError(info.firmwareVersion)
      }
    }
    t.onStatus = (connected) => UI.setConnected(connected, connected ? t.deviceInfo : null, kind)
  },

  async connectUsb(): Promise<void> {
    this.transport = Serial as Transport
    this.transportKind = 'usb'
    const connected = await this.transport.connect()
    if (connected) {
      this._connectWatchdog = setTimeout(() => {
        if (!this.transport.deviceInfo) {
          UI.renderDeviceNotDetected()
        }
      }, 5000)
    }
  },

  async connectBle(): Promise<void> {
    this.transport = BLE as Transport
    this.transportKind = 'ble'
    const connected = await this.transport.connect()
    if (connected) {
      this._connectWatchdog = setTimeout(() => {
        if (!this.transport.deviceInfo) {
          UI.renderDeviceNotDetected()
        }
      }, 5000)
    }
  },

  async disconnect(): Promise<void> {
    if (this._connectWatchdog) {
      clearTimeout(this._connectWatchdog)
      this._connectWatchdog = null
    }
    await this.transport.disconnect()
  },

  navigate(view: string): void {
    if (!this._supported) {
      if (view === 'report') {
        loadReportFromFile().then(report => {
          if (report) this.showReport(report)
        })
      } else {
        UI.renderUnsupported()
      }
      return
    }
    switch (view) {
      case 'landing':
        UI.renderLanding()
        break
      case 'quick-check':
        UI.renderQuickCheck(this.transport.isConnected(), () => this.runQuickCheck())
        break
      case 'guided':
        UI.renderTestPicker(async (selectedIds, sampleCount) => {
          await this.transport.setSampleCount(sampleCount)
          this.runGuided(selectedIds)
        })
        break
      case 'live-monitor':
        UI.renderLiveMonitor(
          this.transport.isConnected(),
          async (intervalMs, sampleCount) => {
            await this.transport.setSampleCount(sampleCount)
            document.getElementById('lm-data-panel')?.classList.remove('hidden')
            UI.initChart()
            this.transport.onPacket = (packet) => {
              UI.updateLiveData(packet)
              LiveChart.addPoint(packet.timestamp, packet.smoothedValue, packet.dataStdDev)
            }
            this.transport.startPolling(intervalMs)
          },
          () => {
            this.transport.stopPolling()
            this.transport.onPacket = null
            UI.destroyChart()
          }
        )
        break
      case 'report':
        loadReportFromFile().then(report => {
          if (report) this.showReport(report)
        })
        break
    }
  },

  // ── Quick Check ──────────────────────────────────────────────────────────

  async runQuickCheck(): Promise<void> {
    await this.transport.setSampleCount(1)
    const DURATION_MS = 10_000
    const POLL_INTERVAL_MS = 100
    const packets: DebugPacket[] = []
    const startTime = Date.now()

    const prevOnPacket = this.transport.onPacket
    this.transport.onPacket = (packet) => {
      packets.push(packet)
      const elapsed = Date.now() - startTime
      const percent = Math.min(100, Math.round((elapsed / DURATION_MS) * 100))
      UI.showQuickCheckProgress(percent, `Collecting… ${packets.length} readings`)
    }

    this.transport.startPolling(POLL_INTERVAL_MS)

    await new Promise<void>((resolve) => setTimeout(resolve, DURATION_MS))

    this.transport.stopPolling()
    this.transport.onPacket = prevOnPacket

    const noiseResult = evaluateNoiseStability(packets)
    const connResult = evaluateConnectionHealth(packets)
    const results: TestResult[] = [noiseResult, connResult]
    const overall = overallVerdict(results)
    const summary = `Collected ${packets.length} readings in 10 seconds`

    UI.showQuickCheckResult(results, overall, summary, () => this.runQuickCheck())
  },

  // ── Guided Diagnostics ───────────────────────────────────────────────────

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
          result!.summary = `${result!.summary.split('—')[0].trim()} — accepted by user`
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
    const reportJson = generateReport(allResults, overall, summaryText, this.transport.deviceInfo ? {
      firmwareVersion: this.transport.deviceInfo.firmwareVersion,
      battery: this.transport.deviceInfo.battery,
    } : undefined)
    const report = parseReport(reportJson)!
    this.showReport(report)
  },

  showReport(report: Report): void {
    UI.renderReport(
      report,
      () => {
        const { generateReport: gen, downloadReport: dl } = { generateReport, downloadReport }
        dl(gen(report.testsRun, report.overallVerdict, report.overallSummary, report.deviceInfo))
      },
      () => this.navigate('guided')
    )
  },

  _cancelled: false,

  async _collectPackets(
    pollIntervalMs: number,
    durationMs: number,
    testName: string
  ): Promise<DebugPacket[] | null> {
    this._cancelled = false
    const packets: DebugPacket[] = []
    const startTime = Date.now()
    const prevOnPacket = this.transport.onPacket

    this.transport.onPacket = (packet) => {
      packets.push(packet)
      const elapsed = Date.now() - startTime
      const percent = Math.min(100, Math.round((elapsed / durationMs) * 100))
      UI.renderWizardCollecting(testName, percent, packets.length)
    }

    this.transport.startPolling(pollIntervalMs)

    await new Promise<void>((resolve) => {
      UI.onCancelCollection = () => {
        this._cancelled = true
        resolve()
      }
      setTimeout(resolve, durationMs)
    })

    this.transport.stopPolling()
    this.transport.onPacket = prevOnPacket
    UI.onCancelCollection = null

    if (this._cancelled) return null
    return packets
  },
}

App.init()
