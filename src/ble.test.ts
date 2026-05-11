import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BLE } from './ble'
import type { DebugPacket } from './types'
import type { LedResponse } from './decoder'

// Helper: build a valid 41-byte debug packet with correct XOR checksum.
function buildDebugPacket(): Uint8Array {
  const data = new Uint8Array(41)
  data[0] = 0x03
  data[1] = 0x25
  // bytes 2-39 left zero; XOR over those is 0x03 ^ 0x25 = 0x26
  let xor = 0
  for (let i = 0; i < 40; i++) xor ^= data[i]
  data[40] = xor
  return data
}

// Helper: 7-byte LED response (03 0A type batt verHigh verLow).
function buildLedResponse(): Uint8Array {
  // verHigh=0x03 → major=3, verLow=0x07 → minor=0 patch=7
  return new Uint8Array([0x03, 0x0A, 0x00, 0x00, 0x64, 0x03, 0x07])
}

function toDataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

// Reset BLE singleton state between tests.
function resetBle(): void {
  BLE.device = null
  BLE.server = null
  BLE.writeChar = null
  BLE.notifyChar = null
  BLE.deviceInfo = null
  BLE.onPacket = null
  BLE.onStatus = null
  BLE.onLedResponse = null
  BLE.stopPolling()
}

describe('BLE.requestDebug / requestDeviceInfo / setSampleCount byte arrays', () => {
  beforeEach(() => resetBle())

  it('requestDebug sends 03 25 02 24', async () => {
    const writes: Uint8Array[] = []
    BLE.writeChar = {
      writeValueWithResponse: vi.fn(async (bytes: BufferSource) => {
        writes.push(new Uint8Array(bytes as ArrayBuffer))
      }),
    } as unknown as BluetoothRemoteGATTCharacteristic
    await BLE.requestDebug()
    expect(Array.from(writes[0])).toEqual([0x03, 0x25, 0x02, 0x24])
  })

  it('requestDeviceInfo sends 03 0A 01 00 00 01 09', async () => {
    const writes: Uint8Array[] = []
    BLE.writeChar = {
      writeValueWithResponse: vi.fn(async (bytes: BufferSource) => {
        writes.push(new Uint8Array(bytes as ArrayBuffer))
      }),
    } as unknown as BluetoothRemoteGATTCharacteristic
    await BLE.requestDeviceInfo()
    expect(Array.from(writes[0])).toEqual([0x03, 0x0A, 0x01, 0x00, 0x00, 0x01, 0x09])
  })

  it('setSampleCount(1) sends 03 1D 00 1E', async () => {
    const writes: Uint8Array[] = []
    BLE.writeChar = {
      writeValueWithResponse: vi.fn(async (bytes: BufferSource) => {
        writes.push(new Uint8Array(bytes as ArrayBuffer))
      }),
    } as unknown as BluetoothRemoteGATTCharacteristic
    await BLE.setSampleCount(1)
    expect(Array.from(writes[0])).toEqual([0x03, 0x1D, 0x00, 0x03 ^ 0x1D ^ 0x00])
  })

  it('setSampleCount(2) sends 03 1D 01 <chk>', async () => {
    const writes: Uint8Array[] = []
    BLE.writeChar = {
      writeValueWithResponse: vi.fn(async (bytes: BufferSource) => {
        writes.push(new Uint8Array(bytes as ArrayBuffer))
      }),
    } as unknown as BluetoothRemoteGATTCharacteristic
    await BLE.setSampleCount(2)
    expect(Array.from(writes[0])).toEqual([0x03, 0x1D, 0x01, 0x03 ^ 0x1D ^ 0x01])
  })

  it('setSampleCount(4) maps to mode 0x03', async () => {
    const writes: Uint8Array[] = []
    BLE.writeChar = {
      writeValueWithResponse: vi.fn(async (bytes: BufferSource) => {
        writes.push(new Uint8Array(bytes as ArrayBuffer))
      }),
    } as unknown as BluetoothRemoteGATTCharacteristic
    await BLE.setSampleCount(4)
    expect(Array.from(writes[0])).toEqual([0x03, 0x1D, 0x03, 0x03 ^ 0x1D ^ 0x03])
  })

  it('_write no-op when writeChar is null', async () => {
    BLE.writeChar = null
    await expect(BLE.requestDebug()).resolves.toBeUndefined()
  })
})

describe('BLE notification demux', () => {
  beforeEach(() => resetBle())

  it('7-byte 03 0A frame routes to onLedResponse', () => {
    let captured: LedResponse | null = null
    BLE.onLedResponse = (info) => { captured = info }
    BLE._handleNotification(toDataView(buildLedResponse()))
    expect(captured).not.toBeNull()
    expect(captured!.firmwareVersion).toBe('3.0.7')
    expect(BLE.deviceInfo).toEqual(captured)
  })

  it('41-byte 03 25 frame routes to onPacket', () => {
    let captured: DebugPacket | null = null
    BLE.onPacket = (p) => { captured = p }
    BLE._handleNotification(toDataView(buildDebugPacket()))
    expect(captured).not.toBeNull()
    expect(captured!.rawValue).toBe(0)
  })

  it('41-byte frame does not fire onLedResponse', () => {
    const ledSpy = vi.fn()
    BLE.onLedResponse = ledSpy
    BLE._handleNotification(toDataView(buildDebugPacket()))
    expect(ledSpy).not.toHaveBeenCalled()
  })

  it('7-byte frame does not fire onPacket', () => {
    const pktSpy = vi.fn()
    BLE.onPacket = pktSpy
    BLE._handleNotification(toDataView(buildLedResponse()))
    expect(pktSpy).not.toHaveBeenCalled()
  })

  it('unknown header byte is ignored silently', () => {
    const pktSpy = vi.fn()
    const ledSpy = vi.fn()
    BLE.onPacket = pktSpy
    BLE.onLedResponse = ledSpy
    BLE._handleNotification(toDataView(new Uint8Array([0x03, 0xFF, 0x00])))
    expect(pktSpy).not.toHaveBeenCalled()
    expect(ledSpy).not.toHaveBeenCalled()
  })

  it('frame missing 0x03 prefix is ignored', () => {
    const pktSpy = vi.fn()
    BLE.onPacket = pktSpy
    const bad = buildDebugPacket()
    bad[0] = 0x00
    BLE._handleNotification(toDataView(bad))
    expect(pktSpy).not.toHaveBeenCalled()
  })

  it('41-byte frame with bad checksum is dropped', () => {
    const pktSpy = vi.fn()
    BLE.onPacket = pktSpy
    const bad = buildDebugPacket()
    bad[40] = (bad[40] + 1) & 0xFF
    BLE._handleNotification(toDataView(bad))
    expect(pktSpy).not.toHaveBeenCalled()
  })

  it('wrong length for known header is ignored (length-discriminated)', () => {
    const pktSpy = vi.fn()
    const ledSpy = vi.fn()
    BLE.onPacket = pktSpy
    BLE.onLedResponse = ledSpy
    // 03 25 with only 10 bytes
    BLE._handleNotification(toDataView(new Uint8Array(10).fill(0).map((_, i) => i === 0 ? 0x03 : i === 1 ? 0x25 : 0)))
    // 03 0A with 41 bytes
    const bad = new Uint8Array(41)
    bad[0] = 0x03; bad[1] = 0x0A
    BLE._handleNotification(toDataView(bad))
    expect(pktSpy).not.toHaveBeenCalled()
    expect(ledSpy).not.toHaveBeenCalled()
  })
})

describe('BLE.isAvailable', () => {
  it('returns false when navigator.bluetooth is missing', () => {
    expect(BLE.isAvailable()).toBe(false)
  })
})
