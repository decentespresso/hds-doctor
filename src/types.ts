/** Decoded fields from a 41-byte ADS1232 debug packet */
export interface DebugPacket {
  timestamp: number       // ms, uint32
  rawValue: number        // int32, 24-bit ADC reading
  smoothedValue: number   // int32
  tareOffset: number      // int32
  conversionTime: number  // ms (float, decoded from uint16 * 0.01)
  sps: number             // samples/sec (float, decoded from uint16 * 0.01)
  readIndex: number       // uint8
  samplesInUse: number    // uint8
  dataMin: number         // int32
  dataMax: number         // int32
  dataAvg: number         // int32
  dataStdDev: number      // float (decoded from uint16 * 0.1)
  dataOutOfRange: boolean
  signalTimeout: boolean
  tareInProgress: boolean
  tareTimes: number       // uint8
}

export type Verdict = 'pass' | 'warning' | 'fail'

export interface TestResult {
  testId: string
  verdict: Verdict
  summary: string
  rawPackets: DebugPacket[]
  overridable?: boolean
}

export interface Report {
  appVersion: string
  timestamp: string        // ISO 8601
  deviceInfo?: { firmwareVersion?: string; battery?: number }
  testsRun: TestResult[]
  overallVerdict: Verdict
  overallSummary: string
}

export type TestId = 'noise-stability' | 'load-cell-bond' | 'drift' | 'connection-health'

/** Definition of a guided test */
export interface TestDefinition {
  id: TestId
  name: string
  description: string
  durationEstimate: string
  pollIntervalMs: number
  collectionDurationMs: number
}
