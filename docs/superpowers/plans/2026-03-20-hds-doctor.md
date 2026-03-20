# HDS Doctor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page web app that connects to a Half Decent Scale via USB, decodes ADS1232 debug packets, and diagnoses load cell / amplifier health through quick checks, guided tests, and live monitoring.

**Architecture:** Vite + vanilla TypeScript, no framework. Modules communicate through typed interfaces. The UI is DOM-based with view switching. Serial communication uses the Web Serial API in poll mode.

**Tech Stack:** Vite, TypeScript, vite-plugin-mkcert (HTTPS dev), Web Serial API

**Spec:** `docs/superpowers/specs/2026-03-20-hds-doctor-design.md`

**Reference projects:**
- `../hds-update/` — CSS patterns, serial connection approach
- `../openscale/tools/decode_ads_debug.py` — packet decoding reference implementation

---

## File Structure

```
hds-doctor/
├── index.html                  # Single HTML entry point
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.ts                 # App init, mode switching, module wiring
│   ├── serial.ts               # Web Serial connection, command sending, byte buffering
│   ├── decoder.ts              # 41-byte debug packet parsing + checksum validation
│   ├── types.ts                # Shared types: DebugPacket, Verdict, TestResult, Report
│   ├── diagnostics.ts          # Threshold evaluation, verdict production
│   ├── guided.ts               # Wizard state machine: test definitions, step sequencing
│   ├── report.ts               # JSON export/import, report data structures
│   ├── ui.ts                   # DOM helpers, view switching, chart rendering
│   └── style.css               # App styles (Decent Espresso visual language)
├── tests/
│   ├── decoder.test.ts         # Packet decoding + checksum tests
│   ├── diagnostics.test.ts     # Threshold evaluation tests
│   ├── guided.test.ts          # Wizard state machine tests
│   └── report.test.ts          # JSON export/import round-trip tests
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/style.css`

- [ ] **Step 1: Initialize package.json**

```bash
cd /Users/vid/development/repos/hds-doctor
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install --save-dev vite typescript vite-plugin-mkcert
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "."
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import mkcert from 'vite-plugin-mkcert'

export default defineConfig({
  plugins: [mkcert()],
  server: {
    https: true,
  },
})
```

- [ ] **Step 5: Create index.html**

Minimal HTML shell with the Decent CSS imports and app mount point. Reference `../hds-update/index.html` for the CSS links:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HDS Doctor</title>
    <link rel="stylesheet" href="https://fast.decentespresso.com/css/skel.css" />
    <link rel="stylesheet" href="https://fast.decentespresso.com/css/style.css" />
    <link rel="stylesheet" href="/src/style.css" />
</head>
<body>
    <!-- Connection bar -->
    <div id="connection-bar">
        <div id="status-indicator" class="status-dot disconnected"></div>
        <span id="status-text">No device connected</span>
        <button id="connect-btn">Connect</button>
    </div>

    <!-- Content area -->
    <div id="app" class="page-container">
        <!-- Views injected by ui.ts -->
    </div>

    <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 6: Create src/style.css**

Core styles matching hds-update visual language. Dark connection bar, cyan accent (#47cdd9), status colors, mode cards, page container:

```css
/* Connection bar */
#connection-bar {
    background: #1a1a2e;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid #333;
}

.status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
}
.status-dot.disconnected { background: #ff6b6b; }
.status-dot.connected { background: #51cf66; }

#status-text {
    color: #999;
    font-size: 13px;
    font-family: monospace;
}

#connect-btn {
    margin-left: auto;
    padding: 4px 12px;
    font-size: 12px;
    background: #47cdd9;
    color: #000;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

/* Page container */
.page-container {
    max-width: 900px;
    margin: 0 auto;
    padding: 2em;
}

/* Mode cards */
.mode-cards {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
    padding: 24px 0;
}

.mode-card {
    background: #1a1a2e;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 20px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.2s;
}
.mode-card:hover { border-color: #47cdd9; }

.mode-card-icon { font-size: 28px; margin-bottom: 8px; }
.mode-card-title { color: #eee; font-size: 14px; font-weight: 600; margin-bottom: 4px; }
.mode-card-desc { color: #888; font-size: 12px; }

/* Verdicts */
.verdict-pass { color: #51cf66; }
.verdict-warning { color: #ffd43b; }
.verdict-fail { color: #ff6b6b; }

/* Hidden utility */
.hidden { display: none; }

/* Back button */
.back-btn {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    font-size: 13px;
    padding: 8px 0;
    margin-bottom: 16px;
}
.back-btn:hover { color: #eee; }
```

- [ ] **Step 7: Create src/main.ts**

Minimal entry point that logs to console:

```typescript
console.log('HDS Doctor loaded')
```

- [ ] **Step 8: Verify dev server starts with HTTPS**

```bash
npx vite --host
```

Expected: Vite serves at `https://localhost:5173` with a valid local cert. Page shows connection bar and empty content area.

- [ ] **Step 9: Add dev/build scripts to package.json**

Add to `scripts`:
```json
{
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview"
}
```

- [ ] **Step 10: Commit**

```bash
git init
echo "node_modules\ndist\n.superpowers" > .gitignore
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src/ .gitignore
git commit -m "feat: scaffold Vite + TypeScript project with HTTPS dev server"
```

---

### Task 2: Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Define shared types**

```typescript
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
}

export interface Report {
  appVersion: string
  timestamp: string        // ISO 8601
  deviceInfo?: { mac?: string; chip?: string }
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
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared type definitions for debug packets, verdicts, and reports"
```

---

### Task 3: Packet Decoder

**Files:**
- Create: `src/decoder.ts`, `tests/decoder.test.ts`

Reference: `../openscale/tools/decode_ads_debug.py` — port the decode logic to TypeScript with DataView for big-endian reads.

- [ ] **Step 1: Install vitest**

```bash
npm install --save-dev vitest
```

Add to `package.json` scripts: `"test": "vitest run", "test:watch": "vitest"`

- [ ] **Step 2: Write decoder tests**

Create `tests/decoder.test.ts`. Build a valid 41-byte packet by hand (use the Python decoder as reference for field offsets), then test:

```typescript
import { describe, it, expect } from 'vitest'
import { decodeDebugPacket, computeChecksum } from '../src/decoder'

function buildPacket(overrides: Partial<Record<string, number>> = {}): Uint8Array {
  const buf = new ArrayBuffer(41)
  const view = new DataView(buf)
  const arr = new Uint8Array(buf)

  // Header
  arr[0] = 0x03
  arr[1] = 0x25

  // Timestamp: 1000ms
  view.setUint32(2, overrides.timestamp ?? 1000)
  // Raw value: 50000
  view.setInt32(6, overrides.rawValue ?? 50000)
  // Smoothed: 49800
  view.setInt32(10, overrides.smoothedValue ?? 49800)
  // Tare offset: 100
  view.setInt32(14, overrides.tareOffset ?? 100)
  // Conversion time: 1234 (= 12.34ms)
  view.setUint16(18, overrides.conversionTime ?? 1234)
  // SPS: 1000 (= 10.00)
  view.setUint16(20, overrides.sps ?? 1000)
  // Read index
  arr[22] = overrides.readIndex ?? 5
  // Samples in use
  arr[23] = overrides.samplesInUse ?? 10
  // Data min
  view.setInt32(24, overrides.dataMin ?? 49500)
  // Data max
  view.setInt32(28, overrides.dataMax ?? 50500)
  // Data avg
  view.setInt32(32, overrides.dataAvg ?? 50000)
  // Std dev: 42 (= 4.2)
  view.setUint16(36, overrides.dataStdDev ?? 42)
  // Flags: none
  arr[38] = overrides.flags ?? 0x00
  // Tare times
  arr[39] = overrides.tareTimes ?? 0

  // Compute checksum
  arr[40] = computeChecksum(arr)
  return arr
}

describe('computeChecksum', () => {
  it('XORs bytes 0 through 39', () => {
    const data = new Uint8Array(41).fill(0)
    data[0] = 0x03
    data[1] = 0x25
    expect(computeChecksum(data)).toBe(0x03 ^ 0x25)
  })
})

describe('decodeDebugPacket', () => {
  it('decodes a valid packet', () => {
    const packet = buildPacket()
    const result = decodeDebugPacket(packet)
    expect(result).not.toBeNull()
    expect(result!.timestamp).toBe(1000)
    expect(result!.rawValue).toBe(50000)
    expect(result!.smoothedValue).toBe(49800)
    expect(result!.tareOffset).toBe(100)
    expect(result!.conversionTime).toBeCloseTo(12.34)
    expect(result!.sps).toBeCloseTo(10.0)
    expect(result!.readIndex).toBe(5)
    expect(result!.samplesInUse).toBe(10)
    expect(result!.dataMin).toBe(49500)
    expect(result!.dataMax).toBe(50500)
    expect(result!.dataAvg).toBe(50000)
    expect(result!.dataStdDev).toBeCloseTo(4.2)
    expect(result!.dataOutOfRange).toBe(false)
    expect(result!.signalTimeout).toBe(false)
    expect(result!.tareInProgress).toBe(false)
    expect(result!.tareTimes).toBe(0)
  })

  it('returns null for wrong length', () => {
    expect(decodeDebugPacket(new Uint8Array(10))).toBeNull()
  })

  it('returns null for bad header', () => {
    const packet = buildPacket()
    packet[0] = 0xFF
    packet[40] = computeChecksum(packet) // fix checksum for new header
    // Still fails because header is wrong
    expect(decodeDebugPacket(packet)).toBeNull()
  })

  it('returns null for bad checksum', () => {
    const packet = buildPacket()
    packet[40] = 0xFF // corrupt checksum
    expect(decodeDebugPacket(packet)).toBeNull()
  })

  it('decodes flags correctly', () => {
    const packet = buildPacket({ flags: 0x07 })
    const result = decodeDebugPacket(packet)
    expect(result!.dataOutOfRange).toBe(true)
    expect(result!.signalTimeout).toBe(true)
    expect(result!.tareInProgress).toBe(true)
  })

  it('decodes negative raw values', () => {
    const packet = buildPacket({ rawValue: -12345 })
    const result = decodeDebugPacket(packet)
    expect(result!.rawValue).toBe(-12345)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/decoder.test.ts
```

Expected: FAIL — `decoder.ts` does not exist yet.

- [ ] **Step 4: Implement decoder**

Create `src/decoder.ts`:

```typescript
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
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/decoder.test.ts
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/decoder.ts tests/decoder.test.ts package.json package-lock.json
git commit -m "feat: implement ADS1232 debug packet decoder with tests"
```

---

### Task 4: Serial Communication

**Files:**
- Create: `src/serial.ts`

No unit tests for this module — it wraps the Web Serial API which requires a browser. Tested manually via the dev server.

- [ ] **Step 1: Implement serial module**

Create `src/serial.ts`. Exports a singleton-style object (matching hds-update patterns) with connect, disconnect, sendCommand, and poll methods:

```typescript
import { decodeDebugPacket } from './decoder'
import type { DebugPacket } from './types'

const BAUD_RATE = 115200
const DEBUG_REQUEST: Uint8Array = new Uint8Array([0x03, 0x25, 0x02, 0x24])

type PacketCallback = (packet: DebugPacket) => void
type StatusCallback = (connected: boolean) => void

export const Serial = {
  port: null as SerialPort | null,
  reader: null as ReadableStreamDefaultReader<Uint8Array> | null,
  writer: null as WritableStreamDefaultWriter<Uint8Array> | null,
  buffer: new Uint8Array(0),
  pollTimer: null as ReturnType<typeof setInterval> | null,
  onPacket: null as PacketCallback | null,
  onStatus: null as StatusCallback | null,
  reading: false,

  async connect(): Promise<boolean> {
    try {
      this.port = await navigator.serial.requestPort()
      await this.port.open({ baudRate: BAUD_RATE })
      this.writer = this.port.writable!.getWriter()
      this.startReading()
      this.onStatus?.(true)
      return true
    } catch (e) {
      console.error('Connection failed:', e)
      return false
    }
  },

  async disconnect(): Promise<void> {
    this.stopPolling()
    this.reading = false
    try {
      this.reader?.cancel()
      this.reader?.releaseLock()
      this.writer?.releaseLock()
      await this.port?.close()
    } catch (e) {
      console.error('Disconnect error:', e)
    }
    this.port = null
    this.reader = null
    this.writer = null
    this.buffer = new Uint8Array(0)
    this.onStatus?.(false)
  },

  startReading(): void {
    if (!this.port?.readable) return
    this.reading = true
    this.reader = this.port.readable.getReader()
    const readLoop = async () => {
      try {
        while (this.reading) {
          const { value, done } = await this.reader!.read()
          if (done || !this.reading) break
          if (value) this.processBytes(value)
        }
      } catch (e) {
        if (this.reading) console.error('Read error:', e)
      }
    }
    readLoop()
  },

  processBytes(incoming: Uint8Array): void {
    // Append to buffer
    const combined = new Uint8Array(this.buffer.length + incoming.length)
    combined.set(this.buffer)
    combined.set(incoming, this.buffer.length)
    this.buffer = combined

    // Scan for complete packets (header 0x03 0x25, length 41)
    while (this.buffer.length >= 41) {
      const headerIdx = this.findHeader(this.buffer)
      if (headerIdx === -1) {
        // No header found, keep last byte (might be start of header)
        this.buffer = this.buffer.slice(Math.max(0, this.buffer.length - 1))
        break
      }
      if (headerIdx > 0) {
        // Discard bytes before header
        this.buffer = this.buffer.slice(headerIdx)
      }
      if (this.buffer.length < 41) break

      const packetBytes = this.buffer.slice(0, 41)
      const packet = decodeDebugPacket(packetBytes)
      if (packet) {
        this.onPacket?.(packet)
        this.buffer = this.buffer.slice(41)
      } else {
        // Bad packet, skip this header and look for next
        this.buffer = this.buffer.slice(1)
      }
    }
  },

  findHeader(data: Uint8Array): number {
    for (let i = 0; i <= data.length - 2; i++) {
      if (data[i] === 0x03 && data[i + 1] === 0x25) return i
    }
    return -1
  },

  async requestDebug(): Promise<void> {
    if (!this.writer) return
    await this.writer.write(DEBUG_REQUEST)
  },

  startPolling(intervalMs: number): void {
    this.stopPolling()
    this.requestDebug() // immediate first request
    this.pollTimer = setInterval(() => this.requestDebug(), intervalMs)
  },

  stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add src/serial.ts
git commit -m "feat: implement Web Serial connection and poll-based debug requests"
```

---

### Task 5: Diagnostics Engine

**Files:**
- Create: `src/diagnostics.ts`, `tests/diagnostics.test.ts`

- [ ] **Step 1: Write diagnostics tests**

Create `tests/diagnostics.test.ts`. Test each diagnostic function with packet arrays that should produce known verdicts:

```typescript
import { describe, it, expect } from 'vitest'
import { evaluateNoiseStability, evaluateConnectionHealth, evaluateLoadCellBond, evaluateDrift, overallVerdict } from '../src/diagnostics'
import type { DebugPacket, TestResult } from '../src/types'

function makePacket(overrides: Partial<DebugPacket> = {}): DebugPacket {
  return {
    timestamp: 1000, rawValue: 50000, smoothedValue: 49800,
    tareOffset: 100, conversionTime: 12.34, sps: 10.0,
    readIndex: 5, samplesInUse: 10,
    dataMin: 49500, dataMax: 50500, dataAvg: 50000,
    dataStdDev: 4.2, dataOutOfRange: false, signalTimeout: false,
    tareInProgress: false, tareTimes: 0,
    ...overrides,
  }
}

describe('evaluateNoiseStability', () => {
  it('passes with low std dev', () => {
    const packets = Array.from({ length: 10 }, () => makePacket({ dataStdDev: 5 }))
    const result = evaluateNoiseStability(packets)
    expect(result.verdict).toBe('pass')
  })

  it('warns with moderate std dev', () => {
    const packets = Array.from({ length: 10 }, () => makePacket({ dataStdDev: 30 }))
    const result = evaluateNoiseStability(packets)
    expect(result.verdict).toBe('warning')
  })

  it('fails with high std dev', () => {
    const packets = Array.from({ length: 10 }, () => makePacket({ dataStdDev: 100 }))
    const result = evaluateNoiseStability(packets)
    expect(result.verdict).toBe('fail')
  })
})

describe('evaluateConnectionHealth', () => {
  it('passes with no flags and stable SPS', () => {
    const packets = Array.from({ length: 10 }, () => makePacket())
    const result = evaluateConnectionHealth(packets)
    expect(result.verdict).toBe('pass')
  })

  it('fails with persistent timeouts', () => {
    const packets = Array.from({ length: 10 }, () => makePacket({ signalTimeout: true }))
    const result = evaluateConnectionHealth(packets)
    expect(result.verdict).toBe('fail')
  })

  it('warns with occasional flags', () => {
    const packets = Array.from({ length: 10 }, (_, i) =>
      makePacket({ signalTimeout: i === 3 })
    )
    const result = evaluateConnectionHealth(packets)
    expect(result.verdict).toBe('warning')
  })
})

describe('evaluateLoadCellBond', () => {
  it('passes with large ADC delta', () => {
    const empty = Array.from({ length: 5 }, () => makePacket({ smoothedValue: 1000 }))
    const loaded = Array.from({ length: 5 }, () => makePacket({ smoothedValue: 50000 }))
    const result = evaluateLoadCellBond(empty, loaded)
    expect(result.verdict).toBe('pass')
  })

  it('fails with no delta', () => {
    const empty = Array.from({ length: 5 }, () => makePacket({ smoothedValue: 1000 }))
    const loaded = Array.from({ length: 5 }, () => makePacket({ smoothedValue: 1050 }))
    const result = evaluateLoadCellBond(empty, loaded)
    expect(result.verdict).toBe('fail')
  })
})

describe('evaluateDrift', () => {
  it('passes with stable tare offset', () => {
    const packets = Array.from({ length: 30 }, () => makePacket({ tareOffset: 100 }))
    const result = evaluateDrift(packets)
    expect(result.verdict).toBe('pass')
  })

  it('fails with large tare variance', () => {
    const packets = Array.from({ length: 30 }, (_, i) =>
      makePacket({ tareOffset: 100 + (i * 50) })
    )
    const result = evaluateDrift(packets)
    expect(result.verdict).toBe('fail')
  })
})

describe('overallVerdict', () => {
  it('returns worst verdict', () => {
    const results: TestResult[] = [
      { testId: 'noise-stability', verdict: 'pass', summary: '', rawPackets: [] },
      { testId: 'connection-health', verdict: 'fail', summary: '', rawPackets: [] },
    ]
    expect(overallVerdict(results)).toBe('fail')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/diagnostics.test.ts
```

Expected: FAIL — module not implemented.

- [ ] **Step 3: Implement diagnostics**

Create `src/diagnostics.ts`:

```typescript
import type { DebugPacket, TestResult, Verdict } from './types'

export function evaluateNoiseStability(packets: DebugPacket[]): TestResult {
  const avgStdDev = packets.reduce((sum, p) => sum + p.dataStdDev, 0) / packets.length
  let verdict: Verdict
  let summary: string

  if (avgStdDev < 10) {
    verdict = 'pass'
    summary = `Avg std dev ${avgStdDev.toFixed(1)} — excellent stability`
  } else if (avgStdDev <= 50) {
    verdict = 'warning'
    summary = `Avg std dev ${avgStdDev.toFixed(1)} — some noise detected, check connections`
  } else {
    verdict = 'fail'
    summary = `Avg std dev ${avgStdDev.toFixed(1)} — excessive noise, likely hardware issue`
  }

  return { testId: 'noise-stability', verdict, summary, rawPackets: packets }
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

  // Check for erratic readings in loaded state
  const loadedValues = loadedPackets.map(p => p.smoothedValue)
  const loadedVariance = loadedValues.reduce((s, v) => s + (v - loadedAvg) ** 2, 0) / loadedValues.length

  let verdict: Verdict
  let summary: string

  if (delta < 1000 || loadedVariance > 500) {
    verdict = 'fail'
    summary = delta < 1000
      ? `ADC delta only ${Math.round(delta)} — load cell may be damaged or disconnected`
      : `Erratic readings (variance ${Math.round(loadedVariance)}) — unstable connection`
  } else if (delta < 10000) {
    verdict = 'warning'
    summary = `ADC delta ${Math.round(delta)} — lower than expected, check load cell bond`
  } else {
    verdict = 'pass'
    summary = `ADC delta ${Math.round(delta)} — load cell responding normally`
  }

  const rawPackets = [...emptyPackets, ...loadedPackets]
  return { testId: 'load-cell-bond', verdict, summary, rawPackets }
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/diagnostics.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diagnostics.ts tests/diagnostics.test.ts
git commit -m "feat: implement diagnostics engine with threshold-based verdicts"
```

---

### Task 6: Report Module

**Files:**
- Create: `src/report.ts`, `tests/report.test.ts`

- [ ] **Step 1: Write report tests**

Create `tests/report.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/report.test.ts
```

- [ ] **Step 3: Implement report module**

Create `src/report.ts`:

```typescript
import type { TestResult, Report, Verdict } from './types'

const APP_VERSION = '1.0.0'

export function generateReport(
  testsRun: TestResult[],
  overallVerdict: Verdict,
  overallSummary: string,
  deviceInfo?: { mac?: string; chip?: string },
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/report.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/report.ts tests/report.test.ts
git commit -m "feat: implement report generation, parsing, and file I/O"
```

---

### Task 7: UI Module — Views and Navigation

**Files:**
- Create: `src/ui.ts`
- Modify: `src/main.ts`, `index.html`

- [ ] **Step 1: Implement ui.ts with view management**

Create `src/ui.ts`. Manages the content area by rendering/switching between views. Each view is a function that returns an HTML string and an `init` function to attach event listeners after insertion:

```typescript
import type { DebugPacket, TestResult, Verdict, Report } from './types'

type ViewName = 'landing' | 'quick-check' | 'guided' | 'live-monitor' | 'report'

export const UI = {
  appEl: null as HTMLElement | null,
  connectionBar: {
    dot: null as HTMLElement | null,
    text: null as HTMLElement | null,
    btn: null as HTMLButtonElement | null,
  },
  currentView: null as ViewName | null,
  onNavigate: null as ((view: ViewName) => void) | null,
  onConnect: null as (() => void) | null,
  onDisconnect: null as (() => void) | null,

  init(): void {
    this.appEl = document.getElementById('app')
    this.connectionBar.dot = document.getElementById('status-indicator')
    this.connectionBar.text = document.getElementById('status-text')
    this.connectionBar.btn = document.getElementById('connect-btn') as HTMLButtonElement
    this.connectionBar.btn.addEventListener('click', () => {
      if (this.connectionBar.dot?.classList.contains('connected')) {
        this.onDisconnect?.()
      } else {
        this.onConnect?.()
      }
    })
  },

  setConnected(connected: boolean): void {
    const { dot, text, btn } = this.connectionBar
    if (dot) {
      dot.classList.toggle('connected', connected)
      dot.classList.toggle('disconnected', !connected)
    }
    if (text) text.textContent = connected ? 'Connected' : 'No device connected'
    if (btn) btn.textContent = connected ? 'Disconnect' : 'Connect'
  },

  showView(name: ViewName, html: string, init?: () => void): void {
    if (!this.appEl) return
    this.currentView = name
    this.appEl.innerHTML = html
    init?.()
  },

  renderLanding(): void {
    this.showView('landing', `
      <div class="mode-cards">
        <div class="mode-card" data-mode="quick-check">
          <div class="mode-card-icon">&#9889;</div>
          <div class="mode-card-title">Quick Check</div>
          <div class="mode-card-desc">30-second automated test</div>
        </div>
        <div class="mode-card" data-mode="guided">
          <div class="mode-card-icon">&#128270;</div>
          <div class="mode-card-title">Guided Diagnostics</div>
          <div class="mode-card-desc">Step-by-step with physical tests</div>
        </div>
        <div class="mode-card" data-mode="live-monitor">
          <div class="mode-card-icon">&#128200;</div>
          <div class="mode-card-title">Live Monitor</div>
          <div class="mode-card-desc">Real-time data stream</div>
        </div>
      </div>
      <div style="text-align:center;">
        <button id="load-report-btn" class="back-btn">or load a saved report...</button>
      </div>
    `, () => {
      this.appEl!.querySelectorAll('.mode-card').forEach(card => {
        card.addEventListener('click', () => {
          const mode = (card as HTMLElement).dataset.mode as ViewName
          this.onNavigate?.(mode)
        })
      })
      document.getElementById('load-report-btn')?.addEventListener('click', () => {
        this.onNavigate?.('report')
      })
    })
  },

  verdictBadge(verdict: Verdict): string {
    return `<span class="verdict-${verdict}">${verdict.toUpperCase()}</span>`
  },
}
```

- [ ] **Step 2: Update main.ts with app initialization and navigation**

Replace `src/main.ts`:

```typescript
import { UI } from './ui'
import { Serial } from './serial'
import './style.css'

const App = {
  init(): void {
    UI.init()
    UI.onConnect = () => this.connect()
    UI.onDisconnect = () => this.disconnect()
    UI.onNavigate = (view) => this.navigate(view)

    Serial.onStatus = (connected) => UI.setConnected(connected)

    UI.renderLanding()
  },

  async connect(): Promise<void> {
    await Serial.connect()
  },

  async disconnect(): Promise<void> {
    await Serial.disconnect()
  },

  navigate(view: string): void {
    switch (view) {
      case 'landing':
        UI.renderLanding()
        break
      case 'quick-check':
        // Task 8
        break
      case 'guided':
        // Task 9
        break
      case 'live-monitor':
        // Task 10
        break
      case 'report':
        // Task 11
        break
    }
  },
}

App.init()
```

- [ ] **Step 3: Verify in browser**

```bash
npm run dev
```

Open `https://localhost:5173`. Verify:
- Connection bar renders with red dot and "No device connected"
- Three mode cards display and are clickable
- "load a saved report" link is visible

- [ ] **Step 4: Commit**

```bash
git add src/ui.ts src/main.ts index.html
git commit -m "feat: implement UI module with landing page and view navigation"
```

---

### Task 8: Quick Check Mode

**Files:**
- Modify: `src/ui.ts`, `src/main.ts`

- [ ] **Step 1: Add Quick Check view to ui.ts**

Add a `renderQuickCheck` method to `UI` that shows:
- Back button
- "Run Quick Check" button (or "Connect first" if not connected)
- Results area (hidden until check completes)

Add a `renderQuickCheckResult` method that shows the verdict with expandable metrics.

```typescript
// Add to UI object:

renderQuickCheck(connected: boolean, onRun: () => void): void {
  this.showView('quick-check', `
    <button class="back-btn" id="back-btn">&larr; Back</button>
    <h2>Quick Check</h2>
    <p style="color:#888;">Runs Noise & Stability and Connection Health tests (~10 seconds).</p>
    <div id="qc-action">
      ${connected
        ? '<button id="qc-run-btn" style="background:#47cdd9;color:#000;border:none;border-radius:4px;padding:10px 24px;cursor:pointer;font-size:14px;">Run Quick Check</button>'
        : '<p style="color:#ffd43b;">Connect your scale first.</p>'}
    </div>
    <div id="qc-progress" class="hidden">
      <div style="margin:20px 0;">
        <div style="background:#333;border-radius:3px;overflow:hidden;height:6px;">
          <div id="qc-bar" style="width:0%;height:100%;background:linear-gradient(90deg,#47cdd9,#5cd3dd);border-radius:3px;transition:width 0.3s;"></div>
        </div>
        <div id="qc-status" style="color:#888;font-size:12px;margin-top:6px;">Collecting data...</div>
      </div>
    </div>
    <div id="qc-result" class="hidden"></div>
  `, () => {
    document.getElementById('back-btn')?.addEventListener('click', () => this.onNavigate?.('landing'))
    document.getElementById('qc-run-btn')?.addEventListener('click', onRun)
  })
},

showQuickCheckProgress(percent: number, status: string): void {
  document.getElementById('qc-action')?.classList.add('hidden')
  document.getElementById('qc-progress')?.classList.remove('hidden')
  const bar = document.getElementById('qc-bar') as HTMLElement
  if (bar) bar.style.width = `${percent}%`
  const statusEl = document.getElementById('qc-status')
  if (statusEl) statusEl.textContent = status
},

showQuickCheckResult(results: TestResult[], overall: Verdict, summary: string): void {
  document.getElementById('qc-progress')?.classList.add('hidden')
  const el = document.getElementById('qc-result')
  if (!el) return
  el.classList.remove('hidden')
  el.innerHTML = `
    <div style="text-align:center;margin:20px 0;">
      <div style="font-size:24px;font-weight:600;" class="verdict-${overall}">${overall.toUpperCase()}</div>
      <p style="color:#888;">${summary}</p>
    </div>
    ${results.map(r => `
      <div style="display:flex;justify-content:space-between;background:#1a1a2e;padding:10px 16px;border-radius:6px;margin:4px 0;">
        <span style="color:#eee;">${r.testId}</span>
        ${this.verdictBadge(r.verdict)}
      </div>
    `).join('')}
    <button id="qc-rerun" style="margin-top:16px;background:#47cdd9;color:#000;border:none;border-radius:4px;padding:8px 16px;cursor:pointer;">Run Again</button>
  `
},
```

- [ ] **Step 2: Wire Quick Check logic in main.ts**

In the `navigate` method's `'quick-check'` case, render the view and implement the run logic:

```typescript
// In navigate(), quick-check case:
case 'quick-check':
  UI.renderQuickCheck(!!Serial.port, () => this.runQuickCheck())
  break

// New method on App:
async runQuickCheck(): Promise<void> {
  const packets: DebugPacket[] = []
  const duration = 10000  // 10 seconds
  const pollInterval = 100
  const startTime = Date.now()

  Serial.onPacket = (packet) => {
    packets.push(packet)
    const elapsed = Date.now() - startTime
    const percent = Math.min(100, (elapsed / duration) * 100)
    UI.showQuickCheckProgress(percent, `Collecting... ${packets.length} samples`)
  }

  Serial.startPolling(pollInterval)

  await new Promise(resolve => setTimeout(resolve, duration))

  Serial.stopPolling()
  Serial.onPacket = null

  const noiseResult = evaluateNoiseStability(packets)
  const connResult = evaluateConnectionHealth(packets)
  const results = [noiseResult, connResult]
  const verdict = overallVerdict(results)
  const summary = verdict === 'pass'
    ? 'Scale hardware looks healthy'
    : verdict === 'warning'
    ? 'Some issues detected — consider running Guided Diagnostics'
    : 'Problems detected — run Guided Diagnostics for details'

  UI.showQuickCheckResult(results, verdict, summary)
},
```

Add the necessary imports at the top of `main.ts`.

- [ ] **Step 3: Test manually in browser**

Connect a scale, run the quick check, verify progress bar and results render.

- [ ] **Step 4: Commit**

```bash
git add src/ui.ts src/main.ts
git commit -m "feat: implement Quick Check mode with progress and results"
```

---

### Task 9: Guided Diagnostics — Wizard State Machine

**Files:**
- Create: `src/guided.ts`, `tests/guided.test.ts`
- Modify: `src/ui.ts`, `src/main.ts`

- [ ] **Step 1: Write guided wizard tests**

Create `tests/guided.test.ts`. Test the state machine transitions:

```typescript
import { describe, it, expect } from 'vitest'
import { GuidedWizard, TEST_DEFINITIONS } from '../src/guided'
import type { TestId } from '../src/types'

describe('GuidedWizard', () => {
  it('initializes with selected tests', () => {
    const wizard = new GuidedWizard(['noise-stability', 'drift'])
    expect(wizard.selectedTests).toHaveLength(2)
    expect(wizard.currentTestIndex).toBe(0)
    expect(wizard.phase).toBe('instruction')
  })

  it('advances through phases: instruction -> collecting -> result', () => {
    const wizard = new GuidedWizard(['noise-stability'])
    expect(wizard.phase).toBe('instruction')
    wizard.advance()
    expect(wizard.phase).toBe('collecting')
    wizard.advance()
    expect(wizard.phase).toBe('result')
  })

  it('advances to next test after result', () => {
    const wizard = new GuidedWizard(['noise-stability', 'drift'])
    wizard.advance() // -> collecting
    wizard.advance() // -> result
    wizard.advance() // -> next test instruction
    expect(wizard.currentTestIndex).toBe(1)
    expect(wizard.phase).toBe('instruction')
  })

  it('reports done after last test result', () => {
    const wizard = new GuidedWizard(['noise-stability'])
    wizard.advance() // collecting
    wizard.advance() // result
    wizard.advance() // done
    expect(wizard.isDone).toBe(true)
  })

  it('handles load-cell-bond mid-collection phase', () => {
    const wizard = new GuidedWizard(['load-cell-bond'])
    expect(wizard.phase).toBe('instruction')
    wizard.advance() // -> collecting (empty scale)
    expect(wizard.phase).toBe('collecting')
    wizard.advance() // -> mid-action (place weight)
    expect(wizard.phase).toBe('mid-action')
    wizard.advance() // -> collecting (loaded scale)
    expect(wizard.phase).toBe('collecting')
    wizard.advance() // -> result
    expect(wizard.phase).toBe('result')
  })
})

describe('TEST_DEFINITIONS', () => {
  it('has all four tests defined', () => {
    const ids = TEST_DEFINITIONS.map(t => t.id)
    expect(ids).toContain('noise-stability')
    expect(ids).toContain('load-cell-bond')
    expect(ids).toContain('drift')
    expect(ids).toContain('connection-health')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/guided.test.ts
```

- [ ] **Step 3: Implement guided wizard state machine**

Create `src/guided.ts`:

```typescript
import type { TestDefinition, TestId } from './types'

export const TEST_DEFINITIONS: TestDefinition[] = [
  {
    id: 'noise-stability',
    name: 'Noise & Stability',
    description: 'Measures signal noise with empty scale',
    durationEstimate: '~10s',
    pollIntervalMs: 100,
    collectionDurationMs: 10000,
  },
  {
    id: 'load-cell-bond',
    name: 'Load Cell Bond',
    description: 'Checks if load cell responds to weight',
    durationEstimate: '~20s',
    pollIntervalMs: 100,
    collectionDurationMs: 5000,  // per phase (empty + loaded)
  },
  {
    id: 'drift',
    name: 'Drift',
    description: 'Monitors tare stability over time',
    durationEstimate: '~30s',
    pollIntervalMs: 500,
    collectionDurationMs: 30000,
  },
  {
    id: 'connection-health',
    name: 'Connection Health',
    description: 'Checks ADC communication and timing',
    durationEstimate: '~10s',
    pollIntervalMs: 100,
    collectionDurationMs: 10000,
  },
]

export type WizardPhase = 'instruction' | 'collecting' | 'mid-action' | 'result'

export class GuidedWizard {
  selectedTests: TestDefinition[]
  currentTestIndex: number
  phase: WizardPhase
  isDone: boolean
  private collectingSubPhase: 'first' | 'second' = 'first'

  constructor(selectedIds: TestId[]) {
    this.selectedTests = TEST_DEFINITIONS.filter(t => selectedIds.includes(t.id))
    this.currentTestIndex = 0
    this.phase = 'instruction'
    this.isDone = false
  }

  get currentTest(): TestDefinition {
    return this.selectedTests[this.currentTestIndex]
  }

  private get isLoadCellBond(): boolean {
    return this.currentTest.id === 'load-cell-bond'
  }

  advance(): void {
    if (this.isDone) return

    switch (this.phase) {
      case 'instruction':
        this.phase = 'collecting'
        this.collectingSubPhase = 'first'
        break

      case 'collecting':
        if (this.isLoadCellBond && this.collectingSubPhase === 'first') {
          this.phase = 'mid-action'
        } else {
          this.phase = 'result'
        }
        break

      case 'mid-action':
        this.phase = 'collecting'
        this.collectingSubPhase = 'second'
        break

      case 'result':
        if (this.currentTestIndex < this.selectedTests.length - 1) {
          this.currentTestIndex++
          this.phase = 'instruction'
          this.collectingSubPhase = 'first'
        } else {
          this.isDone = true
        }
        break
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/guided.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Add guided diagnostics views to ui.ts**

Add methods to `UI`:
- `renderTestPicker(onStart: (selectedIds: TestId[]) => void)` — checkboxes + start button
- `renderWizardInstruction(test: TestDefinition, testNum: number, totalTests: number)` — instruction text + ready button
- `renderWizardCollecting(test: TestDefinition, percent: number, liveMetrics: Partial<DebugPacket>)` — progress + live data
- `renderWizardMidAction(onConfirm: () => void)` — "Place weight" instruction + confirm button
- `renderWizardResult(test: TestDefinition, result: TestResult, onNext: () => void)` — verdict + next button

Use the instruction text per test:
- noise-stability: "Remove everything from the scale and place it on a flat, stable surface"
- load-cell-bond: "Start with the scale empty" → mid-action: "Now place a weight on the scale"
- drift: "Remove everything from the scale and leave it still"
- connection-health: "Keep the scale connected and powered on"

- [ ] **Step 6: Wire guided mode into main.ts**

In the `navigate` method's `'guided'` case:
1. Show test picker
2. On start: create `GuidedWizard`, loop through phases
3. On each collecting phase: poll serial, collect packets, advance when duration complete
4. For load-cell-bond: collect empty packets, show mid-action, collect loaded packets
5. After each test: call the appropriate diagnostics function, store result
6. When wizard is done: compute overall verdict, navigate to report view

- [ ] **Step 7: Test manually in browser**

Walk through the guided flow with a connected scale.

- [ ] **Step 8: Commit**

```bash
git add src/guided.ts tests/guided.test.ts src/ui.ts src/main.ts
git commit -m "feat: implement guided diagnostics wizard with test picker and step sequencing"
```

---

### Task 10: Live Monitor Mode

**Files:**
- Modify: `src/ui.ts`, `src/main.ts`, `src/style.css`

- [ ] **Step 1: Add Live Monitor view to ui.ts**

Add a `renderLiveMonitor` method that displays:
- Back button
- Poll interval control (dropdown: 50ms, 100ms, 200ms, 500ms, 1000ms)
- Start/Stop button
- Live data panel: a table showing all decoded packet fields, updating on each packet
- Flag indicators (colored dots for OutOfRange, Timeout, TareInProgress)
- Std dev gauge (simple colored bar)
- Time-series area (placeholder `<canvas>` or simple scrolling list of values)

For the time-series chart, use a simple rolling list of the last 100 data points rendered as a table or inline sparkline. A full charting library can be added later if needed — keep it simple for now.

```typescript
// Add to UI:
renderLiveMonitor(connected: boolean, onStart: (intervalMs: number) => void, onStop: () => void): void {
  // ... render view with interval selector, start/stop, data panel
}

updateLiveData(packet: DebugPacket): void {
  // Update the data panel fields with latest packet values
}
```

- [ ] **Step 2: Add live monitor styles to style.css**

Styles for the data panel table, flag indicators, and std dev gauge.

- [ ] **Step 3: Wire Live Monitor into main.ts**

In the `navigate` method's `'live-monitor'` case:
- Render the view
- On start: set `Serial.onPacket` to call `UI.updateLiveData`, start polling at selected interval
- On stop: stop polling, clear callback

- [ ] **Step 4: Test manually**

Connect scale, start live monitor, verify data updates in real time.

- [ ] **Step 5: Commit**

```bash
git add src/ui.ts src/main.ts src/style.css
git commit -m "feat: implement live monitor mode with real-time data display"
```

---

### Task 11: Report View

**Files:**
- Modify: `src/ui.ts`, `src/main.ts`

- [ ] **Step 1: Add Report view to ui.ts**

Add a `renderReport` method that displays:
- Back button
- Overall verdict (large, centered, color-coded)
- Summary text
- Per-test results (list with verdict badges, clickable to expand raw data)
- Export JSON button
- Run Again button
- If loaded from file: show "Loaded from file" indicator

```typescript
renderReport(report: Report, onExport: () => void, onRunAgain: () => void): void {
  // ...
}
```

For expandable raw data: each test row has a toggle that reveals a monospace-formatted table of raw packet data (timestamp, raw value, smoothed, std dev, flags).

- [ ] **Step 2: Wire Report view into main.ts**

Handle two entry points:
1. From guided diagnostics: build Report from test results, render
2. From "load a saved report" on landing: call `loadReportFromFile()`, if valid render report view

Wire export button to `downloadReport()`.

- [ ] **Step 3: Test manually**

- Run guided diagnostics, verify report renders
- Export JSON, verify file downloads
- Load the exported JSON via "load a saved report", verify it renders correctly

- [ ] **Step 4: Commit**

```bash
git add src/ui.ts src/main.ts
git commit -m "feat: implement report view with export/import and expandable raw data"
```

---

### Task 12: Polish and Integration Testing

**Files:**
- Modify: `src/style.css`, `index.html`, `src/ui.ts`

- [ ] **Step 1: Add responsive styles**

Ensure mode cards stack on mobile (single column below 600px). Test connection bar wrapping.

```css
@media (max-width: 600px) {
  .mode-cards { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Add browser compatibility check**

In `main.ts`, check for `navigator.serial` on init. If absent, show a message: "Web Serial API not supported. Use Chrome, Edge, or Opera."

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Build for production**

```bash
npm run build
```

Expected: Clean build in `dist/` with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add responsive styles, browser check, and production build"
```
