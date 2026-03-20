import { describe, it, expect } from 'vitest'
import { evaluateNoiseStability, evaluateConnectionHealth, evaluateLoadCellBond, evaluateDrift, overallVerdict } from '../src/diagnostics'
import type { DebugPacket, TestResult } from '../src/types'

function makePacket(overrides: Partial<DebugPacket> = {}): DebugPacket {
  return {
    timestamp: 1000, rawValue: 50000, smoothedValue: 49800,
    tareOffset: 100, conversionTime: 12.34, sps: 10.0,
    readIndex: 5, samplesInUse: 10,
    dataMin: 49500, dataMax: 50500, dataAvg: 50000,
    dataStdDev: 4.2, dataOutOfRange: false, signalTimeout: false,
    tareInProgress: false, tareTimes: 0,
    ...overrides,
  }
}

describe('evaluateNoiseStability', () => {
  it('passes with low std dev', () => {
    const packets = Array.from({ length: 10 }, () => makePacket({ dataStdDev: 5 }))
    const result = evaluateNoiseStability(packets)
    expect(result.verdict).toBe('pass')
  })

  it('warns with moderate std dev', () => {
    const packets = Array.from({ length: 10 }, () => makePacket({ dataStdDev: 30 }))
    const result = evaluateNoiseStability(packets)
    expect(result.verdict).toBe('warning')
  })

  it('fails with high std dev', () => {
    const packets = Array.from({ length: 10 }, () => makePacket({ dataStdDev: 100 }))
    const result = evaluateNoiseStability(packets)
    expect(result.verdict).toBe('fail')
  })
})

describe('evaluateConnectionHealth', () => {
  it('passes with no flags and stable SPS', () => {
    const packets = Array.from({ length: 10 }, () => makePacket())
    const result = evaluateConnectionHealth(packets)
    expect(result.verdict).toBe('pass')
  })

  it('fails with persistent timeouts', () => {
    const packets = Array.from({ length: 10 }, () => makePacket({ signalTimeout: true }))
    const result = evaluateConnectionHealth(packets)
    expect(result.verdict).toBe('fail')
  })

  it('warns with occasional flags', () => {
    const packets = Array.from({ length: 10 }, (_, i) =>
      makePacket({ signalTimeout: i === 3 })
    )
    const result = evaluateConnectionHealth(packets)
    expect(result.verdict).toBe('warning')
  })
})

describe('evaluateLoadCellBond', () => {
  it('passes with large ADC delta', () => {
    const empty = Array.from({ length: 5 }, () => makePacket({ smoothedValue: 1000 }))
    const loaded = Array.from({ length: 5 }, () => makePacket({ smoothedValue: 50000 }))
    const result = evaluateLoadCellBond(empty, loaded)
    expect(result.verdict).toBe('pass')
  })

  it('fails with no delta', () => {
    const empty = Array.from({ length: 5 }, () => makePacket({ smoothedValue: 1000 }))
    const loaded = Array.from({ length: 5 }, () => makePacket({ smoothedValue: 1050 }))
    const result = evaluateLoadCellBond(empty, loaded)
    expect(result.verdict).toBe('fail')
  })
})

describe('evaluateDrift', () => {
  it('passes with stable tare offset', () => {
    const packets = Array.from({ length: 30 }, () => makePacket({ tareOffset: 100 }))
    const result = evaluateDrift(packets)
    expect(result.verdict).toBe('pass')
  })

  it('fails with large tare variance', () => {
    const packets = Array.from({ length: 30 }, (_, i) =>
      makePacket({ tareOffset: 100 + (i * 50) })
    )
    const result = evaluateDrift(packets)
    expect(result.verdict).toBe('fail')
  })
})

describe('overallVerdict', () => {
  it('returns worst verdict', () => {
    const results: TestResult[] = [
      { testId: 'noise-stability', verdict: 'pass', summary: '', rawPackets: [] },
      { testId: 'connection-health', verdict: 'fail', summary: '', rawPackets: [] },
    ]
    expect(overallVerdict(results)).toBe('fail')
  })
})
