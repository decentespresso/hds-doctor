import { decodeDebugPacket, decodeLedResponse } from './decoder'
import type { LedResponse } from './decoder'
import type { DebugPacket } from './types'

const BAUD_RATE = 115200
const DEBUG_REQUEST: Uint8Array = new Uint8Array([0x03, 0x25, 0x02, 0x24])
const LED_ON_REQUEST: Uint8Array = new Uint8Array([0x03, 0x0A, 0x01, 0x00, 0x00, 0x01, 0x09])

type PacketCallback = (packet: DebugPacket) => void
type StatusCallback = (connected: boolean) => void
type LedResponseCallback = (info: LedResponse) => void

export const Serial = {
  port: null as SerialPort | null,
  reader: null as ReadableStreamDefaultReader<Uint8Array> | null,
  writer: null as WritableStreamDefaultWriter<Uint8Array> | null,
  buffer: new Uint8Array(0),
  pollTimer: null as ReturnType<typeof setInterval> | null,
  onPacket: null as PacketCallback | null,
  onStatus: null as StatusCallback | null,
  onLedResponse: null as LedResponseCallback | null,
  deviceInfo: null as LedResponse | null,
  reading: false,

  async connect(): Promise<boolean> {
    try {
      this.port = await navigator.serial.requestPort()
      await this.port.open({ baudRate: BAUD_RATE })
      this.writer = this.port.writable!.getWriter()
      this.startReading()
      this.onStatus?.(true)
      this.requestDeviceInfo()
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
    this.deviceInfo = null
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
    const combined = new Uint8Array(this.buffer.length + incoming.length)
    combined.set(this.buffer)
    combined.set(incoming, this.buffer.length)
    this.buffer = combined

    while (this.buffer.length >= 2) {
      // Find the positions of both packet types
      const ledIdx = this.findLedHeader(this.buffer)
      const debugIdx = this.findDebugHeader(this.buffer)

      // Determine which header comes first (treat -1 as infinity)
      const firstIdx = ledIdx === -1 ? debugIdx
        : debugIdx === -1 ? ledIdx
        : Math.min(ledIdx, debugIdx)

      if (firstIdx === -1) {
        // No known header found — keep last byte in case it's start of a header
        this.buffer = this.buffer.slice(Math.max(0, this.buffer.length - 1))
        break
      }

      if (firstIdx > 0) {
        this.buffer = this.buffer.slice(firstIdx)
      }

      // Check if the first header is an LED response (03 0A)
      if (this.buffer[1] === 0x0A) {
        if (this.buffer.length < 7) break
        const ledBytes = this.buffer.slice(0, 7)
        const info = decodeLedResponse(ledBytes)
        if (info) {
          this.deviceInfo = info
          this.onLedResponse?.(info)
          this.buffer = this.buffer.slice(7)
        } else {
          this.buffer = this.buffer.slice(1)
        }
      } else {
        // Debug packet (03 25)
        if (this.buffer.length < 41) break
        const packetBytes = this.buffer.slice(0, 41)
        const packet = decodeDebugPacket(packetBytes)
        if (packet) {
          this.onPacket?.(packet)
          this.buffer = this.buffer.slice(41)
        } else {
          this.buffer = this.buffer.slice(1)
        }
      }
    }
  },

  findDebugHeader(data: Uint8Array): number {
    for (let i = 0; i <= data.length - 2; i++) {
      if (data[i] === 0x03 && data[i + 1] === 0x25) return i
    }
    return -1
  },

  findLedHeader(data: Uint8Array): number {
    for (let i = 0; i <= data.length - 2; i++) {
      if (data[i] === 0x03 && data[i + 1] === 0x0A) return i
    }
    return -1
  },

  async requestDebug(): Promise<void> {
    if (!this.writer) return
    await this.writer.write(DEBUG_REQUEST)
  },

  async requestDeviceInfo(): Promise<void> {
    if (!this.writer) return
    await this.writer.write(LED_ON_REQUEST)
  },

  startPolling(intervalMs: number): void {
    this.stopPolling()
    this.requestDebug()
    this.pollTimer = setInterval(() => this.requestDebug(), intervalMs)
  },

  stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  },

  async setSampleCount(count: 1 | 2 | 4): Promise<void> {
    if (!this.writer) return
    const modeMap: Record<number, number> = { 1: 0x00, 2: 0x01, 4: 0x03 }
    const mode = modeMap[count]
    const checksum = 0x03 ^ 0x1D ^ mode
    await this.writer.write(new Uint8Array([0x03, 0x1D, mode, checksum]))
  },
}
