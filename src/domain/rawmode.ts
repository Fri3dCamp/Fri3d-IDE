/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import type { Transport } from './transports'

export class MpRawMode {
    declare port: Transport
    // Assigned by enterRawRepl(); exits raw REPL and releases the transaction
    declare end: () => Promise<void>

    constructor(port: Transport) {
        this.port = port
    }

    static async begin(port: Transport, soft_reboot=false, interruptTimeout=20000) {
        const res = new MpRawMode(port)
        await res.enterRawRepl(soft_reboot, interruptTimeout)
        try {
            await res.exec(`import sys,os`)
        } catch (err) {
            await res.end()
            throw err
        }
        return res
    }

    async interruptProgram(timeout=20000) {
        const endTime = Date.now() + timeout
        while (timeout <= 0 || (Date.now() < endTime)) {
            await this.port.write('\x03')   // Ctrl-C: interrupt any running program
            try {
                const banner = await this.port.readUntil(['>>> ', '--> '], 500)
                if (this.port.prevRecvCbk && !['>>> ', '--> '].some(p => banner === '\r\n' + p)) {
                    this.port.prevRecvCbk(banner)
                }
                await this.port.flushInput()
                return
            } catch (_err) {
                // timeout is expected during retry, ignore
            }
        }
        throw new Error('Board is not responding')
    }

    async enterRawRepl(soft_reboot=false, interruptTimeout=20000) {
        const release = await this.port.startTransaction()
        try {
            await this.interruptProgram(interruptTimeout)

            for (let attempt = 0; attempt < 3; attempt++) {
                await this.port.flushInput()
                await this.port.write('\r\x01')       // Ctrl-A: enter raw REPL
                try {
                    await this.port.readUntil('raw REPL; CTRL-B to exit\r\n')
                    break
                } catch (_err) {
                    if (attempt === 2) { throw _err }
                }
            }

            if (soft_reboot) {
                await this.port.write('\x04\x03') // soft reboot in raw mode
                await this.port.readUntil('raw REPL; CTRL-B to exit\r\n')
            }

            this.end = async () => {
                try {
                    await this.port.write('\x02')     // Ctrl-B: exit raw REPL
                    await this.port.readUntil('>\r\n')
                    await this.port.readUntil(['>>> ', '--> '])
                } finally {
                    release()
                }
            }
        } catch (err) {
            release()
            //report("Cannot enter RAW mode", err)
            throw err
        }
    }

    async exec(cmd: string, timeout=5000, emit=false): Promise<string> {
        await this.port.readUntil('>')
        await this.port.write(cmd)
        await this.port.write('\x04')         // Ctrl-D: execute
        const status = await this.port.readExactly(2, timeout)
        if (status != 'OK') {
            throw new Error(status)
        }
        this.port.emit = emit
        if (emit) {
            this.port.prevRecvCbk!(this.port.receivedData)
        }
        const res = (await this.port.readUntil('\x04', timeout)).slice(0, -1)
        const err = (await this.port.readUntil('\x04', timeout)).slice(0, -1)

        if (err.length) {
            throw new Error(err)
        }

        return res
    }

    async readFile(fn: string) {
        const rsp = await this.exec(`
try:
 import binascii
 h=lambda x: binascii.hexlify(x).decode()
 h(b'')
except:
 h=lambda b: ''.join('{:02x}'.format(byte) for byte in b)
with open('${fn}','rb') as f:
 while 1:
  b=f.read(64)
  if not b:break
  print(h(b),end='')
`)
        if (rsp.length) {
            return new Uint8Array(rsp.match(/../g)!.map(h=>parseInt(h,16)))
        } else {
            return new Uint8Array()
        }
    }

    async writeFile(
        fn: string,
        data: any,
        chunk_size=128,
        direct=false,
        onProgress?: (sentBytes: number, totalBytes: number) => void,
    ) {
        console.log(`Writing ${fn}`)
        if (typeof data === 'string' || data instanceof String) {
            const encoder = new (TextEncoder as any)('utf-8')
            data = new Uint8Array(Array.from(encoder.encode(data)))
        }
        function hexlify(data: any) {
            return [...new Uint8Array(data)]
                .map(x => x.toString(16).padStart(2, '0'))
                .join('')
        }
        function repr(arr: any) {
            arr = new Uint8Array(arr)
            let result = "b'";
            for (const byte of arr) {
                if (byte >= 32 && byte <= 126) { // Printable ASCII range
                    if (byte === 92 || byte === 39) { // Escape backslash and single quote
                        result += '\\' + String.fromCharCode(byte);
                    } else {
                        result += String.fromCharCode(byte);
                    }
                } else {
                    result += '\\x' + byte.toString(16).padStart(2, '0');
                }
            }
            result += "'";
            return result;
        }
        // Temp file in the SAME directory as the target: cross-directory rename
        // fails on some VFS implementations (e.g. wasm virtual badge, errno 75).
        const dest = direct ? fn : `${fn}.viper.tmp`
        await this.exec(`
try:
 import binascii
 h=binascii.unhexlify
 h('')
except:
 h=lambda s: bytes(int(s[i:i+2], 16) for i in range(0, len(s), 2))
f=open('${dest}','wb')
w=lambda d: f.write(h(d))
o=f.write
`)

        const totalBytes = data.byteLength ?? 0
        onProgress?.(0, totalBytes)

        // Split into chunks and send
        for (let i = 0; i < data.byteLength; i += chunk_size) {
            const chunk = data.slice(i, i + chunk_size)
            const cmdHex = "w('" + hexlify(chunk) + "')"
            const cmdRepr = "o(" + repr(chunk) + ")"
            // Use the optimal command
            if (cmdHex.length < cmdRepr.length) {
                await this.exec(cmdHex)
            } else {
                await this.exec(cmdRepr)
            }
            const sent = Math.min(totalBytes, i + chunk.length)
            onProgress?.(sent, totalBytes)
        }
        if (direct) {
            await this.exec(`f.close()`)
        } else {
            await this.exec(`f.close()
try: os.remove('${fn}')
except: pass
try:
 os.rename('${dest}','${fn}')
except OSError:
 s=open('${dest}','rb')
 d=open('${fn}','wb')
 while True:
  b=s.read(256)
  if not b: break
  d.write(b)
 s.close()
 d.close()
 os.remove('${dest}')
`)
        }
    }

    async getDeviceInfo() {
        const rsp = await this.exec(`
try: u=os.uname()
except: u=('','','','',sys.platform)
try: v=sys.version.split(';')[1].strip()
except: v='MicroPython '+u[2]
mpy=getattr(sys.implementation, '_mpy', 0)
sp=':'.join(sys.path)
d=[u[4],u[2],u[0],v,mpy>>10,mpy&0xFF,(mpy>>8)&3,sp]
print('|'.join(str(x) for x in d))
`)
        let [machine, release, sysname, version, mpy_arch, mpy_ver, mpy_sub, sys_path]: any[] = rsp.trim().split('|')
        sys_path = sys_path.split(':')
        // See https://docs.micropython.org/en/latest/reference/mpyfiles.html
        try {
            mpy_arch = [null, 'x86', 'x64', 'armv6', 'armv6m', 'armv7m', 'armv7em', 'armv7emsp', 'armv7emdp', 'xtensa', 'xtensawin', 'rv32imc'][mpy_arch]
        } catch (_err) {
            mpy_arch = null
        }
        mpy_ver = parseInt(mpy_ver, 10)
        mpy_sub = parseInt(mpy_sub, 10)
        if (!mpy_ver) { mpy_ver = 'py' }
        return { machine, release, sysname, version, mpy_arch, mpy_ver, mpy_sub, sys_path }
    }


    async touchFile(fn: string) {
        await this.exec(`
f=open('${fn}','wb')
f.close()
`)
    }

    async makePath(path: string) {
        // TODO: remove error code 20 once it is fixed in wasm port
        await this.exec(`
p=''
for d in '${path}'.split('/'):
 if not d: continue
 p += '/'+d
 try: os.mkdir(p)
 except OSError as e:
  if e.args[0] not in (17, 20): raise
`)
    }

    async removeFile(path: string) {
        await this.exec(`
try:
 os.remove('${path}')
except OSError as e:
 if e.args[0] == 39:
  raise Exception('Directory not empty')
 else:
  raise
`)
    }

    async removeDir(path: string) {
        await this.exec(`
try:
 os.rmdir('${path}')
except OSError as e:
 if e.args[0] == 39:
  raise Exception('Directory not empty')
 else:
  raise
`)
    }

    async rename(oldPath: string, newPath: string) {
        await this.exec(`
try:
 os.stat('${newPath}')
 raise Exception('Target already exists')
except OSError:
 pass
os.rename('${oldPath}','${newPath}')
`)
    }

    async getFsStats(path='/') {
        const rsp = await this.exec(`
s = os.statvfs('${path}')
fs = s[1] * s[2]
ff = s[3] * s[0]
fu = fs - ff
print('%s|%s|%s'%(fu,ff,fs))
`)
        // fs_used, fs_free, fs_size
        return rsp.trim().split('|')
    }

    /** Single-level directory listing (cheap). Folders get size 0. */
    async listDir(path: string) {
        const p = path === '/' ? '' : path.replace(/\/$/, '')
        const rsp = await this.exec(`
p='${p}'
for n in os.listdir(p if p else '/'):
 if n in ('.', '..'): continue
 fn=p+'/'+n
 try: s=os.stat(fn)
 except: s=(0,)*7
 if s[0] & 0x4000: print('d|'+fn+'|0')
 else: print('f|'+fn+'|'+str(s[6]))
`)
        const result: any[] = []
        for (const line of rsp.split('\n')) {
            if (line === '') continue
            const [type, fullpath, size] = line.trim().split('|')
            const name = fullpath.split('/').pop()!
            if (name === '.' || name === '..') continue
            if (type === 'd') {
                result.push({ name, path: fullpath, content: [], loaded: false })
            } else {
                result.push({ name, path: fullpath, size: parseInt(size, 10) })
            }
        }
        return result
    }

    async walkFs() {
        const rsp = await this.exec(`
def walk(p):
 for n in os.listdir(p if p else '/'):
  if n in ('.', '..'): continue
  fn=p+'/'+n
  try: s=os.stat(fn)
  except: s=(0,)*7
  try:
   if s[0] & 0x4000 == 0:
    print('f|'+fn+'|'+str(s[6]))
   else:
    print('d|'+fn+'|'+str(s[6]))
    walk(fn)
  except:
   print('f|'+p+'/???|'+str(s[6]))
walk('')
`)

        const result: any[] = []
        // Build file tree
        for (const line of rsp.split('\n')) {
            if (line === '') continue
            let current = result
            const [type, fullpath, size] = line.trim().split('|')
            const path = fullpath.split('/')
            let file
            if (type == 'f') {
                file = path.pop()
            }
            for (const segment of path) {
                if (segment === '' || segment === '.' || segment === '..') continue
                const next = current.filter(x => x.name === segment && "content" in x)
                if (next.length) {
                    current = next[0].content
                } else {
                    const prev = current
                    current = []
                    prev.push({ name: segment, path: path.join('/'), content: current })
                }
            }
            if (type == 'f' && file && file !== '.' && file !== '..') {
                current.push({ name: file, path: fullpath, size: parseInt(size, 10) })
            }
        }
        return result
    }

    async readSysInfoMD() {
        return await this.exec(`
import gc
gc.collect()
mu = gc.mem_alloc()
mf = gc.mem_free()
ms = mu + mf
uname=os.uname()
p=print
def size_fmt(size):
 suffixes = ['B','KiB','MiB','GiB','TiB']
 i = 0
 while size > 1024 and i < len(suffixes)-1:
  i += 1
  size //= 1024
 return "%d%s" % (size, suffixes[i])
p('## Machine')
p('- Name: \`'+uname.machine+'\`')
try:
 gc.collect()
 import microcontroller as uc
 p('- CPU: \`%s @ %s MHz\`' % (sys.platform, uc.cpu.frequency // 1_000_000))
 p('- UID: \`%s\`' % (uc.cpu.uid.hex(),))
 p('- Temp.: \`%s °C\`' % (uc.cpu.temperature,))
 p('- Voltage: \`%s V\`' % (uc.cpu.voltage,))
except:
 try:
  gc.collect()
  import machine
  p('- CPU: \`%s @ %s MHz\`' % (sys.platform, machine.freq() // 1_000_000))
 except:
  p('- CPU: \`'+sys.platform+'\`')
p()
p('## System')
p('- Version: \`'+sys.version.split(";")[1].strip()+'\`')
if ms:
 p('- Memory use:  \`%s / %s, free: %d%%\`' % (size_fmt(mu), size_fmt(ms), (mf * 100) // ms))
`)
    }
}
