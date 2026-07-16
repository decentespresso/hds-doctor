import { describe, it, expect } from 'vitest'
import { evaluateNoiseStability, evaluateConnectionHealth, evaluateLoadCellBond, evaluateDrift, hasFreshConversionProgress, overallVerdict } from '../src/diagnostics'
import type { DebugPacket, TestResult } from '../src/types'

function makePacket(overrides: Partial<DebugPacket> = {}): DebugPacket {
  return {
    timestamp: 1000, rawValue: 50000, smoothedValue: 49800,
    tareOffset: 100, conversionTime: 12.34, sps: 10.0,
    readIndex: 5, samplesInUse: 10,
    resetReason: 0,
    protocolVersion: 1,
    conversionSequence: 1,
    lastConversionTimestamp: 1000,
    validSamples: 10,
    configuredSamplesInUse: 10,
    dataOutOfRange: false, signalTimeout: false,
    tareInProgress: false, tareTimes: 0,
    ...overrides,
  }
}

function makeFreshPacket(index: number, overrides: Partial<DebugPacket> = {}): DebugPacket {
  return makePacket({
    timestamp: 1000 + index * 100,
    conversionSequence: index + 1,
    lastConversionTimestamp: 1000 + index * 100,
    ...overrides,
  })
}

function makeFreshPackets(length: number): DebugPacket[] {
  return Array.from({ length }, (_, index) => makeFreshPacket(index))
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
    const packets = makeFreshPackets(10)
    const result = evaluateConnectionHealth(packets)
    expect(result.verdict).toBe('pass')
    expect(result.summary).toContain('median')
    expect(result.summary).toContain('p10')
  })

  it('fails for a single packet', () => {
    expect(evaluateConnectionHealth([makeFreshPacket(0)]).verdict).toBe('fail')
  })

  it('fails when every packet repeats one conversion sequence', () => {
    const packets = Array.from({ length: 10 }, () => makeFreshPacket(0))
    expect(evaluateConnectionHealth(packets).verdict).toBe('fail')
    expect(hasFreshConversionProgress(packets)).toBe(false)
  })

  it('fails when the capture is too short for the requested duration', () => {
    expect(evaluateConnectionHealth(makeFreshPackets(3), 10_000).verdict).toBe('fail')
  })

  it('fails when freshness metadata is legacy even if reserved bytes are populated', () => {
    const packets = makeFreshPackets(10).map(packet => ({
      ...packet,
      protocolVersion: 0,
      conversionSequence: 99,
      lastConversionTimestamp: 99,
      validSamples: 99,
      configuredSamplesInUse: 99,
    }))
    const result = evaluateConnectionHealth(packets)
    expect(result.verdict).toBe('fail')
    expect(result.summary).toContain('Freshness metadata unavailable')
  })

  it('passes with one zero-SPS reading', () => {
    const packets = makeFreshPackets(10).map((packet, index) =>
      index === 0 ? { ...packet, sps: 0 } : packet
    )
    expect(evaluateConnectionHealth(packets).verdict).toBe('pass')
  })

  it('warns when zero-SPS readings are a meaningful fraction', () => {
    const packets = makeFreshPackets(10).map((packet, index) =>
      index < 2 ? { ...packet, sps: 0 } : packet
    )
    expect(evaluateConnectionHealth(packets).verdict).toBe('warning')
  })

  it('fails when zero-SPS readings are the majority', () => {
    const packets = makeFreshPackets(10).map((packet, index) =>
      index < 6 ? { ...packet, sps: 0 } : packet
    )
    expect(evaluateConnectionHealth(packets).verdict).toBe('fail')
  })

  it('fails when timeout or out-of-range packets are the majority', () => {
    const packets = makeFreshPackets(10).map((packet, index) => ({
      ...packet,
      signalTimeout: index < 6,
      dataOutOfRange: index < 6,
    }))
    expect(evaluateConnectionHealth(packets).verdict).toBe('fail')
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
