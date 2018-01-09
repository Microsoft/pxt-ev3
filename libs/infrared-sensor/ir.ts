const enum IrSensorMode {
    None = -1,
    Proximity = 0,
    Seek = 1,
    RemoteControl = 2,
}

const enum IrRemoteChannel {
    Ch0 = 0, // top
    Ch1 = 1,
    Ch2 = 2,
    Ch3 = 3,
}

const enum IrRemoteButton {
    None = 0x00,
    CenterBeacon = 0x01,
    TopLeft = 0x02,
    BottomLeft = 0x04,
    TopRight = 0x08,
    BottomRight = 0x10,
}

const enum InfraredSensorEvent {
    //% block="object near"
    ObjectNear = 1,
    //% block="object detected"
    ObjectDetected = 2
}

namespace sensors {
    function mapButton(v: number) {
        switch (v) {
            case 0: return IrRemoteButton.None
            case 1: return IrRemoteButton.TopLeft
            case 2: return IrRemoteButton.BottomLeft
            case 3: return IrRemoteButton.TopRight
            case 4: return IrRemoteButton.TopRight | IrRemoteButton.BottomRight
            case 5: return IrRemoteButton.TopLeft | IrRemoteButton.TopRight
            case 6: return IrRemoteButton.TopLeft | IrRemoteButton.BottomRight
            case 7: return IrRemoteButton.BottomLeft | IrRemoteButton.TopRight
            case 8: return IrRemoteButton.BottomLeft | IrRemoteButton.BottomRight
            case 9: return IrRemoteButton.CenterBeacon
            case 10: return IrRemoteButton.BottomLeft | IrRemoteButton.TopLeft
            case 11: return IrRemoteButton.TopRight | IrRemoteButton.BottomRight
            default: return IrRemoteButton.None
        }
    }

    let buttons: RemoteInfraredBeaconButton[]

    function create(ir: InfraredSensor) {
        // it's created by referencing it
    }

    export function irButton(id: IrRemoteButton): RemoteInfraredBeaconButton {
        if (buttons == null) {
            buttons = []
            for (let i = 0; i < 5; ++i) {
                buttons.push(new RemoteInfraredBeaconButton(new brick.Button()))
            }

            // make sure sensors are up
            create(infraredSensor1)
            create(infraredSensor2)
            create(infraredSensor3)
            create(infraredSensor4)
        }

        let num = -1
        while (id) {
            id >>= 1;
            num++;
        }
        num = Math.clamp(0, buttons.length - 1, num)
        return buttons[num]
    }

    //% fixedInstances
    export class RemoteInfraredBeaconButton extends control.Component {
        private button: brick.Button;
        constructor(button: brick.Button) {
            super();
            this.button = button;
        }

        _update(curr: boolean) {
            this.button._update(curr);
        }

        /**
         * Check if a remote button is currently pressed or not.
         * @param button the remote button to query the request
         */
        //% help=input/remote-infrared-beacon/is-pressed
        //% block="%button|is pressed"
        //% blockId=remoteButtonIsPressed
        //% parts="remote"
        //% blockNamespace=sensors
        //% weight=81 blockGap=8
        //% group="Remote Infrared Beacon"
        isPressed() {
            return this.button.isPressed();
        }

        /**
         * See if the remote button was pressed again since the last time you checked.
         * @param button the remote button to query the request
         */
        //% help=input/remote-infrared-beacon/was-pressed
        //% block="%button|was pressed"
        //% blockId=remotebuttonWasPressed
        //% parts="remote"
        //% blockNamespace=sensors
        //% weight=80
        //% group="Remote Infrared Beacon"
        wasPressed() {
            return this.button.wasPressed();
        }

        /**
         * Do something when a button or sensor is clicked, up or down
         * @param button the button that needs to be clicked or used
         * @param event the kind of button gesture that needs to be detected
         * @param body code to run when the event is raised
         */
        //% help=input/remote-infrared-beacon/on-event
        //% blockId=remotebuttonEvent block="on %button|%event"
        //% parts="remote"
        //% blockNamespace=sensors
        //% weight=99 blockGap=8
        //% group="Remote Infrared Beacon"
        onEvent(ev: ButtonEvent, body: () => void) {
            this.button.onEvent(ev, body);
        }
    }

    //% fixedInstances
    export class InfraredSensor extends internal.UartSensor {
        private channel: IrRemoteChannel;
        private proximityThreshold: sensors.internal.ThresholdDetector;

        constructor(port: number) {
            super(port)
            this.channel = IrRemoteChannel.Ch0
            this.proximityThreshold = new sensors.internal.ThresholdDetector(this._id, 0, 100, 10, 90);
            irButton(0) // make sure buttons array is initalized

            // and set the mode, as otherwise button events won't work
            this.mode = IrSensorMode.RemoteControl;
        }

        _query() {
            if (this.mode == IrSensorMode.RemoteControl)
                return mapButton(this.getNumber(NumberFormat.UInt8LE, this.channel));
            else if (this.mode == IrSensorMode.Proximity) {
                return this.getNumber(NumberFormat.UInt16LE, 0) & 0x0fff;
            }
            return 0
        }

        _update(prev: number, curr: number) {
            if (this.mode == IrSensorMode.RemoteControl) {
                for (let i = 0; i < buttons.length; ++i) {
                    let v = !!(curr & (1 << i))
                    buttons[i]._update(v)
                }
            } else if (this.mode == IrSensorMode.Proximity) {
                this.proximityThreshold.setLevel(curr);
            }
        }

        _deviceType() {
            return DAL.DEVICE_TYPE_IR
        }

        setRemoteChannel(c: IrRemoteChannel) {
            c = Math.clamp(0, 3, c | 0)
            this.channel = c
            this.setMode(IrSensorMode.RemoteControl)
        }

        setMode(m: IrSensorMode) {
            this._setMode(m)
        }

        /**
         * Registers code to run when an object is getting near.
         * @param handler the code to run when detected
         */
        //% help=input/infrared/on
        //% block="on %sensor|%event"
        //% blockId=infraredOn
        //% parts="infraredsensor"
        //% blockNamespace=sensors
        //% weight=100 blockGap=8
        //% group="Infrared Sensor"
        onEvent(event: InfraredSensorEvent, handler: () => void) {
            control.onEvent(this._id, event, handler);
        }

        /**
         * Waits for the event to occur
         */
        //% help=input/ultrasonic/wait
        //% block="pause until %sensor| %event"
        //% blockId=infraredwait
        //% parts="infraredsensor"
        //% blockNamespace=sensors
        //% weight=99 blockGap=8
        //% group="Infrared Sensor"
        pauseUntil(event: InfraredSensorEvent) {
            control.waitForEvent(this._id, event);
        }

        /**
         * Get the promixity measured by the infrared sensor, from ``0`` (close) to ``100`` (far)
         * @param sensor the infrared sensor
         */
        //% help=input/infrared/proximity
        //% block="%sensor|proximity"
        //% blockId=infraredGetProximity
        //% parts="infrared"
        //% blockNamespace=sensors
        //% weight=65 blockGap=8   
        //% group="Infrared Sensor"     
        proximity(): number {
            this._setMode(IrSensorMode.Proximity)
            return this.getNumber(NumberFormat.UInt8LE, 0)
        }

        /**
         * Get the remote commandreceived the infrared sensor.
         * @param sensor the infrared sensor
         */
        //% help=input/infrared/remote-command
        //% block="%sensor|remote command"
        //% blockId=infraredGetRemoteCommand
        //% parts="infrared"
        //% blockNamespace=sensors
        //% weight=65       
        //% group="Infrared Sensor"     
        remoteCommand(): number {
            this._setMode(IrSensorMode.RemoteControl)
            return this.getNumber(NumberFormat.UInt8LE, this.channel)
        }

        // TODO
        getDirectionAndDistance() {
            this._setMode(IrSensorMode.Seek)
            return this.getNumber(NumberFormat.UInt16LE, this.channel * 2)
        }


        /**
         * Sets a threshold value
         * @param condition the dark or bright light condition
         * @param value the value threshold
         */
        //% blockId=irSetThreshold block="set %condition|to %value"
        //% group="Threshold" blockGap=8
        setThreshold(condition: InfraredSensorEvent, value: number) {
            if (condition == InfraredSensorEvent.ObjectNear)
                this.proximityThreshold.setLowThreshold(value)
            else
                this.proximityThreshold.setHighThreshold(value);
        }
    }

    //% fixedInstance whenUsed block="infrared 1" jres=icons.port1
    export const infraredSensor1: InfraredSensor = new InfraredSensor(1)

    //% fixedInstance whenUsed block="infrared 2" jres=icons.port2
    export const infraredSensor2: InfraredSensor = new InfraredSensor(2)

    //% fixedInstance whenUsed block="infrared 3" jres=icons.port3
    export const infraredSensor3: InfraredSensor = new InfraredSensor(3)

    //% fixedInstance whenUsed block="infrared 4" jres=icons.port4
    export const infraredSensor4: InfraredSensor = new InfraredSensor(4)


    /**
     * Remote beacon (center) button.
     */
    //% whenUsed block="center" weight=95 fixedInstance
    export const remoteButtonCenter = irButton(IrRemoteButton.CenterBeacon)

    /**
     * Remote top-left button.
     */
    //% whenUsed block="top-left" weight=95 fixedInstance
    export const remoteButtonTopLeft = irButton(IrRemoteButton.TopLeft)

    /**
     * Remote top-right button.
     */
    //% whenUsed block="top-right" weight=95 fixedInstance
    export const remoteButtonTopRight = irButton(IrRemoteButton.TopRight)

    /**
     * Remote bottom-left button.
     */
    //% whenUsed block="bottom-left" weight=95 fixedInstance
    export const remoteButtonBottomLeft = irButton(IrRemoteButton.BottomLeft)

    /**
     * Remote bottom-right button.
     */
    //% whenUsed block="bottom-right" weight=95 fixedInstance
    export const remoteButtonBottomRight = irButton(IrRemoteButton.BottomRight)
}
