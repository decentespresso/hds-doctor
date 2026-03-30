import type { DebugPacket } from './types'

const HEADER_0 = 0x03
const HEADER_1 = 0x25
const PACKET_LENGTH = 41

export interface LedResponse {
  firmwareVersion: string  // e.g., "3.0.7"
  battery: number          // 0-100, or -1 if charging
}

export function decodeLedResponse(data: Uint8Array): LedResponse | null {
  if (data.length !== 7) return null
  if (data[0] !== 0x03 || data[1] !== 0x0A) return null

  const verHigh = data[5]
  const verLow = data[6]
  const major = ((verHigh >> 4) * 10) + (verHigh & 0x0F)
  const minor = (verLow >> 4)
  const patch = (verLow & 0x0F)

  const batteryByte = data[4]
  const battery = batteryByte === 0xFF ? -1 : batteryByte

  return {
    firmwareVersion: `${major}.${minor}.${patch}`,
    battery,
  }
}

export function compareFirmwareVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function computeChecksum(data: Uint8Array): number {
  let checksum = 0
  for (let i = 0; i < 40; i++) {
    checksum ^= data[i]
  }
  return checksum
}

export function decodeDebugPacket(data: Uint8Array): DebugPacket | null {
  if (data.length !== PACKET_LENGTH) return null
  if (data[0] !== HEADER_0 || data[1] !== HEADER_1) return null
  if (computeChecksum(data) !== data[40]) return null

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

  const flags = data[38]

  return {
    timestamp: view.getUint32(2),
    rawValue: view.getInt32(6),
    smoothedValue: view.getInt32(10),
    tareOffset: view.getInt32(14),
    conversionTime: view.getUint16(18) / 100,
    sps: view.getUint16(20) / 100,
    readIndex: data[22],
    samplesInUse: data[23],
    dataMin: view.getInt32(24),
    dataMax: view.getInt32(28),
    dataAvg: view.getInt32(32),
    dataStdDev: view.getUint16(36) / 10,
    dataOutOfRange: (flags & 0x01) !== 0,
    signalTimeout: (flags & 0x02) !== 0,
    tareInProgress: (flags & 0x04) !== 0,
    tareTimes: data[39],
  }
}
