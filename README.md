# HDS Doctor

A diagnostic web app for the [Half Decent Scale](https://decentespresso.com). Connects via USB to decode ADS1232 amplifier debug packets and diagnose load cell and amplifier health.

## Features

- **Quick Check** — 30-second automated test for noise stability and connection health
- **Guided Diagnostics** — Step-by-step wizard with physical tests (load cell bond, drift)
- **Live Monitor** — Real-time data stream with configurable sample count and time-series chart
- **Report Export/Import** — Save and share diagnostic reports as JSON

## Getting Started

### Prerequisites

- A browser with Web Serial API support (Chrome, Edge, or Opera)
- USB access to a Half Decent Scale running firmware with ADS1232 debug output

### Development

```bash
npm install
npm run dev
```

Open https://localhost:5173 in your browser.

> Note: HTTPS is required for the Web Serial API. The dev server uses a self-signed certificate from `vite-plugin-mkcert`.

### Build

```bash
npm run build
```

Output is in the `dist/` directory.

### Tests

```bash
npm test
```

## Diagnostic Tests

### Noise & Stability

Measures signal noise over ~10 seconds with an empty scale. Evaluates the standard deviation of the smoothed ADC value.

| Verdict | Threshold | What it means |
|---------|-----------|---------------|
| Pass | Std dev < 25 | Excellent stability, scale is healthy |
| Warning | Std dev 25–60 | Some noise detected — check cable connections and grounding |
| Fail | Std dev > 60 | Excessive noise — likely a hardware issue (damaged load cell, interference, weak signal) |

### Load Cell Bond

Checks whether the load cell physically responds to weight. You place a stable weight (100g+) on the scale and the test measures the ADC delta between empty and loaded states. Erratic readings during the loaded phase also trigger a fail.

| Verdict | Threshold | What it means |
|---------|-----------|---------------|
| Pass | Delta > 10,000 | Load cell is responding normally |
| Warning | Delta 1,000–10,000 | Lower than expected response — check load cell bond and mounting |
| Fail | Delta < 1,000 | Load cell may be damaged, disconnected, or improperly bonded |
| Fail | Erratic variance > 500 | Unstable readings under load — poor connection or damaged cell |

### Drift

Monitors tare offset stability over ~30 seconds. A healthy scale should maintain a stable tare offset.

| Verdict | Threshold | What it means |
|---------|-----------|---------------|
| Pass | Tare offset range < 5 | Stable — no drift detected |
| Warning | Tare offset range 5–50 | Some drift present — may be environmental (temperature) or mechanical |
| Fail | Tare offset range > 50 | Significant drift — possible hardware issue or thermal instability |

### Connection Health

Checks communication between the main board and ADS1232 ADC over ~10 seconds. Looks for timeout flags, out-of-range flags, and samples-per-second (SPS) stability.

| Verdict | Threshold | What it means |
|---------|-----------|---------------|
| Pass | No flags, stable SPS | ADC communication healthy |
| Warning | Occasional flags | Intermittent issues — check wiring and connector seating |
| Fail | SPS = 0 | ADC not responding — may indicate an ADC lockup (fix: disconnect and reconnect battery) |
| Fail | >50% samples have flags | Persistent communication failures — wiring or hardware issue |

**Overall verdict** is the worst individual result. If any test fails, the overall verdict is Fail. If any test warns (with no failures), the overall verdict is Warning.

## Architecture

| Module | Purpose |
|--------|---------|
| `serial.ts` | Web Serial connection, command sending, packet framing |
| `decoder.ts` | Parse 41-byte ADS1232 debug packets, checksum validation |
| `diagnostics.ts` | Threshold evaluation, verdict production |
| `guided.ts` | Wizard state machine for test sequencing |
| `report.ts` | JSON export/import |
| `ui.ts` | DOM manipulation, view switching |
| `chart.ts` | uPlot-based time-series chart |
| `main.ts` | App init, mode switching, module wiring |

## Protocol

Debug packets are 41 bytes with header `0x03 0x25` and XOR checksum. Request with:

```
03 25 02 24
```

Each packet contains: raw ADC value, smoothed value, tare offset, conversion time, SPS, statistics (min/max/avg/std dev), and status flags.

## Tech Stack

- Vite + TypeScript (vanilla, no framework)
- Web Serial API
- uPlot for charting
