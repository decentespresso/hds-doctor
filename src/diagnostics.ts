import type { DebugPacket, TestResult, Verdict } from './types'

export function evaluateNoiseStability(packets: DebugPacket[]): TestResult {
  // If firmware-reported std dev is all zero (1-sample mode), compute
  // standard deviation across raw values from individual packets instead.
  const fwStdDev = packets.reduce((sum, p) => sum + p.dataStdDev, 0) / packets.length
  const stdDev = fwStdDev > 0 ? fwStdDev : computeStdDev(packets.map(p => p.rawValue))

  let verdict: Verdict
  let summary: string

  if (stdDev < 25) {
    verdict = 'pass'
    summary = `Std dev ${stdDev.toFixed(1)} — excellent stability`
  } else if (stdDev <= 60) {
    verdict = 'warning'
    summary = `Std dev ${stdDev.toFixed(1)} — some noise detected, check connections`
  } else {
    verdict = 'fail'
    summary = `Std dev ${stdDev.toFixed(1)} — excessive noise, likely hardware issue`
  }

  return { testId: 'noise-stability', verdict, summary, rawPackets: packets }
}

function computeStdDev(values: number[]): number {
  if (values.length === 0) return 0
  const avg = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

export function evaluateConnectionHealth(packets: DebugPacket[]): TestResult {
  const timeoutCount = packets.filter(p => p.signalTimeout).length
  const oorCount = packets.filter(p => p.dataOutOfRange).length
  const flagRatio = (timeoutCount + oorCount) / packets.length
  const avgSps = packets.reduce((sum, p) => sum + p.sps, 0) / packets.length

  let verdict: Verdict
  let summary: string

  if (avgSps === 0 || flagRatio > 0.5) {
    verdict = 'fail'
    summary = avgSps === 0
      ? 'SPS is zero — ADC not responding'
      : `${Math.round(flagRatio * 100)}% of samples had errors`
  } else if (flagRatio > 0) {
    verdict = 'warning'
    summary = `${timeoutCount} timeouts, ${oorCount} out-of-range in ${packets.length} samples`
  } else {
    verdict = 'pass'
    summary = `No errors, SPS stable at ${avgSps.toFixed(1)}`
  }

  return { testId: 'connection-health', verdict, summary, rawPackets: packets }
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

  let verdict: Verdict
  let summary: string
  let overridable: boolean | undefined

  if (loadedVariance > 500) {
    verdict = 'fail'
    summary = `Erratic readings (variance ${Math.round(loadedVariance)}) — unstable connection`
  } else if (delta < 1000) {
    verdict = 'fail'
    summary = `ADC delta only ${Math.round(delta)} — load cell may be damaged or disconnected`
    overridable = true
  } else if (delta < 10000) {
    verdict = 'warning'
    summary = `ADC delta ${Math.round(delta)} — lower than expected, check load cell bond`
  } else {
    verdict = 'pass'
    summary = `ADC delta ${Math.round(delta)} — load cell responding normally`
  }

  const rawPackets = [...emptyPackets, ...loadedPackets]
  return { testId: 'load-cell-bond', verdict, summary, rawPackets, ...(overridable && { overridable }) }
}

export function evaluateDrift(packets: DebugPacket[]): TestResult {
  const offsets = packets.map(p => p.tareOffset)
  const min = Math.min(...offsets)
  const max = Math.max(...offsets)
  const range = max - min

  let verdict: Verdict
  let summary: string

  if (range < 5) {
    verdict = 'pass'
    summary = `Tare offset stable (range ${range})`
  } else if (range < 50) {
    verdict = 'warning'
    summary = `Some tare drift detected (range ${range})`
  } else {
    verdict = 'fail'
    summary = `Significant tare drift (range ${range})`
  }

  return { testId: 'drift', verdict, summary, rawPackets: packets }
}

export function overallVerdict(results: TestResult[]): Verdict {
  if (results.some(r => r.verdict === 'fail')) return 'fail'
  if (results.some(r => r.verdict === 'warning')) return 'warning'
  return 'pass'
}
