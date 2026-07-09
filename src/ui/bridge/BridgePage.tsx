import './bridge.css'
import { pageConnectDevice } from '../legacy'

export function BridgePage() {
    return (
        <>
            <h2>Fri3d-IDE P2P Bridge</h2>

            <p>The bridge allows creating a secure, peer-to-peer connection between the device and Fri3d-IDE <b>across the internet</b>.</p>

            <ol>
                <li>
                    <span>Connect your device:</span>
                    <button title="Connect WebREPL" onClick={() => pageConnectDevice('ws')} id="btn-conn-ws"><i className="fa-solid fa-link"></i></button>
                    <button title="Connect Bluetooth" onClick={() => pageConnectDevice('ble')} id="btn-conn-ble"><i className="fa-brands fa-bluetooth-b"></i></button>
                    <button title="Connect USB/Serial" onClick={() => pageConnectDevice('usb')} id="btn-conn-usb"><i className="fa-brands fa-usb"></i></button>
                </li>
                <li>Grab a Bridge P2P ID:<br />
                    <span className="highlight monospace" id="bridge-id"></span>
                </li>
                <li>In <a className="link" href="https://viper-ide.org" target="_blank">Fri3d-IDE</a>, click <span className="highlight"><i className="fa-solid fa-link"></i> Connect WebREPL</span> button and insert your Bridge P2P ID.<br />
                    You can also use a direct link: <span className="highlight monospace" id="ide-link"></span>
                </li>
            </ol>

            <p>⚠️ Keep this page open for the connection to remain active</p>
        </>
    )
}
