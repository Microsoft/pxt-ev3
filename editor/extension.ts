/// <reference path="../node_modules/pxt-core/built/pxteditor.d.ts" />

// When require()d from node, bind the global pxt namespace
namespace pxt {
    export const dummyExport = 1;
}
eval("if (typeof process === 'object' && process + '' === '[object process]') pxt = global.pxt")

namespace pxt.editor {
    import UF2 = pxtc.UF2;

    // this comes from aux/pxt.lms
    const rbfTemplate = `
4c45474f580000006d000100000000001c000000000000000e000000821b038405018130813e8053
74617274696e672e2e2e0084006080XX00448581644886488405018130813e80427965210084000a
`

    function hf2Async() {
        return pxt.HF2.mkPacketIOAsync()
            .then(h => {
                let w = new Ev3Wrapper(h)
                return w.reconnectAsync(true)
                    .then(() => w)
            })
    }

    let noHID = false

    let initPromise: Promise<Ev3Wrapper>
    function initAsync() {
        const forceHexDownload = /forceHexDownload/i.test(window.location.href);
        if (!initPromise && Cloud.isLocalHost() && Cloud.localToken && !forceHexDownload)
            initPromise = hf2Async()
                .catch(err => {
                    initPromise = null
                    noHID = true
                    return Promise.reject(err)
                })
        return initPromise
    }

    export function deployCoreAsync(resp: pxtc.CompileResult, isCli = false) {
        let w: Ev3Wrapper

        let filename = resp.downloadFileBaseName || "pxt"
        filename = filename.replace(/^lego-/, "")

        let fspath = "../prjs/BrkProg_SAVE/"

        let elfPath = fspath + filename + ".elf"
        let rbfPath = fspath + filename + ".rbf"

        let rbfHex = rbfTemplate
            .replace(/\s+/g, "")
            .replace("XX", U.toHex(U.stringToUint8Array(elfPath)))
        let rbfBIN = U.fromHex(rbfHex)
        HF2.write16(rbfBIN, 4, rbfBIN.length)

        let origElfUF2 = UF2.parseFile(U.stringToUint8Array(atob(resp.outfiles[pxt.outputName()])))

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
            if (isCli || !pxt.commands.saveOnlyAsync) {
                return Promise.resolve()
            } else {
                return pxt.commands.saveOnlyAsync(resp)
            }
        }

        if (noHID) return saveUF2Async()

        return initAsync()
            .then(w_ => {
                w = w_
                if (w.isStreaming)
                    U.userError("please stop the program first")
                return w.stopAsync()
            })
            .then(() => w.rmAsync(elfPath))
            .then(() => w.flashAsync(elfPath, UF2.readBytes(origElfUF2, 0, origElfUF2.length * 256)))
            .then(() => w.flashAsync(rbfPath, rbfBIN))
            .then(() => w.runAsync(rbfPath))
            .then(() => {
                if (isCli)
                    return w.disconnectAsync()
                else
                    return Promise.resolve()
                //return Promise.delay(1000).then(() => w.dmesgAsync())
            }).catch(e => {
                // if we failed to initalize, retry
                if (noHID)
                    return saveUF2Async()
                else
                    return Promise.reject(e)
            })
    }

    initExtensionsAsync = function (opts: pxt.editor.ExtensionOptions): Promise<pxt.editor.ExtensionResult> {
        pxt.debug('loading pxt-ev3 target extensions...')
        const res: pxt.editor.ExtensionResult = {
            deployCoreAsync,
        };
        initAsync()
        /*
            .then(w => w.streamFileAsync("/tmp/serial.txt", buf => {
                let str = Util.fromUTF8(Util.uint8ArrayToString(buf))
                
            }))
        */
        return Promise.resolve<pxt.editor.ExtensionResult>(res);
    }
}
