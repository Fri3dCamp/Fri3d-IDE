import { beforeEach, describe, expect, it } from 'vitest'
import { Transport } from '../src/domain/transports'
import {
    canTransitionConnection,
    isConnectionActive,
    isConnectionPending,
    isConnectionReady,
    useConnectionStore,
} from '../src/stores/connection'

class TestTransport extends Transport {
    async requestAccess() {}
    async connect() {}
    async disconnect() {}
    async writeBytes(_data: Uint8Array) {}
}

describe('connection state machine', () => {
    beforeEach(() => {
        useConnectionStore.setState({
            status: 'disconnected',
            transportType: null,
            port: null,
            devInfo: null,
            error: null,
            activityTick: 0,
        })
    })

    it('follows the permission-to-ready lifecycle', () => {
        const connection = useConnectionStore.getState()
        const port = new TestTransport()

        connection.requestPermission('usb')
        useConnectionStore.getState().startConnecting()
        useConnectionStore.getState().startSynchronizing(port)
        useConnectionStore.getState().setReady()

        expect(useConnectionStore.getState()).toMatchObject({
            status: 'ready',
            transportType: 'usb',
            port,
        })
        expect(isConnectionReady(useConnectionStore.getState().status)).toBe(true)
    })

    it('rejects invalid transitions', () => {
        expect(canTransitionConnection('disconnected', 'busy')).toBe(false)
        expect(() => useConnectionStore.getState().setBusy()).toThrow(
            'Invalid connection transition: disconnected → busy',
        )
    })

    it('distinguishes pending and active states', () => {
        expect(isConnectionPending('requesting-permission')).toBe(true)
        expect(isConnectionPending('recovering')).toBe(true)
        expect(isConnectionActive('synchronizing')).toBe(true)
        expect(isConnectionActive('busy')).toBe(true)
        expect(isConnectionReady('busy')).toBe(false)
    })
})
