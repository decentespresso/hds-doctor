import { describe, it, expect } from 'vitest'
import { evaluateNoiseStability, evaluateConnectionHealth, evaluateLoadCellBond, evaluateDrift, overallVerdict } from '../src/diagnostics'
import type { DebugPacket, TestResult } from '../src/types'

function makePacket(overrides: Partial<DebugPacket> = {}): DebugPacket {
  return {
    timestamp: 1000, rawValue: 50000, smoothedValue: 49800,
    tareOffset: 100, conversionTime: 12.34, sps: 10.0,
    readIndex: 5, samplesInUse: 10,
    resetReason: 0,
    dataOutOfRange: false, signalTimeout: false,
    tareInProgress: false, tareTimes: 0,
    ...overrides,
  }
}

describe('evaluateNoiseStability', () => {
  it('passes with low raw-value spread', () => {
    // rawValues 50000..50009 → stddev ≈ 2.87
    const packets = Array.from({ length: 10 }, (_, i) => makePacket({ rawValue: 50000 + i }))
    const result = evaluateNoiseStability(packets)
    expect(result.verdict).toBe('pass')
  })

  it('warns with moderate raw-value spread', () => {
    // rawValues 50000..50090 step 10 → stddev ≈ 28.7
    const packets = Array.from({ length: 10 }, (_, i) => makePacket({ rawValue: 50000 + i * 10 }))
    const result = evaluateNoiseStability(packets)
    expect(result.verdict).toBe('warning')
  })

  it('fails with high raw-value spread', () => {
    // rawValues 50000..50450 step 50 → stddev ≈ 143
    const packets = Array.from({ length: 10 }, (_, i) => makePacket({ rawValue: 50000 + i * 50 }))
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

  it('fails when timeout-only packets are persistent', () => {
    const packets = Array.from({ length: 10 }, (_, i) => makePacket({ signalTimeout: i < 6 }))
    expect(evaluateConnectionHealth(packets).verdict).toBe('fail')
  })

  it('fails when out-of-range-only packets are persistent', () => {
    const packets = Array.from({ length: 10 }, (_, i) => makePacket({ dataOutOfRange: i < 6 }))
    expect(evaluateConnectionHealth(packets).verdict).toBe('fail')
  })

  it('counts a packet with both flags once', () => {
    const packets = Array.from({ length: 10 }, (_, i) => makePacket({
      signalTimeout: i < 5,
      dataOutOfRange: i < 5,
    }))
    expect(evaluateConnectionHealth(packets).verdict).toBe('warning')
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

  it('sets overridable on low-delta fail', () => {
    const empty = Array.from({ length: 5 }, () => makePacket({ smoothedValue: 1000 }))
    const loaded = Array.from({ length: 5 }, () => makePacket({ smoothedValue: 1050 }))
    const result = evaluateLoadCellBond(empty, loaded)
    expect(result.verdict).toBe('fail')
    expect(result.overridable).toBe(true)
  })

  it('sets overridable on erratic fail', () => {
    const empty = Array.from({ length: 5 }, () => makePacket({ smoothedValue: 1000 }))
    const loaded = Array.from({ length: 5 }, (_, i) => makePacket({ smoothedValue: 1000 + i * 500 }))
    const result = evaluateLoadCellBond(empty, loaded)
    expect(result.verdict).toBe('fail')
    expect(result.overridable).toBe(true)
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
})

describe('evaluateDrift', () => {
  it('passes with stable smoothed values', () => {
    const packets = Array.from({ length: 30 }, () => makePacket({ smoothedValue: 49800 }))
    const result = evaluateDrift(packets)
    expect(result.verdict).toBe('pass')
  })

  it('fails with large smoothed value drift', () => {
    const packets = Array.from({ length: 30 }, (_, i) =>
      makePacket({ smoothedValue: 49800 + (i * 50) })
    )
    const result = evaluateDrift(packets)
    expect(result.verdict).toBe('fail')
  })

  it('reports drift from the net raw signal', () => {
    const packets = Array.from({ length: 30 }, (_, i) => makePacket({
      smoothedValue: 49800 + i,
    }))
    const result = evaluateDrift(packets)
    expect(result.verdict).toBe('warning')
    expect(result.summary).toContain('net signal')
  })

  it('returns an invalid tare-changed result when tare changes during capture', () => {
    const packets = Array.from({ length: 30 }, (_, i) => makePacket({ tareOffset: 100 + i }))
    const result = evaluateDrift(packets)
    expect(result.verdict).toBe('fail')
    expect(result.invalid).toBe(true)
    expect(result.invalidReason).toBe('tare-changed')
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

describe('empty captures', () => {
  it('fails noise stability with zero packets', () => {
    const result = evaluateNoiseStability([])
    expect(result.verdict).toBe('fail')
    expect(result.rawPackets).toEqual([])
  })

  it('fails connection health with zero packets', () => {
    const result = evaluateConnectionHealth([])
    expect(result.verdict).toBe('fail')
    expect(result.rawPackets).toEqual([])
  })

  it('fails load-cell bond with zero packets in both phases', () => {
    const result = evaluateLoadCellBond([], [])
    expect(result.verdict).toBe('fail')
    expect(result.rawPackets).toEqual([])
  })

  it('fails drift with zero packets', () => {
    const result = evaluateDrift([])
    expect(result.verdict).toBe('fail')
    expect(result.rawPackets).toEqual([])
  })
})
