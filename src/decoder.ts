import type { DebugPacket } from './types'

const HEADER_0 = 0x03
const HEADER_1 = 0x25
const PACKET_LENGTH = 41

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
