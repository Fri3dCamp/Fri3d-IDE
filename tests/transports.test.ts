import { describe, expect, it } from 'vitest'
import { WebSerial } from '../src/domain/transports'

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
})
