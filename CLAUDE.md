# HDS Doctor

Diagnostic web app for the Half Decent Scale (Decent Espresso). Connects via USB Web Serial to decode ADS1232 amplifier debug packets and diagnose load cell health.

## Quick Reference

```bash
npm run dev        # Dev server at https://localhost:5173 (HTTPS required for Web Serial)
npm run build      # TypeScript check + Vite build → dist/
npm test           # Vitest (node environment)
npm run test:watch # Vitest in watch mode
```

## Architecture

Vanilla TypeScript, no framework. Single-page app with views injected into `<main id="app">` by `ui.ts`.

| Module | Role |
|--------|------|
| `src/serial.ts` | Web Serial connection, command framing, polling |
| `src/decoder.ts` | Parse 41-byte debug packets, checksum validation |
| `src/diagnostics.ts` | Threshold evaluation → `TestResult` with verdict |
| `src/guided.ts` | Wizard state machine (instruction → collecting → result) |
| `src/report.ts` | JSON export/import of diagnostic reports |
| `src/ui.ts` | All DOM manipulation and view rendering |
| `src/chart.ts` | uPlot time-series chart for live monitor |
| `src/main.ts` | App init, mode switching, wires modules together |
| `src/types.ts` | Shared types: `DebugPacket`, `TestResult`, `Report`, `Verdict` |

## Conventions

- **No framework** — direct DOM manipulation via `ui.ts`. All HTML is constructed in TypeScript, not templates.
- **CSS** — `src/style.css` extends external Decent stylesheets (`skel.css`, `style.css` from `fast.decentespresso.com`). Uses CSS custom properties for theming.
- **TypeScript strict mode** — `noUnusedLocals` and `noUnusedParameters` are enabled.
- **Tests** — unit tests live in `tests/` (decoder, diagnostics, report) and `src/` (guided). Use Vitest with node environment. No browser/DOM tests.
- **Base path** — Vite `base: '/hds-doctor/'` for GitHub Pages deployment.
- **Commit style** — lowercase prefix: `fix:`, `feat:`, `ci:`, `polish:`, or bare description. Keep messages short.

## Protocol

Debug packets: 41 bytes, header `0x03 0x25`, XOR checksum. Request command: `03 25 02 24`. Each packet has raw/smoothed ADC values, tare offset, SPS, statistics, and status flags.

## Key Domain Concepts

- **Verdict**: `pass` | `warning` | `fail` — every test produces one
- **Overall verdict**: worst individual result wins
- **Four tests**: noise-stability, load-cell-bond (two-phase: empty + loaded), drift, connection-health
- **Sample count**: configurable per-session, affects ADC averaging window on the device
