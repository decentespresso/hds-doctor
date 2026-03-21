# Sample Count Configuration + Live Monitor Chart — Design Spec

Two enhancements to HDS Doctor: configurable sample count for the ADS1232, and a real-time time-series chart in the live monitor.

## 1. Sample Count Configuration

### Protocol

Send a 4-byte command to set the number of samples the ADS1232 averages:

| Samples | Bytes |
|---------|-------|
| 1 | `03 1D 00 1C` |
| 2 | `03 1D 01 1E` |
| 4 | `03 1D 03 1C` |

Format: `[0x03] [0x1D] [mode] [XOR checksum of bytes 0-2]`

Mode mapping: `0x00` = 1 sample, `0x01` = 2 samples, `0x03` = 4 samples.

The firmware responds with a text string: `"Samples in use set to: X"`. No binary response to parse.

### Where It Appears

- **Live Monitor controls** — dropdown next to the poll interval selector. Sends the command immediately on change.
- **Guided Diagnostics test picker** — dropdown before the "Start" button. Sends the command once when diagnostics begin.
- **Quick Check** — sends sample count 4 automatically before starting (best stability data).

### Module Changes

- `serial.ts` — add `setSampleCount(count: 1 | 2 | 4): Promise<void>` that builds and sends the 4-byte command.
- `ui.ts` — add sample count dropdown to `renderLiveMonitor` controls and `renderTestPicker`.
- `main.ts` — wire the dropdown changes and pre-test commands.

## 2. Live Monitor Chart

### Library

[uPlot](https://github.com/leeoniya/uPlot) — lightweight (~35KB), high-performance time-series charting. Installed as an npm dependency.

### Chart Design

- **Two series, two Y axes:**
  - Left Y axis: Smoothed Value (large integer range, auto-scaled)
  - Right Y axis: Std Dev (typically 0–100, auto-scaled)
- **X axis:** Timestamp in seconds (relative to first data point)
- **Rolling window:** 200 data points. Older points are dropped as new ones arrive.
- **Placement:** Below the metrics grid, above the history table, in the live monitor view.
- **Lifecycle:** Created when live monitor starts streaming, destroyed when navigating away.

### Module Structure

New file: `src/chart.ts`

```
LiveChart {
  init(container: HTMLElement): void    // Create uPlot instance
  addPoint(timestamp: number, smoothed: number, stdDev: number): void
  destroy(): void                       // Clean up uPlot instance
}
```

### Integration

- `ui.ts` — add a `<div id="lm-chart">` container to the live monitor view. Import and expose chart lifecycle methods.
- `main.ts` — on live monitor start: init chart. On each packet: call `addPoint`. On stop/navigate away: destroy chart.
- `style.css` — add chart container sizing.
