/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import {
    toastr, ConnectionUID, webSerialPolyfill,
    WebSerial, WebBluetooth, WebSocketREPL, WebRTCTransport, MicroPythonOSWASM,
    QID as _QID, iOS, indicateActivity, report,
} from './viper_lib'

// Loosened selector helper type during the TS migration (runtime-identical).
const QID = _QID as (id: string) => any

const my_p2p_id = ConnectionUID.random().value();
// The IDE lives next to bridge.html on the same deployment.
const IDE_URL = new URL('.', window.location.href).href;
let rtc: any = null;
let port: any = null;
let wakeLock: any = null;

async function disconnectDevice() {
    QID('bridge-id').textContent = '---'
    QID('ide-link').textContent = IDE_URL + '?rtc=YOUR-BRIDGE-ID'

    for (const t of ["ws", "ble", "usb"]) {
        QID(`btn-conn-${t}`).classList.remove('connected')
    }

    try {
        await rtc.disconnect()
    } catch(_err) { /* ignore */ }

    try {
        await port.disconnect()
    } catch(_err) { /* ignore */ }

    try {
        await wakeLock.release()
    } catch(_err) { /* ignore */ }

    rtc = null
    port = null
    wakeLock = null
}

let defaultWsURL = 'ws://192.168.1.123:8266'
let defaultWsPass = ''

async function prepareNewPort(type: string) {
    let new_port: any;

    if (type === 'ws') {
        let url
        if (typeof window.webrepl_url === 'undefined' || window.webrepl_url == '') {
            url = prompt('Enter WebREPL device address.\nSupported protocols: ws wss rtc', defaultWsURL)
            if (!url) { return }
            defaultWsURL = url

            if (url.startsWith('http://')) { url = url.slice(7) }
            if (url.startsWith('https://')) { url = url.slice(8) }
            if (!url.includes('://')) { url = 'ws://' + url }

            if (window.location.protocol === 'https:' && url.startsWith('ws://')) {
                toastr.error('Connection to an unsecure WebSocket is blocked on a secure website')
                return
            }
        } else {
            url = window.webrepl_url
            defaultWsURL = url
            window.webrepl_url = ''
        }

        if (url.startsWith('ws://') || url.startsWith('wss://')) {
            new_port = new WebSocketREPL(url)
            new_port.onPasswordRequest(async () => {
                const pass = prompt('WebREPL password:', defaultWsPass)
                if (pass == null) { return }
                if (pass.length < 4) {
                    toastr.error('Password is too short')
                    return
                }
                defaultWsPass = pass
                return pass
            })
        } else if (url.startsWith('rtc://')) {
            const id = ConnectionUID.parse(url.replace('rtc://', ''))
            new_port = new WebRTCTransport(id.value())
        } else if (url.startsWith('vm://')) {
            new_port = new MicroPythonOSWASM()
        } else {
            toastr.error('Unknown link type')
        }
    } else if (type === 'ble') {
        if (iOS) {
            toastr.error('WebBluetooth is not available on iOS')
            return
        }
        if (!window.isSecureContext) {
            toastr.error('WebBluetooth cannot be accessed with unsecure connection')
            return
        }
        if (typeof navigator.bluetooth === 'undefined') {
            toastr.error('Try Chrome, Edge, Opera, Brave', 'WebBluetooth is not supported')
            return
        }
        new_port = new WebBluetooth()
    } else if (type === 'usb') {
        if (iOS) {
            toastr.error('WebSerial is not available on iOS')
            return
        }
        if (!window.isSecureContext) {
            toastr.error('WebSerial cannot be accessed with unsecure connection')
            return
        }
        if (typeof navigator.serial === 'undefined' && typeof (navigator as any).usb === 'undefined') {
            toastr.error('Try Chrome, Edge, Opera, Brave', 'WebSerial and WebUSB are not supported')
            return
        }
        if (typeof navigator.serial === 'undefined') {
            console.log('Using WebSerial polyfill')
            new_port = new WebSerial(webSerialPolyfill)
        } else {
            new_port = new WebSerial()
        }
    } else {
        toastr.error('Unknown connection type')
        return
    }

    try {
        await new_port.requestAccess()
    } catch (_err) {
        return
    }
    return new_port
}

async function connectDevice(type: string) {
    if (port) {
        if (!confirm('Disconnect current device?')) { return }
        await disconnectDevice()
        return
    }

    const new_port = await prepareNewPort(type)
    if (!new_port) { return }
    // Connect new port
    try {
        await new_port.connect()
    } catch (err: any) {
        report('Cannot connect', err)
        return
    }

    port = new_port

    QID(`btn-conn-${type}`).classList.add('connected')

    rtc = new WebRTCTransport(null, my_p2p_id)

    await rtc.requestAccess()

    QID('bridge-id').textContent = "rtc://" + rtc.info.id
    QID('ide-link').textContent = IDE_URL + '?rtc=' + rtc.info.id

    rtc.onConnect(() => {
        toastr.info('Fri3d-IDE connected')
    })

    rtc.onReceive(async (data: any) => {
        await port.write(data)
    })

    port.onActivity(indicateActivity)

    port.onReceive(async (data: any) => {
        await rtc.write(data)
    })

    rtc.onDisconnect(() => {
        toastr.warning('Fri3d-IDE disconnected')
    })

    port.onDisconnect(() => {
        toastr.warning('Device disconnected')
        disconnectDevice()
    })

    try {
        wakeLock = await navigator.wakeLock.request('screen')
    } catch (_err) { /* ignore */ }

    toastr.success('Bridge created')
}

window.connectDevice = connectDevice

disconnectDevice()
