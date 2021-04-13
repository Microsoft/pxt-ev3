enum Output {
    //% block="A"
    A = 0x01,
    //% block="B"
    B = 0x02,
    //% block="C"
    C = 0x04,
    //% block="D"
    D = 0x08,
    //% block="B+C"
    BC = Output.B | Output.C,
    //% block="A+B"
    AB = Output.A | Output.B,
    //% block="C+D"
    CD = Output.C | Output.D,
    //% block="A+D"
    AD = Output.A | Output.D,
    //% block="All"
    ALL = 0x0f
}

enum OutputType {
    None = 0,
    Tacho = 7,
    MiniTacho = 8,
}

enum MoveUnit {
    //% block="rotations"
    Rotations,
    //% block="degrees"
    Degrees,
    //% block="seconds"
    Seconds,
    //% block="milliseconds"
    MilliSeconds
}

enum MovePhase {
    //% block="acceleration"
    Acceleration,
    //% block="deceleration"
    Deceleration
}

namespace motors {
    let pwmMM: MMap
    let motorMM: MMap

    const enum MotorDataOff {
        TachoCounts = 0, // int32
        Speed = 4, // int8
        Padding = 5, // int8[3]
        TachoSensor = 8, // int32
        Size = 12
    }

    function init() {
        if (pwmMM) return
        pwmMM = control.mmap("/dev/lms_pwm", 0, 0)
        if (!pwmMM) control.fail("no PWM file")
        motorMM = control.mmap("/dev/lms_motor", MotorDataOff.Size * DAL.NUM_OUTPUTS, 0)
        if (!motorMM) control.fail("no motor file")

        resetAll()

        const buf = output.createBuffer(1)
        buf[0] = DAL.opProgramStart
        writePWM(buf)
    }

    /**
     * Sends a command to the motors device
     * @param buf the command buffer
     */
    //%
    export function writePWM(buf: Buffer): void {
        init()
        pwmMM.write(buf)
    }

    /**
     * Sends and receives a message from the motors device
     * @param buf message buffer
     */
    //%
    export function readPWM(buf: Buffer): void {
        init()
        pwmMM.read(buf);
    }

    /**
     * Allocates a message buffer
     * @param out ports
     * @param cmd command id
     * @param addSize required additional bytes
     */
    //%
    export function mkCmd(out: Output, cmd: number, addSize: number) {
        const b = output.createBuffer(2 + addSize)
        b.setNumber(NumberFormat.UInt8LE, 0, cmd)
        b.setNumber(NumberFormat.UInt8LE, 1, out)
        return b
    }

    export function outputToName(out: Output): string {
        let r = "";
        for (let i = 0; i < DAL.NUM_OUTPUTS; ++i) {
            if (out & (1 << i)) {
                if (r.length > 0) r += "+";
                r += "ABCD"[i];
            }
        }
        return r;
    }

    /**
     * Stops all motors
     */
    //% blockId=motorStopAll block="stop all motors"
    //% weight=2
    //% group="Move"
    //% help=motors/stop-all
    export function stopAll() {
        const b = mkCmd(Output.ALL, DAL.opOutputStop, 0)
        writePWM(b);
        control.cooperate();
    }

    /**
     * Resets all motors
     */
    //% blockId=motorResetAll block="reset all motors"
    //% weight=1
    //% group="Move"
    //% help=motors/reset-all
    export function resetAll() {
        reset(Output.ALL)
        control.cooperate();
    }

    interface MoveSchedule {
        speed: number;
        useSteps: boolean;
        steps: number[];
    }

    //% fixedInstances
    export class MotorBase extends control.Component {
        protected _port: Output;
        protected _portName: string;
        protected _brake: boolean;
        protected _regulated: boolean;
        private _pauseOnRun: boolean;
        private _initialized: boolean;
        private _brakeSettleTime: number;
        private _init: () => void;
        private _accelerationSteps: number;
        private _accelerationTime: number;
        private _decelerationSteps: number;
        private _decelerationTime: number;
        private _inverted: boolean;

        protected static output_types: number[] = [0x7, 0x7, 0x7, 0x7];

        constructor(port: Output, init: () => void) {
            super();
            this._port = port;
            this._portName = outputToName(this._port);
            this._brake = false;
            this._regulated = true;
            this._pauseOnRun = true;
            this._initialized = false;
            this._brakeSettleTime = 10;
            this._init = init;
            this._accelerationSteps = 0;
            this._accelerationTime = 0;
            this._decelerationSteps = 0;
            this._decelerationTime = 0;
            this._inverted = false;
        }

        /**
         * Lazy initialization code
         */
        protected init() {
            if (!this._initialized) {
                this._initialized = true;
                this._init();
            }
        }

        /**
         * Sets the automatic brake on or off when the motor is off
         * @param brake a value indicating if the motor should break when off
         */
        //% blockId=outputMotorSetBrakeMode block="set %motor|brake %brake=toggleOnOff"
        //% motor.fieldEditor="motors"
        //% weight=60 blockGap=8
        //% group="Properties"
        //% help=motors/motor/set-brake
        setBrake(brake: boolean) {
            this.init();
            this._brake = brake;
        }

        /**
         * Indicates to pause while a motor moves for a given distance or duration.
         * @param value true to pause; false to continue the program execution
         */
        //% blockId=outputMotorSetPauseMode block="set %motor|pause on run %brake=toggleOnOff"
        //% motor.fieldEditor="motors"
        //% weight=60 blockGap=8
        //% group="Properties"
        setPauseOnRun(value: boolean) {
            this.init();
            this._pauseOnRun = value;
        }

        /** 
         * Inverts the motor polarity
        */
        //% blockId=motorSetInverted block="set %motor|inverted %reversed=toggleOnOff"
        //% motor.fieldEditor="motors"
        //% weight=59 blockGap=8
        //% group="Properties"
        //% help=motors/motor/set-inverted
        setInverted(inverted: boolean) {
            this.init();
            this._inverted = inverted;
        }

        protected invertedFactor(): number {
            return this._inverted ? -1 : 1;
        }

        /** 
         * Set the settle time after braking in milliseconds (default is 10ms).
        */
        //% blockId=motorSetBrakeSettleTime block="set %motor|brake settle time %millis|ms"
        //% motor.fieldEditor="motors"
        //% weight=1 blockGap=8
        //% group="Properties"
        //% millis.defl=200 millis.min=0 millis.max=500
        //% help=motors/motor/set-brake-settle-time
        setBrakeSettleTime(millis: number) {
            this.init();
            // ensure in [0,500]
            this._brakeSettleTime = Math.max(0, Math.min(500, millis | 0))
        }

        /**
         * Stops the motor(s).
         */
        //% weight=6 blockGap=8
        //% group="Move"
        //% help=motors/motor/stop
        //% blockId=motorStop block="stop %motors|"
        //% motors.fieldEditor="motors"
        stop() {
            this.init();
            stop(this._port, this._brake);
            this.settle();
        }

        protected settle() {
            // if we've recently completed a motor command with brake
            // allow 500ms for robot to settle
            if (this._brake && this._brakeSettleTime > 0)
                pause(this._brakeSettleTime);
            else {
                control.cooperate();
            }
        }

        protected pauseOnRun(stepsOrTime: number) {
            if (stepsOrTime && this._pauseOnRun) {
                // wait till motor is done with this work
                this.pauseUntilReady();
                // allow robot to settle
                this.settle();
            } else {
                control.cooperate();
            }
        }

        /**
         * Resets the motor(s).
         */
        //% weight=5
        //% group="Move"
        //% help=motors/motor/reset
        //% blockId=motorReset block="reset %motors|"
        //% motors.fieldEditor="motors"
        reset() {
            this.init();
            reset(this._port);
        }

        private normalizeSchedule(speed: number, step1: number, step2: number, step3: number, unit: MoveUnit): MoveSchedule {
            // motor polarity is not supported at the firmware level for sync motor operations
            const r: MoveSchedule = {
                speed: Math.clamp(-100, 100, speed | 0) * this.invertedFactor(),
                useSteps: true,
                steps: [step1 || 0, step2 || 0, step3 || 0]
            }
            let scale = 1;
            switch (unit) {
                case MoveUnit.Rotations:
                    scale = 360;
                    r.useSteps = true;
                    if (r.steps[1] < 0) {
                        r.speed = -r.speed;
                        r.steps[1] = -r.steps[1];
                    }
                    break;
                case MoveUnit.Degrees:
                    r.useSteps = true;
                    if (r.steps[1] < 0) {
                        r.speed = -r.speed;
                        r.steps[1] = -r.steps[1];
                    }
                    break;
                case MoveUnit.Seconds:
                    scale = 1000;
                    r.useSteps = false;
                    break;
                default:
                    r.useSteps = false;
                    break;
            }
            for (let i = 0; i < r.steps.length; ++i)
                r.steps[i] = Math.max(0, (r.steps[i] * scale) | 0);
            return r;
        }

        /**
         * Runs the motor at a given speed for limited time or distance.
         * @param speed the speed from ``100`` full forward to ``-100`` full backward, eg: 50
         * @param value (optional) measured distance or rotation
         * @param unit (optional) unit of the value
         */
        //% blockId=motorRun block="run %motor at %speed=motorSpeedPicker|\\%||for %value %unit"
        //% weight=100 blockGap=8
        //% group="Move"
        //% motor.fieldEditor="motors"
        //% expandableArgumentMode=toggle
        //% help=motors/motor/run
        run(speed: number, value: number = 0, unit: MoveUnit = MoveUnit.MilliSeconds) {
            this.init();
            const schedule = this.normalizeSchedule(speed, 0, value, 0, unit);
            // stop if speed is 0
            if (!schedule.speed) {
                this.stop();
                return;
            }
            // special: 0 is infinity
            if (schedule.steps[0] + schedule.steps[1] + schedule.steps[2] == 0) {
                this._run(schedule.speed);
                control.cooperate();
                return;
            }

            // timed motor moves
            const steps = schedule.steps;
            const useSteps = schedule.useSteps;

            // compute ramp up and down
            steps[0] = (useSteps ? this._accelerationSteps : this._accelerationTime) || 0;
            steps[2] = (useSteps ? this._decelerationSteps : this._decelerationTime) || 0;
            if (steps[0] + steps[2] > steps[1]) {
                // rescale
                const r = steps[1] / (steps[0] + steps[2]);
                steps[0] = Math.floor(steps[0] * r);
                steps[2] *= Math.floor(steps[2] * r);
            }
            steps[1] -= (steps[0] + steps[2]);

            // send ramped command
            this._schedule(schedule);
            this.pauseOnRun(steps[0] + steps[1] + steps[2]);
        }

        /**
         * Schedules a run of the motor with an acceleration, constant and deceleration phase.
         * @param speed the speed from ``100`` full forward to ``-100`` full backward, eg: 50
         * @param value measured distance or rotation, eg: 500
         * @param unit (optional) unit of the value, eg: MoveUnit.MilliSeconds
         * @param acceleration acceleration phase measured distance or rotation, eg: 500
         * @param deceleration deceleration phase measured distance or rotation, eg: 500
         */
        //% blockId=motorSchedule block="ramp %motor at %speed=motorSpeedPicker|\\%|for %value|%unit||accelerate %acceleration|decelerate %deceleration"
        //% weight=99 blockGap=8
        //% group="Move"
        //% motor.fieldEditor="motors"
        //% help=motors/motor/ramp
        //% inlineInputMode=inline
        //% expandableArgumentMode=toggle
        //% value.defl=500
        ramp(speed: number, value: number = 500, unit: MoveUnit = MoveUnit.MilliSeconds, acceleration?: number, deceleration?: number) {
            this.init();
            const schedule = this.normalizeSchedule(speed, acceleration, value, deceleration, unit);
            // stop if speed is 0
            if (!schedule.speed) {
                this.stop();
                return;
            }
            // special case: do nothing
            if (schedule.steps[0] + schedule.steps[1] + schedule.steps[2] == 0) {
                return;
            }
            // timed motor moves
            const steps = schedule.steps;
            // send ramped command
            this._schedule(schedule);
            this.pauseOnRun(steps[0] + steps[1] + steps[2]);
        }

        /**
         * Specifies the amount of rotation or time for the acceleration
         * of run commands.
         */
        //% blockId=outputMotorsetRunRamp block="set %motor|run %ramp to $value||$unit"
        //% motor.fieldEditor="motors"
        //% weight=21 blockGap=8
        //% group="Properties"
        //% help=motors/motor/set-run-phase
        setRunPhase(phase: MovePhase, value: number, unit: MoveUnit = MoveUnit.MilliSeconds) {
            let temp: number;
            switch (unit) {
                case MoveUnit.Rotations:
                    temp = Math.max(0, (value * 360) | 0);
                    if (phase == MovePhase.Acceleration)
                        this._accelerationSteps = temp;
                    else
                        this._decelerationSteps = temp;
                    break;
                case MoveUnit.Degrees:
                    temp = Math.max(0, value | 0);
                    if (phase == MovePhase.Acceleration)
                        this._accelerationSteps = temp;
                    else
                        this._decelerationSteps = temp;
                    break;
                case MoveUnit.Seconds:
                    temp = Math.max(0, (value * 1000) | 0);
                    if (phase == MovePhase.Acceleration)
                        this._accelerationTime = temp;
                    else
                        this._decelerationTime = temp;
                    break;
                case MoveUnit.MilliSeconds:
                    temp = Math.max(0, value | 0);
                    if (phase == MovePhase.Acceleration)
                        this._accelerationTime = temp;
                    else
                        this._decelerationTime = temp;
                    break;
            }
        }

        private _run(speed: number) {
            // ramp up acceleration
            if (this._accelerationTime) {
                this._schedule({ speed: speed, useSteps: false, steps: [this._accelerationTime, 100, 0] });
                pause(this._accelerationTime);
            }
            // keep going
            const b = mkCmd(this._port, this._regulated ? DAL.opOutputSpeed : DAL.opOutputPower, 1)
            b.setNumber(NumberFormat.Int8LE, 2, speed)
            writePWM(b)
            if (speed) {
                writePWM(mkCmd(this._port, DAL.opOutputStart, 0))
            }
        }

        private _schedule(schedule: MoveSchedule) {
            const p = {
                useSteps: schedule.useSteps,
                step1: schedule.steps[0],
                step2: schedule.steps[1],
                step3: schedule.steps[2],
                speed: this._regulated ? schedule.speed : undefined,
                power: this._regulated ? undefined : schedule.speed,
                useBrake: this._brake
            };
            step(this._port, p)
        }

        /**
         * Indicates if the motor(s) speed should be regulated. Default is true.
         * @param value true for regulated motor
         */
        //% blockId=outputMotorSetRegulated block="set %motor|regulated %value=toggleOnOff"
        //% motor.fieldEditor="motors"
        //% weight=58 blockGap=8
        //% group="Properties"
        //% help=motors/motor/set-regulated
        setRegulated(value: boolean) {
            this._regulated = value;
        }

        /**
         * Returns a value indicating if the motor is still running a previous command.
         */
        //% group="Sensors"
        isReady(): boolean {
            this.init();
            const buf = mkCmd(this._port, DAL.opOutputTest, 2);
            readPWM(buf)
            const flags = buf.getNumber(NumberFormat.UInt8LE, 2);
            return (~flags & this._port) == this._port;
        }

        /**
         * Pauses the execution until the previous command finished.
         * @param timeOut optional maximum pausing time in milliseconds
         */
        //% blockId=motorPauseUntilRead block="pause until %motor|ready"
        //% motor.fieldEditor="motors"
        //% weight=90 blockGap=8
        //% group="Move"
        pauseUntilReady(timeOut?: number) {
            pauseUntil(() => this.isReady(), timeOut);
        }

        setRunSmoothness(accelerationPercent: number, decelerationPercent: number) {

        }

        protected setOutputType(large: boolean) {
            for (let i = 0; i < DAL.NUM_OUTPUTS; ++i) {
                if (this._port & (1 << i)) {
                    // (0x07: Large motor, Medium motor = 0x08)
                    MotorBase.output_types[i] = large ? 0x07 : 0x08;
                }
            }
            MotorBase.setTypes();
        }

        // Note, we are having to create our own buffer here as mkCmd creates a buffer with a command
        // In the case of opOutputSetType, it expects the arguments to be opOutputSetType [type0, type1, type2, type3]
        static setTypes() {
            const b = output.createBuffer(5)
            b.setNumber(NumberFormat.UInt8LE, 0, DAL.opOutputSetType)
            b.setNumber(NumberFormat.Int8LE, 1, MotorBase.output_types[0]);
            b.setNumber(NumberFormat.Int8LE, 2, MotorBase.output_types[1]);
            b.setNumber(NumberFormat.Int8LE, 3, MotorBase.output_types[2]);
            b.setNumber(NumberFormat.Int8LE, 4, MotorBase.output_types[3]);
            writePWM(b)
        }
    }

    //% fixedInstances
    export class Motor extends MotorBase {
        private _large: boolean;

        constructor(port: Output, large: boolean) {
            super(port, () => this.__init());
            this._large = large;
            this.markUsed();
        }

        markUsed() {
            motors.__motorUsed(this._port, this._large);
        }

        private __init() {
            this.setOutputType(this._large);
            this.setInverted(false);
        }

        /**
         * Gets motor actual speed.
         * @param motor the port which connects to the motor
         */
        //% blockId=motorSpeed block="%motor|speed"
        //% motor.fieldEditor="motors"
        //% weight=72 
        //% blockGap=8
        //% group="Counters"
        //% help=motors/motor/speed
        speed(): number {
            this.init();
            return getMotorData(this._port).actualSpeed;
        }

        /**
         * Gets motor angle.
         * @param motor the port which connects to the motor
         */
        //% blockId=motorAngle block="%motor|angle"
        //% motor.fieldEditor="motors"
        //% weight=70
        //% blockGap=8
        //% group="Counters"
        //% help=motors/motor/angle
        angle(): number {
            this.init();
            return getMotorData(this._port).count * this.invertedFactor();
        }

        /**
         * Clears the motor count
         */
        //% blockId=motorClearCount block="clear %motor|counters"
        //% motor.fieldEditor="motors"
        //% weight=68
        //% blockGap=8
        //% group="Counters"
        //% help=motors/motor/clear-counts
        clearCounts() {
            this.init();
            const b = mkCmd(this._port, DAL.opOutputClearCount, 0)
            writePWM(b)
            for (let i = 0; i < DAL.NUM_OUTPUTS; ++i) {
                if (this._port & (1 << i)) {
                    motorMM.setNumber(NumberFormat.Int32LE, i * MotorDataOff.Size + MotorDataOff.TachoSensor, 0)
                }
            }
        }

        /**
         * Returns the status of the motor
         */
        //%
        toString(): string {
            return `${this._large ? "" : "M"}${this._portName} ${this.speed()}% ${this.angle()}>`;
        }

        /**
         * Pauses the program until the motor is stalled.
         */
        //% blockId=motorPauseUntilStall block="pause until %motor|stalled"
        //% motor.fieldEditor="motors"
        //% weight=89
        //% group="Move"
        //% help=motors/motor/pause-until-stalled
        pauseUntilStalled(timeOut?: number): void {
            // let it start
            pause(50);
            let previous = this.angle();
            let stall = 0;
            pauseUntil(() => {
                let current = this.angle();
                if (Math.abs(current - previous) < 1) {
                    if (stall++ > 2) {
                        return true; // not moving
                    }
                } else {
                    stall = 0;
                    previous = current;
                }
                return false;
            }, timeOut)
        }
    }

    //% whenUsed fixedInstance block="large motor A" jres=icons.portA
    export const largeA = new Motor(Output.A, true);

    //% whenUsed fixedInstance block="large motor B" jres=icons.portB
    export const largeB = new Motor(Output.B, true);

    //% whenUsed fixedInstance block="large motor C" jres=icons.portC
    export const largeC = new Motor(Output.C, true);

    //% whenUsed fixedInstance block="large motor D" jres=icons.portD
    export const largeD = new Motor(Output.D, true);

    //% whenUsed fixedInstance block="medium motor A" jres=icons.portA
    export const mediumA = new Motor(Output.A, false);

    //% whenUsed fixedInstance block="medium motor B" jres=icons.portB
    export const mediumB = new Motor(Output.B, false);

    //% whenUsed fixedInstance block="medium motor C" jres=icons.portC
    export const mediumC = new Motor(Output.C, false);

    //% whenUsed fixedInstance block="medium motor D" jres=icons.portD
    export const mediumD = new Motor(Output.D, false);

    //% fixedInstances
    export class SynchedMotorPair extends MotorBase {

        constructor(ports: Output) {
            super(ports, () => this.__init());
            this.markUsed();
        }

        markUsed() {
            motors.__motorUsed(this._port, true);
        }

        private __init() {
            this.setOutputType(true);
        }

        /**
         * The Move Tank block can make a robot drive forward, backward, turn, or stop. 
         * Use the Move Tank block for robot vehicles that have two Large Motors, 
         * with one motor driving the left side of the vehicle and the other the right side. 
         * You can make the two motors go at different speeds or in different directions 
         * to make your robot turn.
         * @param speedLeft the speed on the left motor, eg: 50
         * @param speedRight the speed on the right motor, eg: 50
         * @param value (optional) move duration or rotation
         * @param unit (optional) unit of the value
         */
        //% blockId=motorPairTank block="tank **motors** %motors %speedLeft=motorSpeedPicker|\\% %speedRight=motorSpeedPicker|\\%||for %value %unit"
        //% motors.fieldEditor="ports"
        //% weight=96 blockGap=8
        //% inlineInputMode=inline
        //% group="Move"
        //% expandableArgumentMode=toggle
        //% help=motors/synced/tank
        tank(speedLeft: number, speedRight: number, value: number = 0, unit: MoveUnit = MoveUnit.MilliSeconds) {
            this.init();

            speedLeft = Math.clamp(-100, 100, speedLeft >> 0);
            speedRight = Math.clamp(-100, 100, speedRight >> 0);

            const speed = Math.abs(speedLeft) > Math.abs(speedRight) ? speedLeft : speedRight;
            let turnRatio = speedLeft == speed
                ? speedLeft == 0 ? 0 : (100 - speedRight / speedLeft * 100)
                : speedRight == 0 ? 0 : (speedLeft / speedRight * 100 - 100);
            turnRatio = Math.floor(turnRatio);

            //control.dmesg(`tank ${speedLeft} ${speedRight} => ${turnRatio} ${speed}`)
            this.steer(turnRatio, speed, value, unit);
        }

        /**
         * Turns the motor and the follower motor by a number of rotations
         * @param turnRatio the ratio of power sent to the follower motor, from ``-200`` to ``200``, eg: 0
         * @param speed the speed from ``100`` full forward to ``-100`` full backward, eg: 50
         * @param value (optional) move duration or rotation
         * @param unit (optional) unit of the value
         */
        //% blockId=motorPairSteer block="steer **motors** %chassis turn ratio %turnRatio=motorTurnRatioPicker speed %speed=motorSpeedPicker|\\%||for %value %unit"
        //% chassis.fieldEditor="ports"
        //% weight=95
        //% turnRatio.min=-200 turnRatio=200
        //% inlineInputMode=inline
        //% group="Move"
        //% expandableArgumentMode=toggle
        //% help=motors/synced/steer
        steer(turnRatio: number, speed: number, value: number = 0, unit: MoveUnit = MoveUnit.MilliSeconds) {
            this.init();
            speed = Math.clamp(-100, 100, speed >> 0) * this.invertedFactor();
            if (!speed) {
                this.stop();
                return;
            }

            turnRatio = Math.clamp(-200, 200, turnRatio >> 0);
            let useSteps: boolean;
            let stepsOrTime: number;
            switch (unit) {
                case MoveUnit.Rotations:
                    if (value < 0) {
                        value = -value;
                        speed = -speed;
                    }
                    stepsOrTime = (value * 360) >> 0;
                    useSteps = true;
                    break;
                case MoveUnit.Degrees:
                    if (value < 0) {
                        value = -value;
                        speed = -speed;
                    }
                    stepsOrTime = value >> 0;
                    useSteps = true;
                    break;
                case MoveUnit.Seconds:
                    stepsOrTime = (value * 1000) >> 0;
                    useSteps = false;
                    break;
                default:
                    stepsOrTime = value >> 0;
                    useSteps = false;
                    break;
            }

            syncMotors(this._port, {
                useSteps: useSteps,
                speed: speed,
                turnRatio: turnRatio,
                stepsOrTime: stepsOrTime,
                useBrake: this._brake
            });

            this.pauseOnRun(stepsOrTime);
        }

        /**
         * Returns the name(s) of the motor
         */
        //%
        toString(): string {
            this.init();

            let r = outputToName(this._port);
            for (let i = 0; i < DAL.NUM_OUTPUTS; ++i) {
                if (this._port & (1 << i)) {
                    r += ` ${getMotorData(1 << i).actualSpeed}%`
                }
            }
            return r;
        }
    }

    //% whenUsed fixedInstance block="B+C" jres=icons.portBC
    export const largeBC = new SynchedMotorPair(Output.BC);

    //% whenUsed fixedInstance block="A+D" jres=icons.portAD
    export const largeAD = new SynchedMotorPair(Output.AD);

    //% whenUsed fixedInstance block="A+B" jres=icons.portAB
    export const largeAB = new SynchedMotorPair(Output.AB);

    //% whenUsed fixedInstance block="C+D" jres=icons.portCD
    export const largeCD = new SynchedMotorPair(Output.CD);

    function reset(out: Output) {
        writePWM(mkCmd(out, DAL.opOutputReset, 0))
        writePWM(mkCmd(out, DAL.opOutputClearCount, 0))
    }

    function outOffset(out: Output) {
        for (let i = 0; i < DAL.NUM_OUTPUTS; ++i) {
            if (out & (1 << i))
                return i * MotorDataOff.Size
        }
        return 0
    }

    export interface MotorData {
        actualSpeed: number; // -100..+100
        tachoCount: number;
        count: number;
    }

    // only a single output at a time
    function getMotorData(out: Output): MotorData {
        init()
        const buf = motorMM.slice(outOffset(out), MotorDataOff.Size)
        return {
            actualSpeed: buf.getNumber(NumberFormat.Int8LE, MotorDataOff.Speed),
            tachoCount: buf.getNumber(NumberFormat.Int32LE, MotorDataOff.TachoCounts),
            count: buf.getNumber(NumberFormat.Int32LE, MotorDataOff.TachoSensor),
        }
    }

    export function getAllMotorData(): MotorData[] {
        init();
        return [Output.A, Output.B, Output.C, Output.D].map(out => getMotorData(out));
    }

    interface SyncOptions {
        useSteps?: boolean;
        speed: number;
        turnRatio: number;
        stepsOrTime?: number;
        useBrake?: boolean;
    }

    function syncMotors(out: Output, opts: SyncOptions) {
        const cmd = opts.useSteps ? DAL.opOutputStepSync : DAL.opOutputTimeSync;
        const b = mkCmd(out, cmd, 11);
        const speed = Math.clamp(-100, 100, opts.speed);
        const turnRatio = Math.clamp(-200, 200, opts.turnRatio);

        b.setNumber(NumberFormat.Int8LE, 2, speed)
        // note that b[3] is padding
        b.setNumber(NumberFormat.Int16LE, 4 + 4 * 0, turnRatio)
        // b[6], b[7] is padding
        b.setNumber(NumberFormat.Int32LE, 4 + 4 * 1, opts.stepsOrTime || 0)
        b.setNumber(NumberFormat.Int8LE, 4 + 4 * 2, opts.useBrake ? 1 : 0)
        writePWM(b)
    }

    interface StepOptions {
        power?: number;
        speed?: number; // either speed or power has to be present
        step1: number;
        step2: number;
        step3: number;
        useSteps?: boolean; // otherwise use milliseconds
        useBrake?: boolean;
    }

    function start(out: Output) {
        const b = mkCmd(out, DAL.opOutputStart, 0)
        writePWM(b);
    }

    function stop(out: Output, brake: boolean) {
        const b = mkCmd(out, DAL.opOutputStop, 1)
        b.setNumber(NumberFormat.UInt8LE, 2, brake ? 1 : 0)
        writePWM(b);
    }

    function step(out: Output, opts: StepOptions) {
        control.dmesg('step')
        let op = opts.useSteps ? DAL.opOutputStepSpeed : DAL.opOutputTimeSpeed
        let speed = opts.speed
        if (undefined == speed) {
            speed = opts.power
            op = opts.useSteps ? DAL.opOutputStepPower : DAL.opOutputTimePower
            if (undefined == speed)
                return
        }
        speed = Math.clamp(-100, 100, speed)
        let b = mkCmd(out, op, 15)
        b.setNumber(NumberFormat.Int8LE, 2, speed)
        // note that b[3] is padding
        b.setNumber(NumberFormat.Int32LE, 4 + 4 * 0, opts.step1)
        b.setNumber(NumberFormat.Int32LE, 4 + 4 * 1, opts.step2)
        b.setNumber(NumberFormat.Int32LE, 4 + 4 * 2, opts.step3)
        const br = !!opts.useBrake ? 1 : 0;
        b.setNumber(NumberFormat.Int8LE, 4 + 4 * 3, br)
        writePWM(b)
    }
}
