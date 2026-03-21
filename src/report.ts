import type { TestResult, Report, Verdict } from './types'

const APP_VERSION = '1.0.0'

export function generateReport(
  testsRun: TestResult[],
  overallVerdict: Verdict,
  overallSummary: string,
  deviceInfo?: { firmwareVersion?: string; battery?: number },
): string {
  const report: Report = {
    appVersion: APP_VERSION,
    timestamp: new Date().toISOString(),
    ...(deviceInfo && { deviceInfo }),
    testsRun,
    overallVerdict,
    overallSummary,
  }
  return JSON.stringify(report, null, 2)
}

export function parseReport(json: string): Report | null {
  try {
    const obj = JSON.parse(json)
    if (!obj.appVersion || !obj.timestamp || !Array.isArray(obj.testsRun) ||
        !obj.overallVerdict || !obj.overallSummary) {
      return null
    }
    return obj as Report
  } catch {
    return null
  }
}

export function downloadReport(json: string, filename?: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `hds-doctor-report-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function loadReportFromFile(): Promise<Report | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) { resolve(null); return }
      const text = await file.text()
      resolve(parseReport(text))
    }
    input.click()
  })
}
