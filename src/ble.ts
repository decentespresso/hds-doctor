import { decodeDebugPacket, decodeLedResponse } from './decoder'
import type { LedResponse } from './decoder'
import type { DebugPacket } from './types'

const SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb'
const WRITE_UUID = '000036f5-0000-1000-8000-00805f9b34fb'
const NOTIFY_UUID = '0000fff4-0000-1000-8000-00805f9b34fb'

const DEBUG_REQUEST: Uint8Array = new Uint8Array([0x03, 0x25, 0x02, 0x24])
// Firmware enum: 0=OFF, 1=CONTINUOUS, 2=SINGLE. Checksum = XOR of preceding bytes.
const DEBUG_STREAM_ON: Uint8Array = new Uint8Array([0x03, 0x25, 0x01, 0x27])
const DEBUG_STREAM_OFF: Uint8Array = new Uint8Array([0x03, 0x25, 0x00, 0x26])
const LED_ON_REQUEST: Uint8Array = new Uint8Array([0x03, 0x0A, 0x01, 0x00, 0x00, 0x01, 0x09])

// Decent Scale firmware drops the connection after 5s without a heartbeat.
const HEARTBEAT_CMD: Uint8Array = new Uint8Array([0x03, 0x0A, 0x03, 0xFF, 0xFF, 0x00, 0x0A])
const HEARTBEAT_INTERVAL_MS = 2000

type PacketCallback = (packet: DebugPacket) => void
type StatusCallback = (connected: boolean) => void
type LedResponseCallback = (info: LedResponse) => void

export const BLE = {
  device: null as BluetoothDevice | null,
  server: null as BluetoothRemoteGATTServer | null,
  writeChar: null as BluetoothRemoteGATTCharacteristic | null,
  notifyChar: null as BluetoothRemoteGATTCharacteristic | null,
  streaming: false,
  heartbeatTimer: null as ReturnType<typeof setInterval> | null,
  onPacket: null as PacketCallback | null,
  onStatus: null as StatusCallback | null,
  onLedResponse: null as LedResponseCallback | null,
  deviceInfo: null as LedResponse | null,
  _notifyHandler: null as ((e: Event) => void) | null,
  _disconnectHandler: null as ((e: Event) => void) | null,

  isAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator
  },

  isConnected(): boolean {
    return this.device?.gatt?.connected === true
  },

  async connect(): Promise<boolean> {
    if (!this.isAvailable()) {
      console.error('Web Bluetooth not supported')
      return false
    }
    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
      })
      this._disconnectHandler = () => this._onGattDisconnected()
      this.device.addEventListener('gattserverdisconnected', this._disconnectHandler)

      this.server = await this.device.gatt!.connect()
      const service = await this.server.getPrimaryService(SERVICE_UUID)
      this.writeChar = await service.getCharacteristic(WRITE_UUID)
      this.notifyChar = await service.getCharacteristic(NOTIFY_UUID)

      this._notifyHandler = (event: Event) => {
        const target = event.target as BluetoothRemoteGATTCharacteristic
        if (target.value) this._handleNotification(target.value)
      }
      this.notifyChar.addEventListener('characteristicvaluechanged', this._notifyHandler)
      await this.notifyChar.startNotifications()

      this._startHeartbeat()
      this.onStatus?.(true)
      await this.requestDeviceInfo()
      return true
    } catch (e) {
      console.error('BLE connection failed:', e)
      await this._cleanup()
      return false
    }
  },

  async disconnect(): Promise<void> {
    this.stopPolling()
    this._stopHeartbeat()
    try {
      if (this.notifyChar) {
        if (this._notifyHandler) {
          this.notifyChar.removeEventListener('characteristicvaluechanged', this._notifyHandler)
        }
        try { await this.notifyChar.stopNotifications() } catch {}
      }
      if (this.device?.gatt?.connected) {
        this.device.gatt.disconnect()
      }
    } catch (e) {
      console.error('BLE disconnect error:', e)
    }
    await this._cleanup()
    this.onStatus?.(false)
  },

  _onGattDisconnected(): void {
    this.stopPolling()
    this._stopHeartbeat()
    this._cleanup().then(() => this.onStatus?.(false))
  },

  async _cleanup(): Promise<void> {
    if (this.device && this._disconnectHandler) {
      this.device.removeEventListener('gattserverdisconnected', this._disconnectHandler)
    }
    this.device = null
    this.server = null
    this.writeChar = null
    this.notifyChar = null
    this.deviceInfo = null
    this._notifyHandler = null
    this._disconnectHandler = null
  },

  _handleNotification(view: DataView): void {
    const data = new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
    if (data.length < 2 || data[0] !== 0x03) return
    if (data[1] === 0x0A && data.length === 7) {
      const info = decodeLedResponse(data)
      if (info) {
        this.deviceInfo = info
        this.onLedResponse?.(info)
      }
    } else if (data[1] === 0x25 && data.length === 41) {
      const packet = decodeDebugPacket(data)
      if (packet) this.onPacket?.(packet)
    }
  },

  async _write(bytes: Uint8Array): Promise<void> {
    if (!this.writeChar) return
    // Firmware char 36f5 is PROPERTY_WRITE only — must use writeValueWithResponse.
    await this.writeChar.writeValueWithResponse(bytes as BufferSource)
  },

  async requestDebug(): Promise<void> {
    await this._write(DEBUG_REQUEST)
  },

  async requestDeviceInfo(): Promise<void> {
    await this._write(LED_ON_REQUEST)
  },

  // BLE uses firmware-driven CONTINUOUS streaming instead of per-tick SINGLE
  // requests. Sending writeValueWithResponse every intervalMs saturates the
  // write channel and starves the 2s heartbeat — firmware then trips its 5s
  // HEARTBEAT_TIMEOUT and disconnects. Firmware caps notify rate at ~10 Hz
  // via BLE_DEBUG_MIN_INTERVAL, so intervalMs is currently advisory only.
  startPolling(_intervalMs: number): void {
    if (this.streaming) return
    this.streaming = true
    this._write(DEBUG_STREAM_ON).catch(() => {})
  },

  stopPolling(): void {
    if (!this.streaming) return
    this.streaming = false
    this._write(DEBUG_STREAM_OFF).catch(() => {})
  },

  _startHeartbeat(): void {
    this._stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      this._write(HEARTBEAT_CMD).catch(() => {})
    }, HEARTBEAT_INTERVAL_MS)
  },

  _stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  },

  async setSampleCount(count: 1 | 2 | 4): Promise<void> {
    const modeMap: Record<number, number> = { 1: 0x00, 2: 0x01, 4: 0x03 }
    const mode = modeMap[count]
    const checksum = 0x03 ^ 0x1D ^ mode
    await this._write(new Uint8Array([0x03, 0x1D, mode, checksum]))
  },
}
