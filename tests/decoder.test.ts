import { describe, it, expect } from 'vitest'
import { decodeDebugPacket, computeChecksum, decodeLedResponse, compareFirmwareVersion } from '../src/decoder'

function buildPacket(overrides: Partial<Record<string, number>> = {}): Uint8Array {
  const buf = new ArrayBuffer(41)
  const view = new DataView(buf)
  const arr = new Uint8Array(buf)

  // Header
  arr[0] = 0x03
  arr[1] = 0x25

  // Timestamp: 1000ms
  view.setUint32(2, overrides.timestamp ?? 1000)
  // Raw value: 50000
  view.setInt32(6, overrides.rawValue ?? 50000)
  // Smoothed: 49800
  view.setInt32(10, overrides.smoothedValue ?? 49800)
  // Tare offset: 100
  view.setInt32(14, overrides.tareOffset ?? 100)
  // Conversion time: 1234 (= 12.34ms)
  view.setUint16(18, overrides.conversionTime ?? 1234)
  // SPS: 1000 (= 10.00)
  view.setUint16(20, overrides.sps ?? 1000)
  // Read index
  arr[22] = overrides.readIndex ?? 5
  // Samples in use
  arr[23] = overrides.samplesInUse ?? 10
  // Data min
  view.setInt32(24, overrides.dataMin ?? 49500)
  // Data max
  view.setInt32(28, overrides.dataMax ?? 50500)
  // Data avg
  view.setInt32(32, overrides.dataAvg ?? 50000)
  // Std dev: 42 (= 4.2)
  view.setUint16(36, overrides.dataStdDev ?? 42)
  // Flags: none
  arr[38] = overrides.flags ?? 0x00
  // Tare times
  arr[39] = overrides.tareTimes ?? 0

  // Compute checksum
  arr[40] = computeChecksum(arr)
  return arr
}

describe('computeChecksum', () => {
  it('XORs bytes 0 through 39', () => {
    const data = new Uint8Array(41).fill(0)
    data[0] = 0x03
    data[1] = 0x25
    expect(computeChecksum(data)).toBe(0x03 ^ 0x25)
  })
})

describe('decodeDebugPacket', () => {
  it('decodes a valid packet', () => {
    const packet = buildPacket()
    const result = decodeDebugPacket(packet)
    expect(result).not.toBeNull()
    expect(result!.timestamp).toBe(1000)
    expect(result!.rawValue).toBe(50000)
    expect(result!.smoothedValue).toBe(49800)
    expect(result!.tareOffset).toBe(100)
    expect(result!.conversionTime).toBeCloseTo(12.34)
    expect(result!.sps).toBeCloseTo(10.0)
    expect(result!.readIndex).toBe(5)
    expect(result!.samplesInUse).toBe(10)
    expect(result!.dataMin).toBe(49500)
    expect(result!.dataMax).toBe(50500)
    expect(result!.dataAvg).toBe(50000)
    expect(result!.dataStdDev).toBeCloseTo(4.2)
    expect(result!.dataOutOfRange).toBe(false)
    expect(result!.signalTimeout).toBe(false)
    expect(result!.tareInProgress).toBe(false)
    expect(result!.tareTimes).toBe(0)
  })

  it('returns null for wrong length', () => {
    expect(decodeDebugPacket(new Uint8Array(10))).toBeNull()
  })

  it('returns null for bad header', () => {
    const packet = buildPacket()
    packet[0] = 0xFF
    packet[40] = computeChecksum(packet)
    expect(decodeDebugPacket(packet)).toBeNull()
  })

  it('returns null for bad checksum', () => {
    const packet = buildPacket()
    packet[40] = 0xFF
    expect(decodeDebugPacket(packet)).toBeNull()
  })

  it('decodes flags correctly', () => {
    const packet = buildPacket({ flags: 0x07 })
    const result = decodeDebugPacket(packet)
    expect(result!.dataOutOfRange).toBe(true)
    expect(result!.signalTimeout).toBe(true)
    expect(result!.tareInProgress).toBe(true)
  })

  it('decodes negative raw values', () => {
    const packet = buildPacket({ rawValue: -12345 })
    const result = decodeDebugPacket(packet)
    expect(result!.rawValue).toBe(-12345)
  })
})

describe('decodeLedResponse', () => {
  it('decodes firmware version from BCD', () => {
    // FW 3.0.7: verHigh=0x03, verLow=0x07
    const data = new Uint8Array([0x03, 0x0A, 0x00, 0x00, 0x64, 0x03, 0x07])
    const result = decodeLedResponse(data)
    expect(result).not.toBeNull()
    expect(result!.firmwareVersion).toBe('3.0.7')
    expect(result!.battery).toBe(100)
  })

  it('detects charging state', () => {
    const data = new Uint8Array([0x03, 0x0A, 0x00, 0x00, 0xFF, 0x03, 0x07])
    const result = decodeLedResponse(data)
    expect(result!.battery).toBe(-1)
  })

  it('returns null for wrong header', () => {
    const data = new Uint8Array([0x03, 0x25, 0x00, 0x00, 0x00, 0x00, 0x00])
    expect(decodeLedResponse(data)).toBeNull()
  })

  it('returns null for wrong length', () => {
    expect(decodeLedResponse(new Uint8Array(5))).toBeNull()
  })
})

describe('compareFirmwareVersion', () => {
  it('returns 0 for equal versions', () => {
    expect(compareFirmwareVersion('3.0.7', '3.0.7')).toBe(0)
  })

  it('returns negative when a < b', () => {
    expect(compareFirmwareVersion('3.0.6', '3.0.7')).toBeLessThan(0)
  })

  it('returns positive when a > b', () => {
    expect(compareFirmwareVersion('3.1.0', '3.0.7')).toBeGreaterThan(0)
  })

  it('compares major version first', () => {
    expect(compareFirmwareVersion('2.9.9', '3.0.0')).toBeLessThan(0)
  })

  it('compares minor version second', () => {
    expect(compareFirmwareVersion('3.1.0', '3.0.9')).toBeGreaterThan(0)
  })
})
