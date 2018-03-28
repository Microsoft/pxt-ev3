/**
 * Tagged image literal converter
 */
//% shim=@f4 helper=image::ofBuffer
//% groups=["0.,","1#*"]
function img(lits: any, ...args: any[]): Image { return null }

let screen = image.create(DAL.LCD_WIDTH, DAL.LCD_HEIGHT)

namespace _screen_internal {
    //% shim=pxt::updateScreen
    function updateScreen(img: Image): void { }
    //% shim=pxt::updateStats
    function updateStats(msg: string): void { }

    control.setupScreenRefresh(() => updateScreen(screen))

    export function _stats(msg: string) {
        updateStats(msg)
    }
}

namespace brick {
    export const LINE_HEIGHT = 12;

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
        screen.print(text, offset, y);
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

    /**
     * Show an image on the screen
     * @param image image to draw
     */
    //% blockId=screen_show_image block="show image %image=screen_image_picker"
    //% weight=100 group="Screen" blockGap=8
    //% help=brick/show-image
    export function showImage(image: Image) {
        if (!image) return;
        screen.drawImage(image, 0, 0)
    }

    /**
    * Display the sensor and motor states attached to ports   
    */
    //% blockId=brickShowPorts block="show ports"
    //% help=brick/show-ports blockGap=8
    //% weight=10 group="Screen"
    export function showPorts() {
        const col = 44;
        clearScreen();

        function scale(x: number) {
            if (Math.abs(x) > 1000) return Math.round(x / 100) / 10 + "k";
            return ("" + (x >> 0));
        }

        // motors
        const datas = motors.getAllMotorData();
        for (let i = 0; i < datas.length; ++i) {
            const data = datas[i];
            if (!data.actualSpeed && !data.count) continue;
            const x = i * col;
            screen.print("ABCD"[i], x, brick.LINE_HEIGHT)
            screen.print(`${scale(data.actualSpeed)}%`, x, 2* brick.LINE_HEIGHT)
            screen.print(`${scale(data.count)}>`, x, 3 * brick.LINE_HEIGHT)
        }

        // sensors
        const sis = sensors.internal.getActiveSensors();
        for (let i = 0; i < sis.length; ++i) {
            const si = sis[i];
            const x = (si.port() - 1) * col;
            const inf = si._info();
            screen.print(si.port() + "", x, 8 * brick.LINE_HEIGHT)
            screen.print(inf, x, 9 * brick.LINE_HEIGHT)
        }
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
    //% help=brick/clear-screen weight=1
    export function clearScreen() {
        screen.fill(0)
    }
}