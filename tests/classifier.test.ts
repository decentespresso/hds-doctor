import { describe, it, expect } from 'vitest'
import { classifyRawPattern } from '../src/classifier'
import type { DebugPacket } from '../src/types'

function pkt(rawValue: number, dataOutOfRange = false): DebugPacket {
  return {
    timestamp: 1000, rawValue, smoothedValue: rawValue,
    tareOffset: 100, conversionTime: 12.34, sps: 10.0,
    readIndex: 5, samplesInUse: 10,
    resetReason: 0,
    dataOutOfRange, signalTimeout: false,
    tareInProgress: false, tareTimes: 0,
  }
}

describe('classifyRawPattern', () => {
  it('classifies the positive rail when dataOutOfRange is set', () => {
    const result = classifyRawPattern([pkt(0x7FFFFF, true), pkt(0x7FFFFF, true)])
    expect(result.pattern).toBe('rail-positive')
    expect(result.rawValueHex).toBe('0x7FFFFF')
  })

  it('classifies sign-extended negative rail values', () => {
    const result = classifyRawPattern([pkt(-0x800000, true), pkt(0x800000, true)])
    expect(result.pattern).toBe('rail-negative')
    expect(result.rawValueHex).toBe('0x800000')
  })

  it('does not call rail codes saturated without the range flag', () => {
    const result = classifyRawPattern([pkt(0x7FFFFF), pkt(0x7FFFFF)])
    expect(result.pattern).toBe('stuck-constant')
  })

  it('classifies -1 as a stuck constant rather than a rail', () => {
    const result = classifyRawPattern([pkt(-1), pkt(-1)])
    expect(result.pattern).toBe('stuck-constant')
    expect(result.rawValueHex).toBe('0xFFFFFF')
  })

  it('classifies zero as a stuck constant', () => {
    expect(classifyRawPattern([pkt(0), pkt(0)]).pattern).toBe('stuck-constant')
  })

  it('classifies other constant non-rail values as stuck constants', () => {
    expect(classifyRawPattern([pkt(0x123456), pkt(0x123456)]).pattern).toBe('stuck-constant')
  })

  it('detects low variation', () => {
    const packets = [
      pkt(0x800100), pkt(0x800101), pkt(0x800102),
      pkt(0x800100), pkt(0x800103), pkt(0x800101),
    ]
    expect(classifyRawPattern(packets).pattern).toBe('low-variation')
  })

  it('returns normal for varying values', () => {
    const packets = [
      pkt(50000), pkt(50100), pkt(49900),
      pkt(50200), pkt(49800), pkt(50150),
    ]
    expect(classifyRawPattern(packets).pattern).toBe('normal')
  })

  it('returns normal for an empty packet array', () => {
    const result = classifyRawPattern([])
    expect(result.pattern).toBe('normal')
    expect(result.rawValueHex).toBe('N/A')
  })
})
