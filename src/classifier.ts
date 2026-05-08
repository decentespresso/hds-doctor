import type { DebugPacket, RawPatternDiagnostic } from './types'

/**
 * Classify ADC raw value pattern to aid differential diagnosis.
 *
 * The ADS1232 is a 24-bit ADC. Output is in two's complement:
 *   - +full-scale input → 0x7FFFFF (8_388_607)
 *   - -full-scale input → 0x800000 (−8_388_608)
 *
 * A truly stuck 0xFFFFFF (all-ones) or 0x000000 (all-zeros) indicates
 * the analog front-end is floating or shorted, not a valid conversion.
 *
 * Reference: [[HDS/nwd#5. Saturation vs midscale classifier]]
 */
export function classifyRawPattern(packets: DebugPacket[]): RawPatternDiagnostic {
  if (packets.length === 0) {
    return { pattern: 'responsive', rawValueHex: 'N/A', description: 'No data available' }
  }

  const firstRaw = packets[0].rawValue
  const firstHex = toHex24(firstRaw)

  // Check if all raw values are identical (pinned)
  const allIdentical = packets.every(p => p.rawValue === firstRaw)

  if (allIdentical) {
    if (firstRaw === 0xFFFFFF) {
      return {
        pattern: 'saturated-high',
        rawValueHex: firstHex,
        description: `ADC pinned at ${firstHex} — open differential, AINP > AINN bias. Likely cold solder joint on U21 (ADS1232), broken load cell cable, or lifted AINN trace. Try gentle flex near U21 first.`,
      }
    }
    if (firstRaw === 0x000000) {
      return {
        pattern: 'saturated-low',
        rawValueHex: firstHex,
        description: `ADC pinned at ${firstHex} — shorted input or AINP = AINN. Check for solder bridge across AINP/AINN pins, damaged load cell bridge, or broken VREF path.`,
      }
    }
    if (Math.abs(firstRaw - 0x800000) < 50000) {
      return {
        pattern: 'midscale-frozen',
        rawValueHex: firstHex,
        description: `ADC frozen near midscale (${firstHex}) — chip state-machine likely hung. Try hard reset (disconnect battery + USB for 5s).`,
      }
    }
    // Some other pinned value — unusual, flag as saturated
    return {
      pattern: 'saturated-high',
      rawValueHex: firstHex,
      description: `ADC pinned at ${firstHex} — unexpected stuck value. Possible ADS1232 internal fault.`,
    }
  }

  // Not pinned — check if it wanders but delta is suspiciously low
  const values = packets.map(p => p.rawValue)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min

  if (range < 10 && packets.length > 5) {
    return {
      pattern: 'wandering',
      rawValueHex: firstHex,
      description: `Raw values vary slightly (range ${range}) but do not respond to load. Possibly noisy/dead VREF — check U27 (REF5025) output.`,
    }
  }

  return {
    pattern: 'responsive',
    rawValueHex: firstHex,
    description: 'Raw ADC responding — no stuck pattern detected.',
  }
}

/** Format a signed 24-bit integer as a 6-character hex string */
function toHex24(value: number): string {
  // Mask to 24 bits, zero-pad to 6 hex digits
  const masked = value & 0xFFFFFF
  return '0x' + masked.toString(16).toUpperCase().padStart(6, '0')
}
