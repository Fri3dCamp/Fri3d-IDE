import { create } from 'zustand'
import type { Transport } from '../domain/transports'

export interface DeviceInfo {
    machine: string
    version: string
    mpy_ver: string | number
    sys_path: string
    connection?: string
    [key: string]: unknown
}

export type TransportType = 'usb' | 'ble' | 'ws'
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

interface ConnectionStore {
    status: ConnectionStatus
    transportType: TransportType | null
    port: Transport | null
    devInfo: DeviceInfo | null
    /** Bumped on TX/RX so the toolbar LED can blink without heavy state. */
    activityTick: number

    setConnecting(type: TransportType): void
    setConnected(port: Transport, type: TransportType): void
    setDevInfo(info: DeviceInfo | null): void
    setDisconnected(): void
    bumpActivity(): void
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
    status: 'disconnected',
    transportType: null,
    port: null,
    devInfo: null,
    activityTick: 0,

    setConnecting: (type) => set({ status: 'connecting', transportType: type }),
    setConnected: (port, type) => set({ status: 'connected', port, transportType: type }),
    setDevInfo: (devInfo) => set({ devInfo }),
    setDisconnected: () =>
        set({ status: 'disconnected', transportType: null, port: null, devInfo: null }),
    bumpActivity: () => set((s) => ({ activityTick: s.activityTick + 1 })),
}))
