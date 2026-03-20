import { describe, it, expect } from 'vitest'
import { generateReport, parseReport } from '../src/report'
import type { TestResult, Report } from '../src/types'

const mockResults: TestResult[] = [
  {
    testId: 'noise-stability',
    verdict: 'pass',
    summary: 'Avg std dev 4.2',
    rawPackets: [{
      timestamp: 1000, rawValue: 50000, smoothedValue: 49800,
      tareOffset: 100, conversionTime: 12.34, sps: 10.0,
      readIndex: 5, samplesInUse: 10, dataMin: 49500,
      dataMax: 50500, dataAvg: 50000, dataStdDev: 4.2,
      dataOutOfRange: false, signalTimeout: false,
      tareInProgress: false, tareTimes: 0,
    }],
  },
]

describe('generateReport', () => {
  it('produces valid JSON with required fields', () => {
    const json = generateReport(mockResults, 'pass', 'All good')
    const parsed = JSON.parse(json)
    expect(parsed.appVersion).toBeDefined()
    expect(parsed.timestamp).toBeDefined()
    expect(parsed.testsRun).toHaveLength(1)
    expect(parsed.overallVerdict).toBe('pass')
  })
})

describe('parseReport', () => {
  it('round-trips through generate and parse', () => {
    const json = generateReport(mockResults, 'pass', 'All good')
    const report = parseReport(json)
    expect(report).not.toBeNull()
    expect(report!.testsRun[0].testId).toBe('noise-stability')
    expect(report!.overallVerdict).toBe('pass')
  })

  it('returns null for invalid JSON', () => {
    expect(parseReport('not json')).toBeNull()
  })

  it('returns null for JSON missing required fields', () => {
    expect(parseReport('{"foo": "bar"}')).toBeNull()
  })
})
