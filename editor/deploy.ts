/// <reference path="../node_modules/pxt-core/built/pxteditor.d.ts"/>
/// <reference path="../node_modules/pxt-core/built/pxtsim.d.ts"/>

import UF2 = pxtc.UF2;
import { Ev3Wrapper } from "./wrap";
import { bluetoothTryAgainAsync } from "./dialogs";

export let ev3: Ev3Wrapper;

export function debug() {
    return initHidAsync()
        .then(w => w.downloadFileAsync("/tmp/dmesg.txt", v => console.log(pxt.Util.uint8ArrayToString(v))))
}

class WebSerialPackageIO implements pxt.HF2.PacketIO {
    onData: (v: Uint8Array) => void;
    onError: (e: Error) => void;
    onEvent: (v: Uint8Array) => void;
    onSerial: (v: Uint8Array, isErr: boolean) => void;
    sendSerialAsync: (buf: Uint8Array, useStdErr: boolean) => Promise<void>;
    private _reader: any;
    private _writer: any;

    constructor(private port: SerialPort, private options: SerialOptions) {
        console.log(`serial: new io`)
    }

    async readSerialAsync() {
        this._reader = this.port.readable.getReader();
        let buffer: Uint8Array;
        const reader = this._reader;
        while (reader === this._reader) { // will change if we recycle the connection
            const { done, value } = await this._reader.read()
            if (!buffer) buffer = value;
            else { // concat
                let tmp = new Uint8Array(buffer.length + value.byteLength)
                tmp.set(buffer, 0)
                tmp.set(value, buffer.length)
                buffer = tmp;
            }
            if (buffer && buffer.length >= 6) {
                this.onData(new Uint8Array(buffer));
                buffer = undefined;
            }
        }
    }

    static isSupported(): boolean {
        return !!navigator.serial;
    }

    static portIos: WebSerialPackageIO[] = [];
    static async mkPacketIOAsync(): Promise<pxt.HF2.PacketIO> {
        const serial = navigator.serial;
        if (serial) {
            try {
                const port = await serial.requestPort();

                let io = WebSerialPackageIO.portIos.filter(i => i.port == port)[0];
                if (!io) {
                    const options: SerialOptions = {
                        baudRate: 460800,
                        bufferSize: 4096
                    };
                    io = new WebSerialPackageIO(port, options);
                    WebSerialPackageIO.portIos.push(io);
                }
                return io;
            } catch (e) {
                console.log(`connection error`, e)
            }
        }
        throw new Error("could not open serial port");
    }

    error(msg: string): any {
        console.error(msg);
        throw new Error(lf("error on brick ({0})", msg))
    }

    private openAsync() {
        console.log(`serial: opening port`)
        if (!!this._reader) return Promise.resolve();
        this._reader = undefined;
        this._writer = undefined;
        return this.port.open(this.options)
            .then(() => {
                this.readSerialAsync();
                return Promise.resolve();
            });
    }

    private async closeAsync() {
        // don't close port
        return Promise.delay(500);
    }

    reconnectAsync(): Promise<void> {
        return this.openAsync();
    }

    disconnectAsync(): Promise<void> {
        return this.closeAsync();
    }

    sendPacketAsync(pkt: Uint8Array): Promise<void> {
        if (!this._writer)
            this._writer = this.port.writable.getWriter();
        return this._writer.write(pkt);
    }
}

function hf2Async() {
    const pktIOAsync: Promise<pxt.HF2.PacketIO> = useWebSerial
        ? WebSerialPackageIO.mkPacketIOAsync() : pxt.HF2.mkPacketIOAsync()
    return pktIOAsync.then(h => {
        let w = new Ev3Wrapper(h)
        ev3 = w
        return w.reconnectAsync(true)
            .then(() => w)
    })
}

let useHID = false;
let useWebSerial = false;
export function initAsync(): Promise<void> {
    if (pxt.U.isNodeJS) {
        // doesn't seem to work ATM
        useHID = false
    } else {
        const nodehid = /nodehid/i.test(window.location.href);
        if (pxt.BrowserUtils.isLocalHost() && pxt.Cloud.localToken && nodehid)
            useHID = true;
    }

    if (WebSerialPackageIO.isSupported())
        pxt.tickEvent("webserial.supported");

    return Promise.resolve();
}

export function canUseWebSerial() {
    return WebSerialPackageIO.isSupported();
}

export function enableWebSerialAsync() {
    initPromise = undefined;
    useWebSerial = WebSerialPackageIO.isSupported();
    useHID = useWebSerial;
    if (useWebSerial)
        return initHidAsync().then(() => { });
    else return Promise.resolve();
}

function cleanupAsync() {
    if (ev3) {
        console.log('cleanup previous port')
        return ev3.disconnectAsync()
            .catch(e => { })
            .finally(() => { ev3 = undefined; });
    }
    return Promise.resolve();
}

let initPromise: Promise<Ev3Wrapper>
function initHidAsync() { // needs to run within a click handler
    if (initPromise)
        return initPromise
    if (useHID) {
        initPromise = cleanupAsync()
            .then(() => hf2Async())
            .catch(err => {
                console.error(err);
                initPromise = null
                useHID = false;
                useWebSerial = false;
                return Promise.reject(err);
            })
    } else {
        useHID = false
        useWebSerial = false;
        initPromise = Promise.reject(new Error("no HID"))
    }
    return initPromise;
}

// this comes from aux/pxt.lms
const fspath = "../prjs/BrkProg_SAVE/"
const rbfTemplate = `
4c45474f580000006d000100000000001c000000000000000e000000821b038405018130813e8053
74617274696e672e2e2e0084006080XX00448581644886488405018130813e80427965210084000a
`
export function deployCoreAsync(resp: pxtc.CompileResult) {
    let filename = resp.downloadFileBaseName || "pxt"
    filename = filename.replace(/^lego-/, "")

    let elfPath = fspath + filename + ".elf"
    let rbfPath = fspath + filename + ".rbf"

    let rbfHex = rbfTemplate
        .replace(/\s+/g, "")
        .replace("XX", pxt.U.toHex(pxt.U.stringToUint8Array(elfPath)))
    let rbfBIN = pxt.U.fromHex(rbfHex)
    pxt.HF2.write16(rbfBIN, 4, rbfBIN.length)

    let origElfUF2 = UF2.parseFile(pxt.U.stringToUint8Array(ts.pxtc.decodeBase64(resp.outfiles[pxt.outputName()])))

    let mkFile = (ext: string, data: Uint8Array = null) => {
        let f = UF2.newBlockFile()
        f.filename = "Projects/" + filename + ext
        if (data)
            UF2.writeBytes(f, 0, data)
        return f
    }

    let elfUF2 = mkFile(".elf")
    for (let b of origElfUF2) {
        UF2.writeBytes(elfUF2, b.targetAddr, b.data)
    }

    let r = UF2.concatFiles([elfUF2, mkFile(".rbf", rbfBIN)])
    let data = UF2.serializeFile(r)

    resp.outfiles[pxtc.BINARY_UF2] = btoa(data)

    let saveUF2Async = () => {
        if (pxt.commands && pxt.commands.electronDeployAsync) {
            return pxt.commands.electronDeployAsync(resp);
        }
        if (pxt.commands && pxt.commands.saveOnlyAsync) {
            return pxt.commands.saveOnlyAsync(resp);
        }
        return Promise.resolve();
    }

    if (!useHID) return saveUF2Async()

    pxt.tickEvent("webserial.flash");
    let w: Ev3Wrapper;
    return initHidAsync()
        .then(w_ => {
            w = w_
            if (w.isStreaming)
                pxt.U.userError("please stop the program first")
            return w.reconnectAsync(false)
                .catch(e => {
                    // user easily forgets to stop robot
                    bluetoothTryAgainAsync().then(() => w.disconnectAsync())
                        .then(() => Promise.delay(1000))
                        .then(() => w.reconnectAsync());

                    // nothing we can do
                    return Promise.reject(e);
                })
        })
        .then(() => w.stopAsync())
        .then(() => w.rmAsync(elfPath))
        .then(() => w.flashAsync(elfPath, UF2.readBytes(origElfUF2, 0, origElfUF2.length * 256)))
        .then(() => w.flashAsync(rbfPath, rbfBIN))
        .then(() => w.runAsync(rbfPath))
        .then(() => Promise.delay(500))
        .then(() => {
            pxt.tickEvent("webserial.success");
            return w.disconnectAsync()
            //return Promise.delay(1000).then(() => w.dmesgAsync())
        }).catch(e => {
            pxt.tickEvent("webserial.fail");
            useHID = false;
            useWebSerial = false;
            // if we failed to initalize, tell the user to retry
            return Promise.reject(e)
        })
}
