/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import { sleep, Mutex, report } from './utils'

// Minimal fallbacks for the Web Serial / Web Bluetooth APIs, which are not
// part of the standard DOM lib typings.
declare global {
    interface Navigator {
        serial?: any
        bluetooth?: any
    }
}

// Implemented by subclasses that rely on the default `write` chunking
export interface Transport {
    writeBytes(data: Uint8Array): Promise<void>
}

export class Transport {
    declare mutex: Mutex
    declare inTransaction: boolean
    declare receivedData: any
    declare activityCallback: () => void
    declare receiveCallback: (data: string) => void
    declare disconnectCallback: () => void
    declare prevRecvCbk: ((data: string) => void) | undefined
    declare writeChunk: number
    declare emit: boolean
    declare info: any

    constructor() {
        if (this.constructor === Transport) {
            throw new Error("Cannot instantiate abstract class Transport")
        }
        this.mutex = new Mutex()
        this.inTransaction = false
        this.receivedData = ''
        this.activityCallback = () => {}
        this.receiveCallback = () => {}
        this.disconnectCallback = () => {}
        this.writeChunk = 128
        this.emit = false
        this.info = {}
    }

    async requestAccess() {
        throw new Error("Method 'requestAccess()' must be implemented.")
    }

    async connect() {
        throw new Error("Method 'connect()' must be implemented.")
    }

    async getInfo() {
        return this.info
    }

    async disconnect() {
        throw new Error("Method 'disconnect()' must be implemented.")
    }

    async write(data: string) {
        const encoder = new TextEncoder()
        const value = encoder.encode(data)
        try {
            let offset = 0
            while (offset < value.byteLength) {
                const chunk = value.slice(offset, offset + this.writeChunk)
                await this.writeBytes(chunk)
                this.activityCallback()
                offset += this.writeChunk
            }
        } catch (err: any) {
            report("Write error", err) // TODO
        }
    }

    onActivity(callback: () => void) {
        this.activityCallback = callback
    }

    onReceive(callback: (data: string) => void) {
        this.receiveCallback = callback
    }

    onDisconnect(callback: () => void) {
        this.disconnectCallback = callback
    }

    /*
     * Transaction API
     */

    async startTransaction(): Promise<() => void> {
        const release = await this.mutex.acquire()
        this.prevRecvCbk = this.receiveCallback
        this.inTransaction = true
        this.receivedData = ''
        this.receiveCallback = (data) => {
            this.receivedData += data
            if (this.emit && this.prevRecvCbk) { this.prevRecvCbk(data) }
        }

        return () => {
            if (this.prevRecvCbk) {
                this.receiveCallback = this.prevRecvCbk
                this.receiveCallback(this.receivedData)
            }
            this.receivedData = null
            this.inTransaction = false

            release()
        }
    }

    async flushInput() {
        if (!this.inTransaction) {
            throw new Error('Not in transaction')
        }
        this.receivedData = ''
        /*while (1) {
            const { value, done } = await reader.read()
            console.log(value, done)
            if (done) { break }
            if (value.length == 0) { break }
        }*/
    }

    async readExactly(n: number, timeout=5000): Promise<string> {
        if (!this.inTransaction) {
            throw new Error('Not in transaction')
        }
        let endTime = Date.now() + timeout
        while (timeout <= 0 || (Date.now() < endTime)) {
            if (this.receivedData.length >= n) {
                const res = this.receivedData.substring(0, n)
                this.receivedData = this.receivedData.substring(n)
                return res
            }
            const prev_avail = this.receivedData.length
            await sleep(10)
            if (this.receivedData.length > prev_avail) {
                endTime = Date.now() + timeout
            }
        }
        throw new Error('Timeout')
    }

    async readUntil(ending: string | string[], timeout=5000): Promise<string> {
        if (!this.inTransaction) {
            throw new Error('Not in transaction')
        }
        const endings = Array.isArray(ending) ? ending : [ending]
        let endTime = Date.now() + timeout
        while (timeout <= 0 || (Date.now() < endTime)) {
            let bestIdx = -1
            let bestEnd: string | null = null
            for (const e of endings) {
                const idx = this.receivedData.indexOf(e)
                if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
                    bestIdx = idx
                    bestEnd = e
                }
            }
            if (bestIdx !== -1) {
                const endIdx = bestIdx + bestEnd!.length
                const res = this.receivedData.substring(0, endIdx)
                this.receivedData = this.receivedData.substring(endIdx)
                return res
            }
            const prev_avail = this.receivedData.length
            await sleep(10)
            if (this.receivedData.length > prev_avail) {
                endTime = Date.now() + timeout
            }
        }
        throw new Error('Timeout reached before finding the ending sequence')
    }
}

/*
 * USB / Serial
 */

export class WebSerial extends Transport {
    declare serial: any
    declare port: any
    declare reader: any
    declare writer: any
    declare readableStreamClosed: Promise<void>

    constructor(serial: any = null) {
        super()
        this.port = null
        this.reader = null
        this.writer = null
        if (serial) {
            this.serial = serial
        } else {
            if (typeof navigator.serial === 'undefined') {
                throw new Error('WebSerial not available')
            }
            this.serial = navigator.serial
        }
    }

    async requestAccess() {
        this.port = await this.serial.requestPort()
        try {
            const pi = this.port.getInfo()
            this.info = {}
            if (typeof pi.usbVendorId === 'number') {
                this.info.vid = pi.usbVendorId.toString(16).padStart(4, '0')
            }
            if (typeof pi.usbProductId === 'number') {
                this.info.pid = pi.usbProductId.toString(16).padStart(4, '0')
            }
        } catch (err: any) {
            report("Error", err)
        }
    }

    async connect() {
        await this.port.open({ baudRate: 115200 })

        const decoderStream = new TextDecoderStream()
        this.readableStreamClosed = this.port.readable.pipeTo(decoderStream.writable)
        this.reader = decoderStream.readable.getReader()
        this.writer = this.port.writable.getWriter()

        const processStream = async () => {
            while (true) {
                const { value, done } = await this.reader.read()
                if (done) {
                    this.reader.releaseLock()
                    break
                }
                this.receiveCallback(value)
                this.activityCallback()
            }
            this.disconnectCallback()
        }
        processStream().catch((err) => {
            console.error('Serial stream failed:', err)
            this.disconnectCallback()
        })
    }

    async disconnect() {
        if (this.reader) {
            await this.reader.cancel()
            await this.readableStreamClosed.catch(() => {})
            this.reader = null
        }
        if (this.writer) {
            this.writer.releaseLock()
            this.writer = null
        }
        if (this.port?.close) await this.port.close()
        if (this.port?.forget) await this.port.forget()
    }

    async writeBytes(data: Uint8Array) {
        await this.writer.write(data)
    }
}

/*
 * Bluetooth
 */

const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
const NUS_TX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'       // Write or Write Without Response
const NUS_RX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'       // Notify
const NUS_TX_LIMIT = 241

const ADA_NUS_SERVICE = 'adaf0001-4369-7263-7569-74507974686e'
const ADA_NUS_TX = 'adaf0002-4369-7263-7569-74507974686e'   // Write or Write Without Response
const ADA_NUS_RX = 'adaf0003-4369-7263-7569-74507974686e'   // Notify
const ADA_VER = 'adaf0100-4669-6c65-5472-616e73666572'
const ADA_FT = 'adaf0200-4669-6c65-5472-616e73666572'
const ADA_NUS_TX_LIMIT = 20

const CH9143_SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb'
const CH9143_TX = '0000fff2-0000-1000-8000-00805f9b34fb'    // Write or Write Without Response
const CH9143_RX = '0000fff1-0000-1000-8000-00805f9b34fb'    // Notify
const CH9143_CTRL = '0000fff3-0000-1000-8000-00805f9b34fb'  // Read / Write
const CH9143_TX_LIMIT = 20

export class WebBluetooth extends Transport {
    declare device: any
    declare server: any
    declare service: any
    declare rx: any
    declare tx: any
    declare tx_limit: number
    declare decoderStream: TextDecoderStream | null
    declare reader: any

    constructor() {
        super()
        if (typeof navigator.bluetooth === 'undefined') {
            throw new Error('WebBluetooth not available')
        }
        this.device = null
        this.server = null
        this.service = null
        this.rx = null
        this.tx = null
        this.tx_limit = 20
        this.decoderStream = null
        this.reader = null
    }

    async requestAccess() {
        this.device = await navigator.bluetooth.requestDevice({
            filters: [
                { services: [NUS_SERVICE] },
                { namePrefix: 'mpy-' },
                { services: [ 0xfebb ] },
                { namePrefix: 'CIRCUITPY' },
                { namePrefix: 'CH9143' },
            ],
            //acceptAllDevices: true,
            optionalServices: [NUS_SERVICE, ADA_NUS_SERVICE, 0xfebb, CH9143_SERVICE],
        })

        this.device.addEventListener("gattserverdisconnected", () => {
            this.disconnectCallback()
        })
        try {
            this.info = {
                name: this.device.name,
            }
        } catch (err: any) {
            report("Error", err)
        }
    }

    async connect() {
        this.server = await this.device.gatt.connect()
        this.service = null

        const services = await this.server.getPrimaryServices()
        for (const service of services) {
            if (service.uuid === NUS_SERVICE) {
                this.service = service
                this.rx = await service.getCharacteristic(NUS_RX)
                this.tx = await service.getCharacteristic(NUS_TX)
                this.tx_limit = NUS_TX_LIMIT
                break
            } else if (service.uuid === ADA_NUS_SERVICE) {
                this.service = service
                this.rx = await service.getCharacteristic(ADA_NUS_RX)
                this.tx = await service.getCharacteristic(ADA_NUS_TX)
                this.tx_limit = ADA_NUS_TX_LIMIT

                // Check version
                const ada_fts = await this.server.getPrimaryService(0xfebb)
                const versionChar = await ada_fts.getCharacteristic(ADA_VER)
                const version = (await versionChar.readValue()).getUint32(0, true)
                if (version != 4) {
                    throw new Error(`Unsupported version: ${version}`)
                }

                // Register file transfer char
                const ft = await ada_fts.getCharacteristic(ADA_FT)
                //ft.removeEventListener('characteristicvaluechanged', () => {})
                ft.addEventListener('characteristicvaluechanged', () => {})
                await ft.startNotifications()
                break
            } else if (service.uuid === CH9143_SERVICE) {
                this.service = service
                this.rx = await service.getCharacteristic(CH9143_RX)
                this.tx = await service.getCharacteristic(CH9143_TX)
                this.tx_limit = CH9143_TX_LIMIT

                // Setup 115200 8N1
                const ctrl = await service.getCharacteristic(CH9143_CTRL)
                await ctrl.writeValue(new Uint8Array([0x06,0x00,0x09,0x00,0x00,0xC2,0x01,0x00,0x08,0x01,0x00,0x06]))
                break
            }
        }

        if (!this.service) {
            throw new Error('No compatible NUS service found')
        }

        this.decoderStream = new TextDecoderStream()
        this.reader = this.decoderStream.readable.getReader()
        const writer = this.decoderStream.writable.getWriter()

        const processStream = async () => {
            while (this.device.gatt.connected) {
                const { value, done } = await this.reader.read()
                if (done) break
                this.receiveCallback(value)
                this.activityCallback()
            }
        }

        this.rx.addEventListener('characteristicvaluechanged', (ev: any) => {
            writer.write(ev.target.value).catch(() => {})
        })
        await this.rx.startNotifications()
        processStream().catch((err) => {
            console.error('Bluetooth stream failed:', err)
            this.disconnectCallback()
        })
    }

    async disconnect() {
        if (this.device && this.device.gatt.connected) {
            await this.device.gatt.disconnect();
        }
        if (this.reader) {
            await this.reader.cancel()
            this.reader.releaseLock()
        }
        if (this.decoderStream) {
            await this.decoderStream.writable.abort()
        }
    }

    async writeBytes(data: Uint8Array) {
        //await this.tx.writeValueWithoutResponse(data)
        await this.tx.writeValue(data)
        await sleep(1)
    }
}

/*
 * WebSocket
 */

export class WebSocketREPL extends Transport {
    declare url: string
    declare socket: WebSocket | null
    declare last_activity: number
    declare hbeat: any
    declare _passReqCallback: () => any

    constructor(url: string) {
        super()
        if (!url) {
            throw new Error("WebSocket URL is required")
        }
        this.url = url
        this.socket = null
        this.last_activity = 0
        this.info = {
            url: this.url
        }
    }

    onPasswordRequest(callback: () => any) {
        this._passReqCallback = callback
    }

    async requestAccess() {
    }

    async connect() {
        function _conn(url: string): Promise<WebSocket> {
            return new Promise(function(resolve, reject) {
                const ws = new WebSocket(url)
                let finished = false
                ws.onopen = async function() {
                    await sleep(300)    // TODO: find a better way
                    if (!finished) {
                        finished = true
                        resolve(ws)
                    }
                }
                ws.onerror = function(err) {
                    reject(err)
                }
                ws.onclose = function(ev) {
                    if (!finished) {
                        finished = true
                        reject(new Error(ev.reason))
                    }
                }
            })
        }
        this.socket = await _conn(this.url)
        this.socket.binaryType = 'arraybuffer'

        this.hbeat = setInterval(() => {
            // Send empty data frame
            const now = Date.now()
            if (this.socket && (now - this.last_activity > 55*1000)) {
                this.socket.send('')
                this.last_activity = now
            }
        }, 10*1000)

        this.socket.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                // NOTE: for WebSockets, we assume that each binary message
                // contains a complete unicode string
                const decoder = new TextDecoder()
                this.receiveCallback(decoder.decode(event.data))
            } else {
                this.receiveCallback(event.data)
            }
            this.activityCallback()
            this.last_activity = Date.now()
        }

        this.socket.onclose = (_ev) => {
            this.disconnectCallback()
        }

        const release = await this.startTransaction()
        try {
            try {
                await this.readUntil('Password:', 1000)
            } catch (_err) {
                return
            }
            const pass = await this._passReqCallback()
            if (!pass) {
                throw new Error("Password is required")
            }
            await this.write(pass + '\n')
            await this.readUntil('\n') // skip echo
            const rsp = (await this.readUntil('\n')).trim()
            if (rsp == "WebREPL connected") {
                // All good!
            } else if (rsp == "Access denied") {
                throw new Error("Invalid password")
            } else {
                throw new Error(rsp)
            }
        } finally {
            release()
        }
    }

    async disconnect() {
        if (this.socket) {
            clearInterval(this.hbeat)
            this.socket.close()
            this.socket = null
            this.hbeat = null
        }
    }

    async write(value: string) {
        if (!this.socket) { return; }
        try {
            let offset = 0
            while (offset < value.length) {
                const chunk = value.slice(offset, offset + this.writeChunk)
                this.socket.send(chunk)
                this.activityCallback()
                offset += this.writeChunk
                if (offset < value.length) {
                    await sleep(150)
                }
            }
            this.last_activity = Date.now()
        } catch (err: any) {
            report("Write error", err) // TODO
        }
    }
}

/*
 * P2P / WebRTC
 */

import type { Peer } from 'peerjs'

export class WebRTCTransport extends Transport {
    declare peerId: any
    declare myId: any
    declare peer: Peer
    declare connection: any
    declare connectCallback: () => void

    constructor(peerId: any = null, myId: any = null) {
        super();

        this.peerId = peerId
        this.myId = myId
    }

    onConnect(callback: () => void) {
        this.connectCallback = callback
    }

    async requestAccess() {
        const { Peer } = await import('peerjs')
        const iceServers: any[] = [
            {
                urls: [
                    'stun:stun.l.google.com:19302',
                    'stun:stun1.l.google.com:19302',
                    'stun:stun2.l.google.com:19302',
                    'stun:stun3.l.google.com:19302',
                    'stun:stun4.l.google.com:19302',
                    'stun:stun.cloudflare.com:3478',
                    'stun:stun.nextcloud.com:3478',
                ]
            }
        ]

        const controller = new AbortController()
        const timeout = setTimeout(() => {
            controller.abort()
        }, 3000);

        // NOTE: WebRTC signaling/TURN relies on the upstream ViperIDE
        // infrastructure (hub.viper-ide.org). If that service disappears, P2P
        // bridging degrades to the public peerjs TURN servers below.
        try {
            const ice = await (await fetch('https://hub.viper-ide.org/ice.json', {
                cache: "no-store",
                signal: controller.signal,
            })).json()
            iceServers.push(...ice)
        } finally {
            clearTimeout(timeout)
        }

        iceServers.push(
            {
                urls: [
                    'turn:eu-0.turn.peerjs.com:3478',
                    'turn:us-0.turn.peerjs.com:3478',
                ],
                username: "peerjs",
                credential: "peerjsp"
            }, {
                url: 'turn:hub.viper-ide.org:3478?transport=udp',
                username: 'viper-ide',
                credential: 'K70h5k>6ni/a',
            }
        );

        this.peer = new Peer(this.myId, {
            secure: true,
            config: { iceServers }
        })
        this.connection = null
        this.connectCallback = () => {}
        this.peer.on('connection', (conn) => {
            this.peerId = conn.peer
            this._setup_conn(conn)
            this.connectCallback()
        })

        // Generate a unique ID if not provided
        if (!this.peer.id) {
            await new Promise((resolve) => this.peer.on('open', resolve))
        }
        this.info = { id: this.peer.id }
        console.log('My P2P ID:', this.peer.id)
    }

    _setup_conn(conn: any) {
        conn.on('data', (data: any) => {
            const decoder = new TextDecoder()
            this.receiveCallback(decoder.decode(data))
            this.activityCallback()
        })
        conn.on('close', () => {
            this.disconnectCallback()
        })
        this.connection = conn
    }

    connect() {
        return new Promise<void>((resolve, reject) => {
            this.peer.on('error', reject)

            const conn = this.peer.connect(this.peerId, {
                serialization: 'binary',
                reliable: true,
            })

            conn.on('error', reject)
            conn.on('open', () => {
                this._setup_conn(conn)
                resolve()
            })
        });
    }

    async disconnect() {
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }
    }

    async write(data: string) {
        const encoder = new TextEncoder()
        const value = encoder.encode(data)

        if (this.connection && this.connection.open) {
            this.connection.send(value)
            await sleep(50)  // TODO find a better way
        }
    }
}
