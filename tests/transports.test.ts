import { describe, expect, it, vi } from 'vitest'
import { WebBluetooth, WebSerial, WebSocketREPL } from '../src/domain/transports'

describe('transport write limits', () => {
    it('chunks Bluetooth writes into 20-byte packets', async () => {
        Object.defineProperty(navigator, 'bluetooth', {
            configurable: true,
            value: {},
        })
        const transport = new WebBluetooth()
        const writeValue = vi.fn().mockResolvedValue(undefined)
        transport.tx = { writeValue }

        await transport.write('x'.repeat(45))

        expect(writeValue.mock.calls.map(([chunk]) => chunk.byteLength)).toEqual([20, 20, 5])
    })

    it('sends WebREPL data in 512-byte chunks', async () => {
        vi.useFakeTimers()
        try {
            const transport = new WebSocketREPL('ws://device.local')
            const send = vi.fn()
            transport.socket = { send } as unknown as WebSocket

            const write = transport.write('x'.repeat(1025))
            await vi.runAllTimersAsync()
            await write

            expect(send.mock.calls.map(([chunk]) => chunk.length)).toEqual([512, 512, 1])
        } finally {
            vi.useRealTimers()
        }
    })
})

describe('WebSerial port metadata', () => {
    it('accepts ports without USB vendor and product IDs', async () => {
        const transport = new WebSerial({
            requestPort: async () => ({ getInfo: () => ({}) }),
        })

        await expect(transport.requestAccess()).resolves.toBeUndefined()
        await expect(transport.getInfo()).resolves.toEqual({})
    })

    it('formats USB IDs when the browser provides them', async () => {
        const transport = new WebSerial({
            requestPort: async () => ({
                getInfo: () => ({ usbVendorId: 0x1a2b, usbProductId: 0x00c3 }),
            }),
        })

        await transport.requestAccess()

        await expect(transport.getInfo()).resolves.toEqual({ vid: '1a2b', pid: '00c3' })
    })

    it('releases local stream handles when an unplugged port rejects cleanup', async () => {
        const reader = {
            cancel: async () => { throw new Error('device disconnected') },
            releaseLock: () => {},
        }
        const writer = { releaseLock: () => {} }
        const transport = new WebSerial({})
        Object.assign(transport, {
            port: { close: async () => { throw new Error('device disconnected') } },
            reader,
            writer,
            readableStreamClosed: Promise.reject(new Error('device disconnected')),
        })

        await expect(transport.disconnect()).resolves.toBeUndefined()
        expect(transport.reader).toBeNull()
        expect(transport.writer).toBeNull()
    })
})
