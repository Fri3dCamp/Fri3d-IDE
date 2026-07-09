import './benchmark.css'
import { pageConnectDevice } from '../legacy'

export function BenchmarkPage() {
    return (
        <>
            <h2>Fri3d-IDE Benchmark</h2>
            <div>
                1. Select benchmarks:
                <span><input type="checkbox" id="test-fs" defaultChecked /><label htmlFor="test-fs">File System</label></span>
                <span><input type="checkbox" id="test-cpu" defaultChecked /><label htmlFor="test-cpu">CPU</label></span>
            </div>

            <div>
                2. Connect your device:
                <button title="Connect WebREPL" onClick={() => pageConnectDevice('ws')} id="btn-conn-ws"><i className="fa-solid fa-link"></i></button>
                <button title="Connect Bluetooth" onClick={() => pageConnectDevice('ble')} id="btn-conn-ble"><i className="fa-brands fa-bluetooth-b"></i></button>
                <button title="Connect USB/Serial" onClick={() => pageConnectDevice('usb')} id="btn-conn-usb"><i className="fa-brands fa-usb"></i></button>
            </div>

            <pre className="monospace" id="log"></pre>
        </>
    )
}
