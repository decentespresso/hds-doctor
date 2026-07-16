import type { DebugPacket, TestResult, Verdict } from './types'
import { classifyRawPattern } from './classifier'

export function evaluateNoiseStability(packets: DebugPacket[]): TestResult {
  const stdDev = computeStdDev(packets.map(p => p.rawValue))

  // Classify raw ADC pattern for differential diagnosis
  const rawDiagnostic = classifyRawPattern(packets)

  let verdict: Verdict
  let summary: string

  if (stdDev < 25) {
    verdict = 'pass'
    // If pattern is saturated (pinned to rail), override — indicates open/short hardware fault
    if (rawDiagnostic.pattern === 'saturated-high' || rawDiagnostic.pattern === 'saturated-low') {
      verdict = 'warning'
      summary = `Low noise (${stdDev.toFixed(1)}) but ADC appears stuck at ${rawDiagnostic.rawValueHex} — may indicate disconnected load cell, cold joint, or dead VREF`
    } else {
      summary = `Noise level ${stdDev.toFixed(1)} — excellent stability`
    }
  } else if (stdDev <= 60) {
    verdict = 'warning'
    summary = `Noise level ${stdDev.toFixed(1)} — some noise detected, check connections`
  } else {
    verdict = 'fail'
    summary = `Noise level ${stdDev.toFixed(1)} — excessive noise, likely hardware issue`
  }

  const overridable = verdict === 'fail' ? true : undefined
  return { testId: 'noise-stability', verdict, summary, rawPackets: packets, ...(overridable && { overridable }), rawPatternDiagnostic: rawDiagnostic }
}

function computeStdDev(values: number[]): number {
  if (values.length === 0) return 0
  const avg = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function uint32Delta(start: number, end: number): number {
  return (end - start) >>> 0
}

function percentile(sortedValues: number[], fraction: number): number {
  const position = (sortedValues.length - 1) * fraction
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sortedValues[lower]
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower)
}

function requiredSequenceProgress(requestedDurationMs: number): number {
  return Math.max(2, Math.ceil(requestedDurationMs / 1000))
}

export function hasFreshConversionProgress(
  packets: DebugPacket[],
  requestedDurationMs = 0
): boolean {
  if (packets.length < 2 || packets.some(packet => packet.protocolVersion < 1)) return false

  const first = packets[0]
  const last = packets[packets.length - 1]
  const sequences = packets.map(packet => packet.conversionSequence)
  const minimumProgress = requiredSequenceProgress(requestedDurationMs)
  const timestampThreshold = requestedDurationMs > 0
    ? Math.floor(requestedDurationMs * 0.8)
    : 1

  return new Set(sequences).size >= minimumProgress
    && uint32Delta(first.conversionSequence, last.conversionSequence) >= minimumProgress - 1
    && uint32Delta(first.lastConversionTimestamp, last.lastConversionTimestamp) >= timestampThreshold
}

export function evaluateConnectionHealth(
  packets: DebugPacket[],
  requestedDurationMs = 0
): TestResult {
  if (packets.length === 0) {
    return {
      testId: 'connection-health',
      verdict: 'fail',
      summary: 'No valid debug packets collected - freshness cannot be verified',
      rawPackets: packets,
    }
  }

  if (packets.some(packet => packet.protocolVersion < 1)) {
    return {
      testId: 'connection-health',
      verdict: 'fail',
      summary: 'Freshness metadata unavailable - update scale firmware',
      rawPackets: packets,
    }
  }

  const timeoutCount = packets.filter(p => p.signalTimeout).length
  const oorCount = packets.filter(p => p.dataOutOfRange).length
  const errorPacketCount = packets.filter(p => p.signalTimeout || p.dataOutOfRange).length
  const errorPacketRatio = errorPacketCount / packets.length
  const zeroSpsCount = packets.filter(p => p.sps === 0).length
  const zeroSpsRatio = zeroSpsCount / packets.length
  const sortedSps = packets.map(p => p.sps).sort((a, b) => a - b)
  const minSps = sortedSps[0]
  const medianSps = percentile(sortedSps, 0.5)
  const lowerPercentileSps = percentile(sortedSps, 0.1)
  const noProgressCount = packets.slice(1).filter((packet, index) =>
    uint32Delta(packets[index].conversionSequence, packet.conversionSequence) === 0
  ).length
  const noProgressRatio = packets.length < 2 ? 1 : noProgressCount / (packets.length - 1)
  const stats = `SPS min ${minSps.toFixed(1)}, median ${medianSps.toFixed(1)}, p10 ${lowerPercentileSps.toFixed(1)}`
  const freshProgress = hasFreshConversionProgress(packets, requestedDurationMs)

  let verdict: Verdict
  let summary: string

  if (!freshProgress) {
    verdict = 'fail'
    summary = `Insufficient fresh conversion progress - ${stats}`
  } else if (errorPacketRatio > 0.5 || zeroSpsRatio > 0.5 || noProgressRatio > 0.5) {
    verdict = 'fail'
    summary = `${Math.round(Math.max(errorPacketRatio, zeroSpsRatio, noProgressRatio) * 100)}% of readings failed connection-health checks - ${stats}`
  } else if (errorPacketRatio > 0 || zeroSpsRatio >= 0.2 || noProgressRatio >= 0.2 || lowerPercentileSps === 0) {
    verdict = 'warning'
    summary = `${timeoutCount} timeouts, ${oorCount} out-of-range, ${zeroSpsCount} zero-SPS readings - ${stats}`
  } else {
    verdict = 'pass'
    summary = `Connection healthy - ${stats}`
  }

  const overridable = verdict === 'fail' ? true : undefined
  return { testId: 'connection-health', verdict, summary, rawPackets: packets, ...(overridable && { overridable }) }
}

export function evaluateLoadCellBond(
  emptyPackets: DebugPacket[],
  loadedPackets: DebugPacket[]
): TestResult {
  const emptyAvg = emptyPackets.reduce((s, p) => s + p.smoothedValue, 0) / emptyPackets.length
  const loadedAvg = loadedPackets.reduce((s, p) => s + p.smoothedValue, 0) / loadedPackets.length
  const delta = Math.abs(loadedAvg - emptyAvg)

  const loadedValues = loadedPackets.map(p => p.smoothedValue)
  const loadedVariance = loadedValues.reduce((s, v) => s + (v - loadedAvg) ** 2, 0) / loadedValues.length

  // Classify raw ADC pattern for differential diagnosis
  const rawPackets = [...emptyPackets, ...loadedPackets]
  const rawDiagnostic = classifyRawPattern(rawPackets)

  let verdict: Verdict
  let summary: string
  let overridable: boolean | undefined

  if (loadedVariance > 500) {
    verdict = 'fail'
    summary = `Erratic readings — unstable connection`
    overridable = true
  } else if (delta < 1000) {
    verdict = 'fail'
    summary = `Weight response only ${Math.round(delta)} counts — load cell may be damaged or disconnected`
    overridable = true
  } else if (delta < 10000) {
    verdict = 'warning'
    summary = `Weight response ${Math.round(delta)} counts — lower than expected, check load cell bond`
  } else {
    verdict = 'pass'
    summary = `Weight response ${Math.round(delta)} counts — load cell responding normally`
  }

  return { testId: 'load-cell-bond', verdict, summary, rawPackets, ...(overridable && { overridable }), rawPatternDiagnostic: rawDiagnostic }
}

export function evaluateDrift(packets: DebugPacket[]): TestResult {
  const values = packets.map(p => p.smoothedValue)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min

  let verdict: Verdict
  let summary: string

  if (range < 5) {
    verdict = 'pass'
    summary = `Readings stable (drift range ${range})`
  } else if (range < 50) {
    verdict = 'warning'
    summary = `Some drift detected (range ${range})`
  } else {
    verdict = 'fail'
    summary = `Significant drift (range ${range})`
  }

  const overridable = verdict === 'fail' ? true : undefined
  return { testId: 'drift', verdict, summary, rawPackets: packets, ...(overridable && { overridable }) }
}

export function overallVerdict(results: TestResult[]): Verdict {
  if (results.some(r => r.verdict === 'fail')) return 'fail'
  if (results.some(r => r.verdict === 'warning')) return 'warning'
  return 'pass'
}
