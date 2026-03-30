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
    summary = `Noise level ${stdDev.toFixed(1)} — excellent stability`
  } else if (stdDev <= 60) {
    verdict = 'warning'
    summary = `Noise level ${stdDev.toFixed(1)} — some noise detected, check connections`
  } else {
    verdict = 'fail'
    summary = `Noise level ${stdDev.toFixed(1)} — excessive noise, likely hardware issue`
  }

  const overridable = verdict === 'fail' ? true : undefined
  return { testId: 'noise-stability', verdict, summary, rawPackets: packets, ...(overridable && { overridable }) }
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
      ? 'No data received — sensor not responding'
      : `${Math.round(flagRatio * 100)}% of readings had errors`
  } else if (flagRatio > 0) {
    verdict = 'warning'
    summary = `${timeoutCount} timeouts, ${oorCount} out-of-range in ${packets.length} readings`
  } else {
    verdict = 'pass'
    summary = `No errors, sampling rate stable at ${avgSps.toFixed(1)}/s`
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

  const rawPackets = [...emptyPackets, ...loadedPackets]
  return { testId: 'load-cell-bond', verdict, summary, rawPackets, ...(overridable && { overridable }) }
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
