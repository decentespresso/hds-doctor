import { describe, it, expect } from 'vitest'
import { classifyRawPattern } from '../src/classifier'
import type { DebugPacket } from '../src/types'

function pkt(rawValue: number): DebugPacket {
  return {
    timestamp: 1000, rawValue, smoothedValue: rawValue,
    tareOffset: 100, conversionTime: 12.34, sps: 10.0,
    readIndex: 5, samplesInUse: 10,
    dataMin: rawValue - 100, dataMax: rawValue + 100, dataAvg: rawValue,
    dataStdDev: 4.2, dataOutOfRange: false, signalTimeout: false,
    tareInProgress: false, tareTimes: 0,
  }
}

describe('classifyRawPattern', () => {
  it('returns saturated-high for all 0xFFFFFF packets', () => {
    const packets = [pkt(0xFFFFFF), pkt(0xFFFFFF), pkt(0xFFFFFF)]
    const result = classifyRawPattern(packets)
    expect(result.pattern).toBe('saturated-high')
    expect(result.rawValueHex).toBe('0xFFFFFF')
    expect(result.description).toContain('cold solder joint')
    expect(result.description).toContain('U21')
  })

  it('returns saturated-low for all 0x000000 packets', () => {
    const packets = [pkt(0x000000), pkt(0x000000)]
    const result = classifyRawPattern(packets)
    expect(result.pattern).toBe('saturated-low')
    expect(result.rawValueHex).toBe('0x000000')
    expect(result.description).toContain('shorted')
  })

  it('returns midscale-frozen for all near-0x800000 packets', () => {
    const packets = [pkt(0x800000), pkt(0x800010)]
    // wait — these are not all identical, so it won't be "all identical" check
    // need truly identical for pinned
    const identical = [pkt(0x800000), pkt(0x800000), pkt(0x800000)]
    const result = classifyRawPattern(identical)
    expect(result.pattern).toBe('midscale-frozen')
    expect(result.rawValueHex).toBe('0x800000')
    expect(result.description).toContain('hung')
  })

  it('detects wandering when values vary slightly but do not respond', () => {
    const packets = [
      pkt(0x800100), pkt(0x800101), pkt(0x800102),
      pkt(0x800100), pkt(0x800103), pkt(0x800101),
    ]
    const result = classifyRawPattern(packets)
    expect(result.pattern).toBe('wandering')
    expect(result.description).toContain('VREF')
    expect(result.description).toContain('U27')
  })

  it('returns responsive for normal varying values', () => {
    const packets = [
      pkt(50000), pkt(50100), pkt(49900),
      pkt(50200), pkt(49800), pkt(50150),
    ]
    const result = classifyRawPattern(packets)
    expect(result.pattern).toBe('responsive')
  })

  it('returns responsive for empty packet array', () => {
    const result = classifyRawPattern([])
    expect(result.pattern).toBe('responsive')
    expect(result.rawValueHex).toBe('N/A')
  })

  it('handles other pinned values as saturated-high', () => {
    const packets = [pkt(0x123456), pkt(0x123456)]
    const result = classifyRawPattern(packets)
    expect(result.pattern).toBe('saturated-high')
    expect(result.rawValueHex).toBe('0x123456')
    expect(result.description).toContain('unexpected stuck value')
  })

  it('formats hex with leading zeros for small values', () => {
    const packets = [pkt(0x0000FF), pkt(0x0000FF)]
    const result = classifyRawPattern(packets)
    expect(result.rawValueHex).toBe('0x0000FF')
  })
})
