import type { TestDefinition, TestId } from './types'

export const TEST_DEFINITIONS: TestDefinition[] = [
  {
    id: 'noise-stability',
    name: 'Noise & Stability',
    description: 'Checks reading stability on an empty scale',
    durationEstimate: '~10s',
    pollIntervalMs: 100,
    collectionDurationMs: 10000,
  },
  {
    id: 'load-cell-bond',
    name: 'Load Cell Bond',
    description: 'Checks if load cell responds to weight',
    durationEstimate: '~20s',
    pollIntervalMs: 100,
    collectionDurationMs: 5000,
  },
  {
    id: 'drift',
    name: 'Drift',
    description: 'Checks if readings drift while scale is idle',
    durationEstimate: '~30s',
    pollIntervalMs: 500,
    collectionDurationMs: 30000,
  },
  {
    id: 'connection-health',
    name: 'Connection Health',
    description: 'Checks data link between scale and computer',
    durationEstimate: '~10s',
    pollIntervalMs: 100,
    collectionDurationMs: 10000,
  },
]

export type WizardPhase = 'instruction' | 'collecting' | 'mid-action' | 'result'

export class GuidedWizard {
  selectedTests: TestDefinition[]
  currentTestIndex: number
  phase: WizardPhase
  isDone: boolean
  private collectingSubPhase: 'first' | 'second' = 'first'

  constructor(selectedIds: TestId[]) {
    this.selectedTests = TEST_DEFINITIONS.filter(t => selectedIds.includes(t.id))
    this.currentTestIndex = 0
    this.phase = 'instruction'
    this.isDone = false
  }

  get currentTest(): TestDefinition {
    return this.selectedTests[this.currentTestIndex]
  }

  private get isLoadCellBond(): boolean {
    return this.currentTest.id === 'load-cell-bond'
  }

  advance(): void {
    if (this.isDone) return
    switch (this.phase) {
      case 'instruction':
        this.phase = 'collecting'
        this.collectingSubPhase = 'first'
        break
      case 'collecting':
        if (this.isLoadCellBond && this.collectingSubPhase === 'first') {
          this.phase = 'mid-action'
        } else {
          this.phase = 'result'
        }
        break
      case 'mid-action':
        this.phase = 'collecting'
        this.collectingSubPhase = 'second'
        break
      case 'result':
        if (this.currentTestIndex < this.selectedTests.length - 1) {
          this.currentTestIndex++
          this.phase = 'instruction'
          this.collectingSubPhase = 'first'
        } else {
          this.isDone = true
        }
        break
    }
  }

  restartCurrentTest(): void {
    this.phase = 'instruction'
    this.collectingSubPhase = 'first'
  }
}
