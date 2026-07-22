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

export type TransportType = 'usb' | 'ble' | 'ws' | 'vm'
export type ConnectionStatus =
    | 'disconnected'
    | 'requesting-permission'
    | 'connecting'
    | 'synchronizing'
    | 'ready'
    | 'busy'
    | 'recovering'
    | 'error'

const TRANSITIONS: Record<ConnectionStatus, readonly ConnectionStatus[]> = {
    disconnected: ['requesting-permission'],
    'requesting-permission': ['connecting', 'disconnected', 'error'],
    connecting: ['synchronizing', 'disconnected', 'error'],
    synchronizing: ['ready', 'recovering', 'disconnected', 'error'],
    ready: ['busy', 'recovering', 'disconnected', 'error'],
    busy: ['ready', 'recovering', 'disconnected', 'error'],
    recovering: ['ready', 'disconnected', 'error'],
    error: ['requesting-permission', 'recovering', 'disconnected'],
}

export function canTransitionConnection(from: ConnectionStatus, to: ConnectionStatus): boolean {
    return from === to || TRANSITIONS[from].includes(to)
}

export function isConnectionReady(status: ConnectionStatus): boolean {
    return status === 'ready'
}

export function isConnectionActive(status: ConnectionStatus): boolean {
    return status === 'synchronizing' || status === 'ready' || status === 'busy' || status === 'recovering'
}

export function isConnectionPending(status: ConnectionStatus): boolean {
    return status === 'requesting-permission' || status === 'connecting' || status === 'synchronizing' || status === 'recovering'
}

interface ConnectionStore {
    status: ConnectionStatus
    transportType: TransportType | null
    port: Transport | null
    devInfo: DeviceInfo | null
    error: string | null
    /** Bumped on TX/RX so the toolbar LED can blink without heavy state. */
    activityTick: number

    requestPermission(type: TransportType): void
    startConnecting(): void
    startSynchronizing(port: Transport): void
    setReady(): void
    setBusy(): void
    setRecovering(): void
    setError(error: unknown): void
    setDevInfo(info: DeviceInfo | null): void
    setDisconnected(): void
    bumpActivity(): void
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

export const useConnectionStore = create<ConnectionStore>((set, get) => {
    const transition = (status: ConnectionStatus, patch: Partial<ConnectionStore> = {}) => {
        const current = get().status
        if (!canTransitionConnection(current, status)) {
            throw new Error(`Invalid connection transition: ${current} → ${status}`)
        }
        set({ status, ...patch })
    }

    return {
        status: 'disconnected',
        transportType: null,
        port: null,
        devInfo: null,
        error: null,
        activityTick: 0,

        requestPermission: (transportType) =>
            transition('requesting-permission', { transportType, port: null, devInfo: null, error: null }),
        startConnecting: () => transition('connecting'),
        startSynchronizing: (port) => transition('synchronizing', { port }),
        setReady: () => transition('ready', { error: null }),
        setBusy: () => transition('busy'),
        setRecovering: () => transition('recovering'),
        setError: (error) =>
            transition('error', {
                port: null,
                devInfo: null,
                error: errorMessage(error),
            }),
        setDevInfo: (devInfo) => set({ devInfo }),
        setDisconnected: () =>
            transition('disconnected', {
                transportType: null,
                port: null,
                devInfo: null,
                error: null,
            }),
        bumpActivity: () => set((state) => ({ activityTick: state.activityTick + 1 })),
    }
})
