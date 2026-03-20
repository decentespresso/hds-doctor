# HDS Doctor — Design Spec

A single-page web app that diagnoses damage to the Half Decent Scale's load cell and ADS1232 amplifier chip. It connects to the scale over USB, decodes its debug output, and produces actionable verdicts for both end users and support staff.

## Build System

**Vite + vanilla TypeScript.** No framework. HTTPS dev server via `vite-plugin-mkcert` for Web Serial testing during development. Static output deployable to GitHub Pages.

CSS from `fast.decentespresso.com/css/skel.css` plus a local stylesheet matching hds-updater's visual language: cyan accent (`#47cdd9`), dark backgrounds, monospace for data, color-coded status (green pass, yellow warning, red fail).

## Serial Communication

Web Serial API at 115200 baud. The app uses **poll-based** communication: it sends single-shot debug requests (`03 25 02 24`) on a timer and reads the 41-byte response. This gives full control over the sampling rate without relying on the firmware's continuous mode.

| Command | Bytes | Purpose |
|---------|-------|---------|
| Request debug | `03 25 02 24` | Single debug snapshot (polled on a timer) |

Each test mode sets its own poll interval:

- **Quick Check / Guided tests** — fixed rate per test (e.g., 100ms for noise analysis, 500ms for drift)
- **Live Monitor** — user-configurable interval, default 100ms

The scale responds with 41-byte debug packets (header `03 25`), validated by XOR checksum. Each packet contains:

- Timestamp (uint32, ms)
- Raw ADC value (int32, 24-bit)
- Smoothed value (int32)
- Tare offset (int32)
- Conversion time (uint16, units of 0.01ms)
- Samples per second (uint16, units of 0.01)
- Read index and samples in use (uint8 each)
- Dataset statistics: min, max, avg (int32 each), std dev (uint16, units of 0.1)
- Flags byte: OutOfRange (bit 0), Timeout (bit 1), TareInProgress (bit 2)
- Tare times counter (uint8)

All multi-byte values are big-endian.

## Module Structure

| Module | Responsibility |
|--------|---------------|
| `serial.ts` | Web Serial connection lifecycle, command sending, raw byte buffering and packet framing. Device info (MAC, chip) is not available from the debug protocol — these fields are populated if the firmware provides them via a separate text response or left blank. |
| `decoder.ts` | Parse 41-byte packets into typed objects, validate checksums |
| `diagnostics.ts` | Evaluate collected data against thresholds, produce verdicts |
| `guided.ts` | Wizard state machine: test selection, step sequencing, user confirmations, data gates |
| `report.ts` | Generate and parse report JSON, export/import |
| `ui.ts` | DOM manipulation, view switching, chart rendering |
| `main.ts` | App initialization, mode switching, module wiring |

## UI Structure

A single page with two layers:

1. **Connection bar** (persistent) — connect/disconnect button, device status indicator (dot + label), device info (MAC, chip) when connected.
2. **Content area** — switches between views.

### Landing Page

Three mode cards on a dark background:

- **Quick Check** — "30-second automated test"
- **Guided Diagnostics** — "Step-by-step with physical tests"
- **Live Monitor** — "Real-time data stream"

Plus a "load a saved report" link below the cards.

A back button returns to the landing page from any mode.

### Quick Check

Connect (if not already), press "Run". The app runs the Noise & Stability and Connection Health tests automatically (~10 seconds total). It polls debug snapshots at a fixed interval, then runs the diagnostics engine over the collected packets. Displays a pass/warn/fail verdict with expandable detail showing the key metrics. For the full test suite (including Load Cell Bond and Drift), use Guided Diagnostics.

### Guided Diagnostics

**Phase 1 — Test Picker.** Checkboxes for each available test, with brief descriptions and estimated duration. "Start Diagnostics" button.

**Phase 2 — Per-test wizard.** For each selected test, three steps:

1. **Instruction** — what to do physically (text + icon). "Ready" button.
2. **Collection** — progress bar, live key metrics (std dev, sample count, SPS). Some tests include a mid-collection action (e.g., "Now place a weight on the scale" with a "Confirm" button).
3. **Result** — pass/warn/fail for this test with a one-line explanation. "Next Test" button.

Back-navigation is disabled during active data collection. Allowed between instruction and result steps.

**Phase 3 — Report.** Transitions automatically after the last test completes.

### Live Monitor

Continuous streaming dashboard showing:

- Current decoded packet values
- Std dev gauge
- Flag indicators
- Time-series chart of raw ADC and smoothed values

Stays active until the user navigates away or disconnects.

### Report View

Reached after guided diagnostics, or by loading a saved JSON file.

Shows:
- Overall verdict (pass/warn/fail) with summary text
- Per-test results with verdict badges, expandable to show raw data
- "Export Report (JSON)" button
- "Run Again" button

## Diagnostics Engine

Each test evaluates collected debug packets against thresholds and produces a verdict: Pass, Warning, or Fail.

| Test | Measures | Pass | Warning | Fail |
|------|----------|------|---------|------|
| Noise & Stability | Std dev over ~10s, scale empty | < 10 | 10–50 | > 50 |
| Load Cell Bond | ADC delta: weight placed vs. empty | Delta > 10000 | Delta 1000–10000 | Delta < 1000 or erratic (variance > 500) |
| Drift | Tare offset variance over ~30s | < 5 variation | Moderate drift | Large drift |
| Connection Health | Timeout flags, SPS stability, out-of-range flags | None, stable SPS | Occasional flags | Persistent flags or SPS = 0 |

Overall verdict: the worst individual result wins.

## Report Format

```json
{
  "appVersion": "1.0.0",
  "timestamp": "2026-03-20T12:00:00Z",
  "deviceInfo": {
    "mac": "AA:BB:CC:DD:EE:FF",
    "chip": "ESP32-S3"
  },
  "testsRun": [
    {
      "testId": "noise-stability",
      "verdict": "pass",
      "summary": "Std dev 4.2, well within normal range",
      "rawPackets": [...]
    }
  ],
  "overallVerdict": "pass",
  "overallSummary": "Scale hardware appears healthy"
}
```

Staff load this JSON into the app to review verdicts and inspect raw packet data per test.
