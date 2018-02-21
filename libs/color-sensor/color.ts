const enum ColorSensorMode {
    None = -1,
    //% block="reflected light intensity"
    ReflectedLightIntensity = 0,
    //% block="ambient light intensity"
    AmbientLightIntensity = 1,
    //% block="color"
    Color = 2,
    RefRaw = 3,
    RgbRaw = 4,
    ColorCal = 5,
}

enum LightIntensityMode {
    //% block="reflected light"
    Reflected = ColorSensorMode.ReflectedLightIntensity,
    //% block="ambient light"
    Ambient = ColorSensorMode.AmbientLightIntensity
}

const enum ColorSensorColor {
    //% block="none" jres=colors.none blockIdentity=sensors.color
    None,
    //% block="black" jres=colors.black blockIdentity=sensors.color
    Black,
    //% block="blue" jres=colors.blue blockIdentity=sensors.color
    Blue,
    //% block="green" jres=colors.green blockIdentity=sensors.color
    Green,
    //% block="yellow" jres=colors.yellow blockIdentity=sensors.color
    Yellow,
    //% block="red" jres=colors.red blockIdentity=sensors.color
    Red,
    //% block="white" jres=colors.white blockIdentity=sensors.color
    White,
    //% block="brown" jres=colors.brown blockIdentity=sensors.color
    Brown
}

enum LightCondition {
    //% block="dark"
    Dark = sensors.ThresholdState.Low,
    //$ block="bright"
    Bright = sensors.ThresholdState.High
}

namespace sensors {

    /**
     * The color sensor is a digital sensor that can detect the color or intensity
     * of light that enters the small window on the face of the sensor.
     */
    //% fixedInstances
    export class ColorSensor extends internal.UartSensor {
        thresholdDetector: sensors.ThresholdDetector;
        calibrating: boolean;

        constructor(port: number) {
            super(port)
            this._setMode(ColorSensorMode.None);
            this.thresholdDetector = new sensors.ThresholdDetector(this.id());
            this.calibrating = false;
        }

        _colorEventValue(value: number) {
            return 0xff00 | value;
        }

        _deviceType() {
            return DAL.DEVICE_TYPE_COLOR
        }

        setMode(m: ColorSensorMode) {
            if (m == ColorSensorMode.AmbientLightIntensity) {
                this.thresholdDetector.setLowThreshold(5);
                this.thresholdDetector.setHighThreshold(20);
            } else {
                this.thresholdDetector.setLowThreshold(20);
                this.thresholdDetector.setHighThreshold(80);
            }
            this._setMode(m)
        }

        /**
         * Gets the current color mode
         */
        colorMode() {
            return <ColorSensorMode>this.mode;
        }

        _query() {
            if (this.mode == ColorSensorMode.Color
                || this.mode == ColorSensorMode.AmbientLightIntensity
                || this.mode == ColorSensorMode.ReflectedLightIntensity)
                return this.getNumber(NumberFormat.UInt8LE, 0)
            return 0
        }

        _update(prev: number, curr: number) {
            if (this.calibrating) return; // simply ignore data updates while calibrating
            if (this.mode == ColorSensorMode.Color)
                control.raiseEvent(this._id, this._colorEventValue(curr));
            else
                this.thresholdDetector.setLevel(curr);
        }

        /**
         * Registers code to run when the given color is detected.
         * @param color the color to detect, eg: ColorSensorColor.Blue
         * @param handler the code to run when detected
         */
        //% help=sensors/color-sensor/on-color-detected
        //% block="on %sensor|detected color %color"
        //% blockId=colorOnColorDetected
        //% parts="colorsensor"
        //% blockNamespace=sensors
        //% sensor.fieldEditor="ports"
        //% weight=100 blockGap=12
        //% group="Color Sensor"
        //% color.fieldEditor="gridpicker"
        //% color.fieldOptions.columns=4 
        //% color.fieldOptions.tooltips=true
        //% color.fieldOptions.hideRect=true
        //% color.fieldOptions.width=268
        onColorDetected(color: ColorSensorColor, handler: () => void) {
            this.setMode(ColorSensorMode.Color)
            const v = this._colorEventValue(<number>color);
            control.onEvent(this._id, v, handler);
            if (this.color() == color)
                control.raiseEvent(this._id, v);
        }

        /**
         * Waits for the given color to be detected
         * @param color the color to detect
         */
        //% help=sensors/color-sensor/pause-for-color
        //% block="pause %sensor|for color %color"
        //% blockId=colorPauseForColorDetected
        //% parts="colorsensor"
        //% blockNamespace=sensors
        //% sensor.fieldEditor="ports"
        //% weight=99 blockGap=8
        //% group="Color Sensor"
        //% color.fieldEditor="gridpicker"
        //% color.fieldOptions.columns=4 
        //% color.fieldOptions.tooltips=true
        //% color.fieldOptions.hideRect=true
        //% color.fieldOptions.width=268
        pauseForColor(color: ColorSensorColor) {
            this.setMode(ColorSensorMode.Color);
            if (this.color() != color) {
                const v = this._colorEventValue(<number>color);
                control.waitForEvent(this._id, v);
            }
        }

        /**
         * Get the current color from the color sensor.
         * @param sensor the color sensor to query the request
         */
        //% help=sensors/color-sensor/color
        //% block="%sensor| color"
        //% blockId=colorGetColor
        //% parts="colorsensor"
        //% blockNamespace=sensors
        //% sensor.fieldEditor="ports"
        //% weight=98
        //% group="Color Sensor"
        //% blockGap=8
        color(): ColorSensorColor {
            this.setMode(ColorSensorMode.Color)
            return this.getNumber(NumberFormat.UInt8LE, 0)
        }

        /**
         * Registers code to run when the ambient light changes.
         * @param condition the light condition
         * @param handler the code to run when detected
         */
        //% help=sensors/color-sensor/on-light-changed
        //% block="on %sensor|%mode|%condition"
        //% blockId=colorOnLightChanged
        //% parts="colorsensor"
        //% blockNamespace=sensors
        //% sensor.fieldEditor="ports"
        //% weight=89 blockGap=12
        //% group="Color Sensor"
        onLightChanged(mode: LightIntensityMode, condition: LightCondition, handler: () => void) {
            this.setMode(<ColorSensorMode><number>mode)
            control.onEvent(this._id, <number>condition, handler);
        }

        /**
         * Wait for the given color to be detected
         * @param color the color to detect
         */
        //% help=sensors/color-sensor/pause-for-light
        //% block="pause %sensor|for %mode|%condition"
        //% blockId=colorPauseForLight
        //% parts="colorsensor"
        //% blockNamespace=sensors
        //% sensor.fieldEditor="ports"
        //% weight=88 blockGap=8
        //% group="Color Sensor"
        pauseForLight(mode: LightIntensityMode, condition: LightCondition) {
            this.setMode(<ColorSensorMode><number>mode)
            if (this.thresholdDetector.state != <number>condition)
                control.waitForEvent(this._id, <number>condition)
        }

        /**
         * Measure the ambient or reflected light value from 0 (darkest) to 100 (brightest).
         * @param sensor the color sensor port
         */
        //% help=sensors/color-sensor/light
        //% block="%sensor|%mode"
        //% blockId=colorLight
        //% parts="colorsensor"
        //% blockNamespace=sensors
        //% sensor.fieldEditor="ports"
        //% weight=87
        //% group="Color Sensor"
        light(mode: LightIntensityMode) {
            this.setMode(<ColorSensorMode><number>mode)
            return this.getNumber(NumberFormat.UInt8LE, 0)
        }

        //%
        ambientLight() {
            return this.light(LightIntensityMode.Ambient);
        }

        //%
        reflectedLight() {
            return this.light(LightIntensityMode.Reflected);
        }

        /**
         * Set a threshold value
         * @param condition the dark or bright light condition
         * @param value the value threshold
         */
        //% blockId=colorSetThreshold block="set %sensor|%condition|to %value"
        //% group="Threshold" blockGap=8 weight=90
        //% value.min=0 value.max=100
        //% sensor.fieldEditor="ports"
        setThreshold(condition: LightCondition, value: number) {
            if (condition == LightCondition.Dark)
                this.thresholdDetector.setLowThreshold(value)
            else
                this.thresholdDetector.setHighThreshold(value);
        }

        /**
         * Get a threshold value
         * @param condition the light condition
         */
        //% blockId=colorGetThreshold block="%sensor|%condition"
        //% group="Threshold" blockGap=8 weight=89
        //% sensor.fieldEditor="ports"
        threshold(condition: LightCondition): number {
            return this.thresholdDetector.threshold(<ThresholdState><number>LightCondition.Dark);
        }

        /**
         * Collects measurement of the light condition and adjusts the threshold to 10% / 90%.
         */
        //% blockId=colorCalibrateLight block="calibrate|%sensor|for %mode|light"
        //% group="Threshold" weight=91 blockGap=8
        //% sensor.fieldEditor="ports"
        calibrateLight(mode: LightIntensityMode, deviation: number = 8) {
            this.calibrating = true; // prevent events

            this.light(mode); // trigger a read
            pauseUntil(() => this.isActive()); // ensure sensor is live


            let vold = 0;
            let vcount = 0;
            let min = 200;
            let max = -200;
            let k = 0;
            while (k++ < 1000 && vcount < 50) {
                let v = this.light(mode);
                min = Math.min(min, v);
                max = Math.max(max, v);
                // detect if nothing has changed and stop calibration
                if (Math.abs(v - vold) <= 2)
                    vcount++;
                else {
                    vold = v;
                    vcount = 1;
                }

                // wait a bit
                pause(50);
            }

            // apply tolerance
            const minDist = 10;
            min = Math.max(minDist / 2, Math.min(min + deviation / 2, max - deviation / 2 - minDist / 2));
            max = Math.min(100 - minDist / 2, Math.max(min + minDist, max - deviation / 2));

            // apply thresholds
            this.thresholdDetector.setLowThreshold(min);
            this.thresholdDetector.setHighThreshold(max);

            this.calibrating = false;
        }

    }

    /**
     * Returns a color that the sensor can detect
     */
    //% shim=TD_ID
    //% blockId=colorSensorColor block="color %color"
    //% group="Color Sensor"
    //% weight=97
    //% help=sensors/color
    //% color.fieldEditor="gridpicker"
    //% color.fieldOptions.columns=4 
    //% color.fieldOptions.tooltips=true
    //% color.fieldOptions.hideRect=true
    //% color.fieldOptions.width=268
    export function color(color: ColorSensorColor): ColorSensorColor {
        return color;
    }

    //% whenUsed block="color 3" weight=95 fixedInstance jres=icons.port3
    export const color3: ColorSensor = new ColorSensor(3)

    //% whenUsed block="color 1" weight=90 fixedInstance jres=icons.port1
    export const color1: ColorSensor = new ColorSensor(1)

    //% whenUsed block="color 2" weight=90 fixedInstance jres=icons.port2
    export const color2: ColorSensor = new ColorSensor(2)

    //% whenUsed block="color 4" weight=90 fixedInstance jres=icons.port4
    export const color4: ColorSensor = new ColorSensor(4)
}
