import type { DebugPacket } from './types'
import type { LedResponse } from './decoder'

/**
 * Common contract Serial and BLE transports both satisfy.
 * Main app code routes through this — it never references a specific transport.
 */
export interface Transport {
  onPacket: ((packet: DebugPacket) => void) | null
  onStatus: ((connected: boolean) => void) | null
  onLedResponse: ((info: LedResponse) => void) | null
  deviceInfo: LedResponse | null
  isConnected(): boolean
  connect(): Promise<boolean>
  disconnect(): Promise<void>
  startPolling(intervalMs: number): void
  stopPolling(): void
  setSampleCount(count: 1 | 2 | 4): Promise<void>
  requestDeviceInfo(): Promise<void>
}

export type TransportKind = 'usb' | 'ble'
