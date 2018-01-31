namespace brick {
    export const LINE_HEIGHT = 12;

    //% shim=screen::_setPixel
    function _setPixel(p0: uint32, p1: uint32, mode: Draw): void { }

    //% shim=screen::_blitLine
    function _blitLine(xw: uint32, y: uint32, buf: Buffer, mode: Draw): void { }

    function pack(x: number, y: number) {
        return Math.clamp(0, 512, x) | (Math.clamp(0, 512, y) << 16)
    }

    const ones = hex`ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`

    function setLineCore(x: number, x1: number, y: number, mode: Draw) {
        _blitLine(pack(x, x1 - x), y, ones, mode)
    }

    export interface Font {
        charWidth: number;
        charHeight: number;
        firstChar: number;
        data: Buffer;
    }
    let currFont: Font

    export function setFont(f: Font) {
        currFont = f
    }

    export const heart = screen.imageOf(hex`f007 367f7f3e1c08`)

    export function defaultFont(): Font {
        return {
            charWidth: 8,
            charHeight: 8,
            firstChar: 32,
            // source https://github.com/dhepper/font8x8
            data: hex`
0000000000000000 183C3C1818001800 3636000000000000 36367F367F363600 0C3E031E301F0C00 006333180C666300
1C361C6E3B336E00 0606030000000000 180C0606060C1800 060C1818180C0600 00663CFF3C660000 000C0C3F0C0C0000
00000000000C0C06 0000003F00000000 00000000000C0C00 6030180C06030100 3E63737B6F673E00 0C0E0C0C0C0C3F00
1E33301C06333F00 1E33301C30331E00 383C36337F307800 3F031F3030331E00 1C06031F33331E00 3F3330180C0C0C00
1E33331E33331E00 1E33333E30180E00 000C0C00000C0C00 000C0C00000C0C06 180C0603060C1800 00003F00003F0000
060C1830180C0600 1E3330180C000C00 3E637B7B7B031E00 0C1E33333F333300 3F66663E66663F00 3C66030303663C00
1F36666666361F00 7F46161E16467F00 7F46161E16060F00 3C66030373667C00 3333333F33333300 1E0C0C0C0C0C1E00
7830303033331E00 6766361E36666700 0F06060646667F00 63777F7F6B636300 63676F7B73636300 1C36636363361C00
3F66663E06060F00 1E3333333B1E3800 3F66663E36666700 1E33070E38331E00 3F2D0C0C0C0C1E00 3333333333333F00
33333333331E0C00 6363636B7F776300 6363361C1C366300 3333331E0C0C1E00 7F6331184C667F00 1E06060606061E00
03060C1830604000 1E18181818181E00 081C366300000000 00000000000000FF 0C0C180000000000 00001E303E336E00
0706063E66663B00 00001E3303331E00 3830303e33336E00 00001E333f031E00 1C36060f06060F00 00006E33333E301F
0706366E66666700 0C000E0C0C0C1E00 300030303033331E 070666361E366700 0E0C0C0C0C0C1E00 0000337F7F6B6300
00001F3333333300 00001E3333331E00 00003B66663E060F 00006E33333E3078 00003B6E66060F00 00003E031E301F00
080C3E0C0C2C1800 0000333333336E00 00003333331E0C00 0000636B7F7F3600 000063361C366300 00003333333E301F
00003F190C263F00 380C0C070C0C3800 1818180018181800 070C0C380C0C0700 6E3B000000000000 0000000000000000
`
        }
    }

    function setPixel(on: boolean, x: number, y: number) {
        x |= 0
        y |= 0
        if (0 <= x && x < DAL.LCD_WIDTH && 0 <= y && y < DAL.LCD_HEIGHT)
            _setPixel(x, y, on ? Draw.Normal : Draw.Clear)
    }

    /**
     * Show text on the screen at a specific line.
     * @param text the text to print on the screen, eg: "Hello world"
     * @param line the line number to print the text at, eg: 1
     */
    //% blockId=screen_print block="show string %text|at line %line"
    //% weight=98 group="Screen" inlineInputMode="inline" blockGap=8
    //% help=brick/show-string
    //% line.min=1 line.max=10
    export function showString(text: string, line: number) {
        const NUM_LINES = 9;
        const offset = 5;
        const y = offset + (Math.clamp(0, NUM_LINES, line - 1) / (NUM_LINES + 2)) * DAL.LCD_HEIGHT;
        brick.print(text, offset, y);
    }

    /**
     * Shows a number on the screen
     * @param value the numeric value
     * @param line the line number to print the text at, eg: 1
     */
    //% blockId=screenShowNumber block="show number %name|at line %line"
    //% weight=96 group="Screen" inlineInputMode="inline" blockGap=8
    //% help=brick/show-number
    //% line.min=1 line.max=10
    export function showNumber(value: number, line: number) {
        showString("" + value, line);
    }

    /**
     * Shows a name, value pair on the screen
     * @param value the numeric value
     * @param line the line number to print the text at, eg: 1
     */
    //% blockId=screenShowValue block="show value %name|= %text|at line %line"
    //% weight=96 group="Screen" inlineInputMode="inline" blockGap=8
    //% help=brick/show-value
    //% line.min=1 line.max=10
    export function showValue(name: string, value: number, line: number) {
        value = Math.round(value * 1000) / 1000;
        showString((name ? name + ": " : "") + value, line);        
    }

    export function print(text: string, x: number, y: number, mode = Draw.Normal) {
        x |= 0
        y |= 0
        if (!currFont) currFont = defaultFont()
        let x0 = x
        let cp = 0
        let byteWidth = (currFont.charWidth + 7) >> 3
        let charSize = byteWidth * currFont.charHeight
        let imgBuf = output.createBuffer(2 + charSize)
        let double = (mode & Draw.Quad) ? 4 : (mode & Draw.Double) ? 2 : 1
        imgBuf[0] = 0xf0
        imgBuf[1] = currFont.charWidth
        let img = screen.imageOf(imgBuf)
        while (cp < text.length) {
            let ch = text.charCodeAt(cp++)
            if (ch == 10) {
                y += double * currFont.charHeight + 2
                x = x0
            }
            if (ch < 32) continue
            let idx = (ch - currFont.firstChar) * charSize
            if (idx < 0 || idx + imgBuf.length - 1 > currFont.data.length)
                imgBuf.fill(0, 2)
            else
                imgBuf.write(2, currFont.data.slice(idx, charSize))
            img.draw(x, y, mode)
            x += double * currFont.charWidth
        }
    }

    /**
     * Show an image on the screen
     * @param image image to draw
     */
    //% blockId=screen_show_image block="show image %image=screen_image_picker"
    //% weight=100 group="Screen" blockGap=8
    //% help=brick/show-image
    export function showImage(image: Image) {
        if (!image) return;
        image.draw(0, 0, Draw.Normal);
    }

    /**
     * An image
     * @param image the image
     */
    //% blockId=screen_image_picker block="%image" shim=TD_ID
    //% image.fieldEditor="images"
    //% image.fieldOptions.columns=6
    //% image.fieldOptions.width=600
    //% group="Screen" weight=0 blockHidden=1
    export function __imagePicker(image: Image): Image {
        return image;
    }

    /**
     * Clear the screen
     */
    //% blockId=screen_clear_screen block="clear screen"
    //% weight=90 group="Screen"
    //% help=brick/clear-screen
    export function clearScreen() {
        screen.clear();
    }

    function drawRect(x: number, y: number, w: number, h: number, mode = Draw.Normal) {
        x |= 0;
        y |= 0;
        w |= 0;
        h |= 0;
        if (x < 0) {
            w += x;
            x = 0;
        }
        if (y < 0) {
            h += y;
            y = 0;
        }
        if (w <= 0)
            return;
        if (h <= 0)
            return;
        let x1 = Math.min(DAL.LCD_WIDTH, x + w);
        let y1 = Math.min(DAL.LCD_HEIGHT, y + h);
        if (w == 1) {
            while (y < y1)
                _setPixel(x, y++, mode);
            return;
        }

        setLineCore(x, x1, y++, mode);
        while (y < y1 - 1) {
            if (mode & Draw.Fill) {
                setLineCore(x, x1, y, mode);
            } else {
                _setPixel(x, y, mode);
                _setPixel(x1 - 1, y, mode);
            }
            y++;
        }
        if (y < y1)
            setLineCore(x, x1, y, mode);
    }

    /**
     * Print the port states on the screen
     */
    //% blockId=brickPrintPorts block="print ports"
    //% help=brick/print-ports
    //% weight=1 group="Screen"
    export function printPorts() {
        const col = 44;
        clearScreen();

        function scale(x: number) {
            if (Math.abs(x) > 1000) return Math.round(x / 100) / 10 + "k";
            return ("" + (x >> 0));
        }

        // motors
        const datas = motors.getAllMotorData();
        for(let i = 0; i < datas.length; ++i) {
            const data = datas[i];
            if (!data.actualSpeed && !data.count) continue;
            const x = i * col;
            print(`${scale(data.actualSpeed)}%`, x, brick.LINE_HEIGHT)
            print(`${scale(data.count)}>`, x, 2 * brick.LINE_HEIGHT)
            print(`${scale(data.tachoCount)}|`, x, 3 * brick.LINE_HEIGHT)
        }

        // sensors
        const sis = sensors.internal.getActiveSensors();
        for(let i =0; i < sis.length; ++i) {
            const si = sis[i];
            const x = (si.port() - 1) * col;
            const v = si._query();
            print(`${scale(v)}`, x, 9 * brick.LINE_HEIGHT)
        }
    }
}