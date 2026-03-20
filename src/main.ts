import { UI } from './ui'
import { Serial } from './serial'
import {
  evaluateNoiseStability,
  evaluateConnectionHealth,
  evaluateLoadCellBond,
  evaluateDrift,
  overallVerdict,
} from './diagnostics'
import { GuidedWizard } from './guided'
import type { DebugPacket, TestResult, TestId } from './types'
import './style.css'

const App = {
  init(): void {
    UI.init()
    UI.onConnect = () => this.connect()
    UI.onDisconnect = () => this.disconnect()
    UI.onNavigate = (view) => this.navigate(view)
    Serial.onStatus = (connected) => UI.setConnected(connected)
    UI.renderLanding()
  },

  async connect(): Promise<void> {
    await Serial.connect()
  },

  async disconnect(): Promise<void> {
    await Serial.disconnect()
  },

  navigate(view: string): void {
    switch (view) {
      case 'landing':
        UI.renderLanding()
        break
      case 'quick-check':
        UI.renderQuickCheck(!!Serial.port, () => this.runQuickCheck())
        break
      case 'guided':
        UI.renderTestPicker((selectedIds) => this.runGuided(selectedIds))
        break
      case 'live-monitor':
        // Task 10
        break
      case 'report':
        // Task 11
        break
    }
  },

  // ── Quick Check ──────────────────────────────────────────────────────────

  async runQuickCheck(): Promise<void> {
    const DURATION_MS = 10_000
    const POLL_INTERVAL_MS = 100
    const packets: DebugPacket[] = []
    const startTime = Date.now()

    const prevOnPacket = Serial.onPacket
    Serial.onPacket = (packet) => {
      packets.push(packet)
      const elapsed = Date.now() - startTime
      const percent = Math.min(100, Math.round((elapsed / DURATION_MS) * 100))
      UI.showQuickCheckProgress(percent, `Collecting… ${packets.length} samples`)
    }

    Serial.startPolling(POLL_INTERVAL_MS)

    await new Promise<void>((resolve) => setTimeout(resolve, DURATION_MS))

    Serial.stopPolling()
    Serial.onPacket = prevOnPacket

    const noiseResult = evaluateNoiseStability(packets)
    const connResult = evaluateConnectionHealth(packets)
    const results: TestResult[] = [noiseResult, connResult]
    const overall = overallVerdict(results)
    const summary = `Tested ${packets.length} packets in 10 seconds`

    UI.showQuickCheckResult(results, overall, summary)
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
      wizard.advance() // collecting -> mid-action (load-cell-bond) or result

      let secondPackets: DebugPacket[] = []

      if (wizard.phase === 'mid-action') {
        // mid-action: ask user to place weight
        await new Promise<void>((resolve) => {
          UI.renderWizardMidAction(resolve)
        })
        wizard.advance() // mid-action -> collecting

        // second collection
        secondPackets = await this._collectPackets(
          test.pollIntervalMs,
          test.collectionDurationMs,
          test.name
        )
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

      allResults.push(result!)
      const isLast = wizard.currentTestIndex === wizard.selectedTests.length - 1

      // result phase
      await new Promise<void>((resolve) => {
        UI.renderWizardResult(test.name, result!, isLast, resolve)
      })
      wizard.advance() // result -> next instruction or done
    }

    // All tests complete — log results (Task 11 will render the report view)
    console.log('Guided diagnostics complete', allResults)
    // TODO Task 11: navigate to report view with allResults
  },

  async _collectPackets(
    pollIntervalMs: number,
    durationMs: number,
    testName: string
  ): Promise<DebugPacket[]> {
    const packets: DebugPacket[] = []
    const startTime = Date.now()
    const prevOnPacket = Serial.onPacket

    Serial.onPacket = (packet) => {
      packets.push(packet)
      const elapsed = Date.now() - startTime
      const percent = Math.min(100, Math.round((elapsed / durationMs) * 100))
      UI.renderWizardCollecting(testName, percent, packets.length)
    }

    Serial.startPolling(pollIntervalMs)

    await new Promise<void>((resolve) => setTimeout(resolve, durationMs))

    Serial.stopPolling()
    Serial.onPacket = prevOnPacket

    return packets
  },
}

App.init()
