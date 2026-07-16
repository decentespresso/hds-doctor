import type { DebugPacket, RawPatternDiagnostic } from './types'

export function classifyRawPattern(packets: DebugPacket[]): RawPatternDiagnostic {
  if (packets.length === 0) {
    return { pattern: 'normal', rawValueHex: 'N/A', description: 'No data available' }
  }

  const firstRaw24 = toUnsigned24(packets[0].rawValue)
  const firstHex = toHex24(packets[0].rawValue)
  const allIdentical = packets.every(packet => toUnsigned24(packet.rawValue) === firstRaw24)

  if (allIdentical) {
    if (firstRaw24 === 0x7FFFFF && packets.some(packet => packet.dataOutOfRange)) {
      return {
        pattern: 'rail-positive',
        rawValueHex: firstHex,
        description: `ADC positive rail at ${firstHex} - dataOutOfRange is set`,
      }
    }

    if (firstRaw24 === 0x800000 && packets.some(packet => packet.dataOutOfRange)) {
      return {
        pattern: 'rail-negative',
        rawValueHex: firstHex,
        description: `ADC negative rail at ${firstHex} - dataOutOfRange is set`,
      }
    }

    return {
      pattern: 'stuck-constant',
      rawValueHex: firstHex,
      description: `ADC held at ${firstHex} without a rail classification`,
    }
  }

  const values = packets.map(packet => toUnsigned24(packet.rawValue))
  const range = Math.max(...values) - Math.min(...values)

  if (range < 10 && packets.length > 5) {
    return {
      pattern: 'low-variation',
      rawValueHex: firstHex,
      description: `Raw ADC variation is low at ${range} counts`,
    }
  }

  return {
    pattern: 'normal',
    rawValueHex: firstHex,
    description: 'Raw ADC values vary normally',
  }
}

function toHex24(value: number): string {
  return '0x' + toUnsigned24(value).toString(16).toUpperCase().padStart(6, '0')
}

function toUnsigned24(value: number): number {
  return value & 0xFFFFFF
}
