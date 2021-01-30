namespace sensors.internal {
    const UART_PORT_CHANGED = 1
    const UART_DATA_READY = 8

    export class Poller {
        private query: () => number;
        private update: (previous: number, current: number) => void;
        public interval: number;

        private previousValue: number;
        private currentValue: number;
        private lastQuery: number; // track down the last time we did a query/update cycle
        private lastPause: number;  // track down the last time we pause in the sensor polling loop

        constructor(interval: number, query: () => number, update: (previous: number, current: number) => void) {
            this.interval = interval | 0;
            this.query = query;
            this.update = update;

            this.poll();
        }

        poke(): void {
            const now = control.millis();
            if (now - this.lastQuery >= this.interval * 2)
                this.queryAndUpdate(); // sensor poller is not allowed to run
            control.cooperate(); // allow events to trigger
        }

        private queryAndUpdate() {
            this.lastQuery = control.millis();
            this.currentValue = this.query();
            if (this.previousValue != this.currentValue) {
                this.update(this.previousValue, this.currentValue);
                this.previousValue = this.currentValue;
            }
        }

        private poll() {
            control.runInBackground(() => {
                pause(this.interval);
                this.lastQuery = this.lastPause = control.millis();
                this.previousValue = this.currentValue = this.query();
                this.update(this.previousValue, this.currentValue);
                while (true) {
                    this.lastPause = control.millis();
                    pause(this.interval);
                    this.queryAndUpdate();
                }
            })
        }
    }

    export function bufferToString(buf: Buffer): string {
        let s = ''
        for (let i = 0; i < buf.length; i++)
            s += String.fromCharCode(buf[i])

        return s
    }

    let analogMM: MMap
    let uartMM: MMap
    let IICMM: MMap
    let powerMM: MMap
    let sensorInfos: SensorInfo[];

    let batteryInfo: {
        CinCnt: number;
        CoutCnt: number;
        VinCnt: number;
    };
    let batteryVMin: number;
    let batteryVMax: number;

    class SensorInfo {
        port: number
        sensor: Sensor
        sensors: Sensor[]
        connType: number
        devType: number
        iicid: string
        poller: Poller;

        constructor(p: number) {
            this.port = p
            this.connType = DAL.CONN_NONE
            this.devType = DAL.DEVICE_TYPE_NONE
            this.iicid = ''
            this.sensors = []
            this.poller = new Poller(25, () => this.query(), (prev, curr) => this.update(prev, curr));
        }

        poke() {
            this.poller.poke();
        }

        private query() {
            if (this.sensor) return this.sensor._query();
            return 0;
        }

        private update(prev: number, curr: number) {
            if (this.sensor) this.sensor._update(prev, curr)
        }
    }

    export function init() {
        if (sensorInfos) return
        sensorInfos = []
        for (let i = 0; i < DAL.NUM_INPUTS; ++i) sensorInfos.push(new SensorInfo(i))

        analogMM = control.mmap("/dev/lms_analog", AnalogOff.Size, 0)
        if (!analogMM) control.fail("no analog sensor")

        uartMM = control.mmap("/dev/lms_uart", UartOff.Size, 0)
        if (!uartMM) control.fail("no uart sensor")

        IICMM = control.mmap("/dev/lms_iic", IICOff.Size, 0)
        if (!IICMM) control.fail("no iic sensor")

        powerMM = control.mmap("/dev/lms_power", 2, 0)

        forever(function () {
            pause(500)
            detectDevices();
        })
    }

    export function getActiveSensors(): Sensor[] {
        init();
        return sensorInfos.filter(si => si.sensor && si.sensor.isActive()).map(si => si.sensor);
    }

    export function readIICID(port: number) {
        const buf = output.createBuffer(IICStr.Size)
        buf[IICStr.Port] = port
        IICMM.ioctl(IO.IIC_READ_TYPE_INFO, buf)
        const manufacturer = bufferToString(buf.slice(IICStr.Manufacturer, 8))
        const sensorType = bufferToString(buf.slice(IICStr.SensorType, 8))
        return manufacturer + sensorType;
    }

    const ADC_REF = 5000                  //!< [mV]  maximal value on ADC
    const ADC_RES = 4095                  //!< [CNT] maximal count on ADC
    // see c_ui.c
    const SHUNT_IN = 0.11              //  [Ohm]
    const AMP_CIN = 22.0              //  [Times]

    const EP2_SHUNT_IN = 0.05              //  [Ohm]
    const EP2_AMP_CIN = 15.0              //  [Times]

    const SHUNT_OUT = 0.055             //  [Ohm]
    const AMP_COUT = 19.0              //  [Times]

    const VCE = 0.05              //  [V]
    const AMP_VIN = 0.5               //  [Times]

    const AVR_CIN = 300
    const AVR_COUT = 30
    const AVR_VIN = 30
    // lms2012
    const BATT_INDICATOR_HIGH = 7500          //!< Battery indicator high [mV]
    const BATT_INDICATOR_LOW = 6200          //!< Battery indicator low [mV]
    const ACCU_INDICATOR_HIGH = 7500          //!< Rechargeable battery indicator high [mV]
    const ACCU_INDICATOR_LOW = 7100          //!< Rechargeable battery indicator low [mV]    

    function CNT_V(C: number) {
        return ((C * ADC_REF) / (ADC_RES * 1000.0))
    }

    function updateBatteryInfo() {
        let CinCnt = analogMM.getNumber(NumberFormat.Int16LE, AnalogOff.BatteryCurrent);
        let CoutCnt = analogMM.getNumber(NumberFormat.Int16LE, AnalogOff.MotorCurrent);
        let VinCnt = analogMM.getNumber(NumberFormat.Int16LE, AnalogOff.Cell123456);
        if (!batteryInfo) {
            batteryVMin = BATT_INDICATOR_LOW;
            batteryVMax = BATT_INDICATOR_HIGH;
            if (powerMM) {
                const accu = powerMM.getNumber(NumberFormat.UInt8LE, 0);
                if (accu > 0) {
                    control.dmesg("rechargeable battery")
                    batteryVMin = ACCU_INDICATOR_LOW;
                    batteryVMax = ACCU_INDICATOR_HIGH;
                }
            }
            batteryInfo = {
                CinCnt: CinCnt,
                CoutCnt: CoutCnt,
                VinCnt: VinCnt
            };
            // update in background
            control.runInParallel(() => forever(updateBatteryInfo));
        } else {
            CinCnt = batteryInfo.CinCnt = ((batteryInfo.CinCnt * (AVR_CIN - 1)) + CinCnt) / AVR_CIN;
            CoutCnt = batteryInfo.CoutCnt = ((batteryInfo.CoutCnt * (AVR_COUT - 1)) + CoutCnt) / AVR_COUT;
            VinCnt = batteryInfo.VinCnt = ((batteryInfo.VinCnt * (AVR_VIN - 1)) + VinCnt) / AVR_VIN;
        }
    }

    export interface BatteryInfo {
        level: number;
        Ibatt: number,
        Vbatt: number,
        Imotor: number
    }

    export function getBatteryInfo(): BatteryInfo {
        init();
        if (!batteryInfo) updateBatteryInfo();
        const CinCnt = batteryInfo.CinCnt;
        const CoutCnt = batteryInfo.CoutCnt;
        const VinCnt = batteryInfo.VinCnt;
        /*
void      cUiUpdatePower(void)
{
#ifndef Linux_X86
  DATAF   CinV;
  DATAF   CoutV;

  if ((UiInstance.Hw == FINAL) || (UiInstance.Hw == FINALB))
  {
    CinV                =  CNT_V(UiInstance.CinCnt) / AMP_CIN;
    UiInstance.Vbatt    =  (CNT_V(UiInstance.VinCnt) / AMP_VIN) + CinV + VCE;

    UiInstance.Ibatt    =  CinV / SHUNT_IN;
    CoutV               =  CNT_V(UiInstance.CoutCnt) / AMP_COUT;
    UiInstance.Imotor   =  CoutV / SHUNT_OUT;

  }
  else
  {
    CinV                =  CNT_V(UiInstance.CinCnt) / EP2_AMP_CIN;
    UiInstance.Vbatt    =  (CNT_V(UiInstance.VinCnt) / AMP_VIN) + CinV + VCE;

    UiInstance.Ibatt    =  CinV / EP2_SHUNT_IN;
    UiInstance.Imotor   =  0;

  }

#endif
#ifdef DEBUG_TEMP_SHUTDOWN

  UiInstance.Vbatt  =  7.0;
  UiInstance.Ibatt  =  5.0;

#endif
}        
        */
        const CinV = CNT_V(CinCnt) / AMP_CIN;
        const Vbatt = CNT_V(VinCnt) / AMP_VIN + CinV + VCE;
        const Ibatt = CinV / SHUNT_IN;
        const CoutV = CNT_V(CoutCnt) / AMP_COUT;
        const Imotor = CoutV / SHUNT_OUT;
        const level = Math.max(0, Math.min(100, Math.floor((Vbatt * 1000.0 - batteryVMin)
            / (batteryVMax - batteryVMin) * 100)));

        return {
            level: level,
            Vbatt: Vbatt,
            Ibatt: Ibatt,
            Imotor: Imotor
        };
    }

    function detectDevices() {
        control.dmesg(`detect devices`)
        const conns = analogMM.slice(AnalogOff.InConn, DAL.NUM_INPUTS)
        let devcon: Buffer = undefined;
        for (const sensorInfo of sensorInfos) {
            const newConn = conns[sensorInfo.port]
            if (newConn == sensorInfo.connType)
                continue;

            sensorInfo.connType = newConn
            sensorInfo.devType = DAL.DEVICE_TYPE_NONE
            sensorInfo.sensor = undefined;

            if (newConn == DAL.CONN_INPUT_UART) {
                control.dmesg(`new UART connection at ${sensorInfo.port}`)
                const status = getUartStatus(sensorInfo.port);
                if (status & UART_PORT_CHANGED) {
                    if (!devcon) devcon = output.createBuffer(DevConOff.Size)
                    updateUartMode(devcon, sensorInfo.port, 0);
                }
            } else if (newConn == DAL.CONN_NXT_IIC) {
                control.dmesg(`new IIC connection at ${sensorInfo.port}`)
                sensorInfo.devType = DAL.DEVICE_TYPE_IIC_UNKNOWN
                sensorInfo.iicid = readIICID(sensorInfo.port)
                control.dmesg(`IIC ID ${sensorInfo.iicid.length}`)
            } else if (newConn == DAL.CONN_INPUT_DUMB) {
                control.dmesg(`new DUMB connection at ${sensorInfo.port}`)
                // TODO? for now assume touch
                sensorInfo.devType = DAL.DEVICE_TYPE_TOUCH
            } else if (newConn == DAL.CONN_NONE || newConn == 0) {
                control.dmesg(`disconnected port ${sensorInfo.port}`)
                // clear sensor
                sensorInfo.sensor = undefined;
            } else {
                control.dmesg(`unknown connection type: ${newConn} at ${sensorInfo.port}`)
                // clear sensor
                sensorInfo.sensor = undefined;
            }
        }

        if (devcon)
            setUartModes(devcon);

        for (const sensorInfo of sensorInfos.filter(si => si.connType == DAL.CONN_INPUT_UART && si.devType == DAL.CONN_NONE)) {
            const uinfo = readUartInfo(sensorInfo.port, 0);
            sensorInfo.devType = uinfo[TypesOff.Type];
            control.dmesg(`UART type ${sensorInfo.devType}`)
        }

        // assign sensors
        for (const sensorInfo of sensorInfos.filter(si => !si.sensor)) {
            if (sensorInfo.devType == DAL.DEVICE_TYPE_IIC_UNKNOWN) {
                sensorInfo.sensor = sensorInfo.sensors.filter(s => s._IICId() == sensorInfo.iicid)[0]
                if (!sensorInfo.sensor) {
                    control.dmesg(`sensor not found for iicid=${sensorInfo.iicid} at ${sensorInfo.port}`)
                } else {
                    control.dmesg(`sensor connected iicid=${sensorInfo.iicid} at ${sensorInfo.port}`)
                    sensorInfo.sensor._activated()
                }
            } else if (sensorInfo.devType != DAL.DEVICE_TYPE_NONE) {
                sensorInfo.sensor = sensorInfo.sensors.filter(s => s._deviceType() == sensorInfo.devType)[0]
                if (!sensorInfo.sensor) {
                    control.dmesg(`sensor not found for type=${sensorInfo.devType} at ${sensorInfo.port}`)
                } else {
                    control.dmesg(`sensor connected type=${sensorInfo.devType} at ${sensorInfo.port}`)
                    sensorInfo.sensor._activated()
                }
            }
        }

        // check uart sensors
        for (const sensorInfo of sensorInfos.filter(si => si.connType == DAL.CONN_INPUT_UART && !!si.sensor)) {
            const status = getUartStatus(sensorInfo.port);
            control.dmesg(`UART status ${status} at ${sensorInfo.port}`)
        }
    }

    // this function will return a meaningful result only when stats & CHANGED
    // it is cleared afterwards
    function readUartInfo(port: number, mode: number) {
        const buf = output.createBuffer(UartCtlOff.Size)
        buf[UartCtlOff.Port] = port
        buf[UartCtlOff.Mode] = mode
        uartMM.ioctl(IO.UART_READ_MODE_INFO, buf)
        control.dmesg(`UART_READ_MODE t:${buf[TypesOff.Type]} c:${buf[TypesOff.Connection]} m:${buf[TypesOff.Mode]} n:${buf.slice(0, 12).toHex()}`);
        return buf
    }

    export class Sensor extends control.Component {
        protected _port: number // this is 0-based

        constructor(port_: number) {
            super()
            if (!(1 <= port_ && port_ <= DAL.NUM_INPUTS))
                control.panic(120)
            this._port = port_ - 1
            init()
            sensorInfos[this._port].sensors.push(this)
            this.markUsed();
        }

        poke() {
            if (this.isActive())
                sensorInfos[this._port].poke();
        }

        markUsed() {
            sensors.__sensorUsed(this._port, this._deviceType());
        }

        _activated() { }

        // 1-based
        port() {
            return this._port + 1
        }

        isActive() {
            return sensorInfos[this._port].sensor == this
        }

        _query() {
            return 0
        }

        _info(): string {
            return this._query().toString();
        }

        _update(prev: number, curr: number) {
        }

        _deviceType() {
            return 0
        }

        _IICId() {
            return ''
        }
    }

    export class AnalogSensor extends Sensor {
        constructor(port: number) {
            super(port)
        }

        _readPin6() {
            if (!this.isActive()) return 0
            return analogMM.getNumber(NumberFormat.Int16LE, AnalogOff.InPin6 + 2 * this._port)
        }
    }

    export class UartSensor extends Sensor {
        protected mode: number // the mode user asked for
        protected realmode: number // the mode the hardware is in

        constructor(port: number) {
            super(port)
            this.mode = 0
            this.realmode = 0
        }

        _activated() {
            this.realmode = 0
            this._setMode(this.mode)
        }

        protected _setMode(m: number) {
            //control.dmesg(`_setMode p=${this.port} m: ${this.realmode} -> ${m}`)
            let v = m | 0
            this.mode = v
            if (!this.isActive()) return
            if (this.realmode != this.mode) {
                this.realmode = v
                setUartMode(this._port, v)
            }
        }

        getBytes(): Buffer {
            return getUartBytes(this.isActive() ? this._port : -1)
        }

        getNumber(fmt: NumberFormat, off: number) {
            if (!this.isActive())
                return 0
            return getUartNumber(fmt, off, this._port)
        }

        reset() {
            if (this.isActive()) uartReset(this._port);
            this.realmode = -1;
        }
    }

    export class IICSensor extends Sensor {
        protected mode: number // the mode user asked for
        protected realmode: number // the mode the hardware is in
        private readLength: number

        constructor(port: number) {
            super(port)
            this.mode = 0
            this.realmode = 0
            this.readLength = 1;
        }

        _activated() {
            this.realmode = 0
            this._setMode(this.mode)
        }

        protected _setMode(m: number) {
            let v = m | 0
            this.mode = v
            if (!this.isActive()) return
            if (this.realmode != this.mode) {
                this.realmode = v
                setIICMode(this._port, this._deviceType(), v)
            }
        }

        getBytes(): Buffer {
            return getIICBytes(this.isActive() ? this._port : -1, this.readLength)
        }

        getNumber(fmt: NumberFormat, off: number) {
            if (!this.isActive())
                return 0
            return getIICNumber(this.readLength, fmt, off, this._port)
        }

        transaction(deviceAddress: number, write: number[], read: number) {
            this.readLength = read;
            transactionIIC(this._port, deviceAddress, write, read)
        }

        _deviceType() {
            return DAL.DEVICE_TYPE_IIC_UNKNOWN
        }
    }

    export const iicsensor = new IICSensor(3)

    function uartReset(port: number) {
        control.dmesg(`UART reset at ${port}`)
        const devcon = output.createBuffer(DevConOff.Size)
        devcon.setNumber(NumberFormat.Int8LE, DevConOff.Connection + port, DAL.CONN_NONE)
        devcon.setNumber(NumberFormat.Int8LE, DevConOff.Type + port, 0)
        devcon.setNumber(NumberFormat.Int8LE, DevConOff.Mode + port, 0)
        uartMM.ioctl(IO.UART_SET_CONN, devcon)
    }

    function getUartStatus(port: number) {
        return uartMM.getNumber(NumberFormat.Int8LE, UartOff.Status + port)
    }

    function waitNonZeroUartStatus(port: number): number {
        let retry = 20;
        while (retry-- > 0) {
            const s = getUartStatus(port)
            if (s) return s;
            control.dmesg(`UART status 0, waiting...`)
            pause(25)
        }
        return 0
    }

    function uartClearChange(port: number) {
        control.dmesg(`UART clear change`);
        while (true) {
            let status = getUartStatus(port)
            if (port < 0) break

            if ((status & UART_DATA_READY) != 0 && (status & UART_PORT_CHANGED) == 0)
                break

            const devcon = output.createBuffer(DevConOff.Size)
            devcon.setNumber(NumberFormat.Int8LE, DevConOff.Connection + port, DAL.CONN_INPUT_UART)
            devcon.setNumber(NumberFormat.Int8LE, DevConOff.Type + port, 0)
            devcon.setNumber(NumberFormat.Int8LE, DevConOff.Mode + port, 0)
            control.dmesg(`UART_CLEAR_CHANGED status ${status} ${devcon.toHex()}`)
            uartMM.ioctl(IO.UART_CLEAR_CHANGED, devcon)

            uartMM.setNumber(NumberFormat.Int8LE, UartOff.Status + port,
                getUartStatus(port) & 0xfffe)
            pause(10)
        }
    }

    function setUartModes(devcon: Buffer) {
        control.dmesg(`UART_SET_CONN ${devcon.toHex()}`)
        uartMM.ioctl(IO.UART_SET_CONN, devcon)
        const ports: number[] = [];
        for (let port = 0; port < DAL.NUM_INPUTS; ++port) {
            if (devcon.getNumber(NumberFormat.Int8LE, DevConOff.Connection + port) == DAL.CONN_INPUT_UART) {
                ports.push(port);
            }
        }

        while (ports.length) {
            const port = ports.pop();
            const status = waitNonZeroUartStatus(port)
            control.dmesg(`UART status ${status} at ${port}`);
        }
    }

    function updateUartMode(devcon: Buffer, port: number, mode: number) {
        control.dmesg(`UART update mode to ${mode} at ${port}`)
        devcon.setNumber(NumberFormat.Int8LE, DevConOff.Connection + port, DAL.CONN_INPUT_UART)
        devcon.setNumber(NumberFormat.Int8LE, DevConOff.Type + port, 33)
        devcon.setNumber(NumberFormat.Int8LE, DevConOff.Mode + port, mode)
    }

    function setUartMode(port: number, mode: number) {
        control.dmesg(`UART set mode ${mode} at ${port}`);
        while (true) {
            const devcon = output.createBuffer(DevConOff.Size)
            updateUartMode(devcon, port, mode);
            control.dmesg(`UART_SET_CONN ${devcon.toHex()}`)
            uartMM.ioctl(IO.UART_SET_CONN, devcon)
            let status = waitNonZeroUartStatus(port)
            if (status & UART_PORT_CHANGED) {
                control.dmesg(`UART clear changed at ${port}`)
                uartClearChange(port)
            } else {
                control.dmesg(`UART status ${status}`);
                if (status & UART_DATA_READY)
                    break;
            }
            pause(10)
        }
    }

    function getUartBytes(port: number): Buffer {
        if (port < 0) return output.createBuffer(DAL.MAX_DEVICE_DATALENGTH)
        let index = uartMM.getNumber(NumberFormat.UInt16LE, UartOff.Actual + port * 2)
        return uartMM.slice(
            UartOff.Raw + DAL.MAX_DEVICE_DATALENGTH * 300 * port + DAL.MAX_DEVICE_DATALENGTH * index,
            DAL.MAX_DEVICE_DATALENGTH)
    }

    function getUartNumber(fmt: NumberFormat, off: number, port: number) {
        if (port < 0) return 0
        let index = uartMM.getNumber(NumberFormat.UInt16LE, UartOff.Actual + port * 2)
        return uartMM.getNumber(fmt,
            UartOff.Raw + DAL.MAX_DEVICE_DATALENGTH * 300 * port + DAL.MAX_DEVICE_DATALENGTH * index + off)
    }

    export function setIICMode(port: number, type: number, mode: number) {
        if (port < 0) return;
        const devcon = output.createBuffer(DevConOff.Size)
        devcon.setNumber(NumberFormat.Int8LE, DevConOff.Connection + port, DAL.CONN_NXT_IIC)
        devcon.setNumber(NumberFormat.Int8LE, DevConOff.Type + port, type)
        devcon.setNumber(NumberFormat.Int8LE, DevConOff.Mode + port, mode)
        IICMM.ioctl(IO.IIC_SET_CONN, devcon)
    }

    export function transactionIIC(port: number, deviceAddress: number, writeBuf: number[], readLen: number) {
        if (port < 0) return;
        const iicdata = output.createBuffer(IICDat.Size)
        iicdata.setNumber(NumberFormat.Int8LE, IICDat.Port, port)
        iicdata.setNumber(NumberFormat.Int8LE, IICDat.Repeat, 0)
        iicdata.setNumber(NumberFormat.Int16LE, IICDat.Time, 0)
        iicdata.setNumber(NumberFormat.Int8LE, IICDat.WrLng, writeBuf.length + 1)
        for (let i = 0; i < writeBuf.length; i++)
            iicdata.setNumber(NumberFormat.Int8LE, IICDat.WrData + i + 1, writeBuf[i])
        iicdata.setNumber(NumberFormat.Int8LE, IICDat.WrData, deviceAddress)
        iicdata.setNumber(NumberFormat.Int8LE, IICDat.RdLng, readLen)
        IICMM.ioctl(IO.IIC_SETUP, iicdata)
    }

    export function getIICBytes(port: number, length: number) {
        if (port < 0) return output.createBuffer(length);
        let index = IICMM.getNumber(NumberFormat.UInt16LE, IICOff.Actual + port * 2);
        let buf = IICMM.slice(
            IICOff.Raw + DAL.MAX_DEVICE_DATALENGTH * 300 * port + DAL.MAX_DEVICE_DATALENGTH * index,
            length
        );

        // Reverse
        for (let i = 0; i < length / 2; i++) {
            let c = buf[i]
            buf[i] = buf[length - i - 1]
            buf[length - i - 1] = c
        }
        return buf;
    }

    export function getIICNumber(length: number, format: NumberFormat, off: number, port: number) {
        return getIICBytes(port, length).getNumber(format, off)
    }

    const enum NxtColOff {
        Calibration = 0, // uint32[4][3]
        CalLimits = 48, // uint16[2]
        Crc = 52, // uint16
        ADRaw = 54, // uint16[4]
        SensorRaw = 62, // uint16[4]
        Padding = 70,
        Size = 72
    }
    const enum AnalogOff {
        InPin1 = 0, // int16[4]
        InPin6 = 8, // int16[4]
        OutPin5 = 16, // int16[4]
        BatteryTemp = 24, // int16
        MotorCurrent = 26, // int16
        BatteryCurrent = 28, // int16
        Cell123456 = 30, // int16
        Pin1 = 32, // int16[300][4]
        Pin6 = 2432, // int16[300][4]
        Actual = 4832, // uint16[4]
        LogIn = 4840, // uint16[4]
        LogOut = 4848, // uint16[4]
        NxtCol = 4856, // uint16[36][4] - NxtColor*4
        OutPin5Low = 5144, // int16[4]
        Updated = 5152, // int8[4]
        InDcm = 5156, // int8[4]
        InConn = 5160, // int8[4]
        OutDcm = 5164, // int8[4]
        OutConn = 5168, // int8[4]
        Size = 5172
    }

    const enum DevConOff {
        Connection = 0, // int8[4]
        Type = 4, // int8[4]
        Mode = 8, // int8[4]
        Size = 12
    }

    const enum TypesOff {
        Name = 0, // int8[12]
        Type = 12, // int8
        Connection = 13, // int8
        Mode = 14, // int8
        DataSets = 15, // int8
        Format = 16, // int8
        Figures = 17, // int8
        Decimals = 18, // int8
        Views = 19, // int8
        RawMin = 20, // float32
        RawMax = 24, // float32
        PctMin = 28, // float32
        PctMax = 32, // float32
        SiMin = 36, // float32
        SiMax = 40, // float32
        InvalidTime = 44, // uint16
        IdValue = 46, // uint16
        Pins = 48, // int8
        Symbol = 49, // int8[5]
        Align = 54, // uint16
        Size = 56
    }

    const enum UartOff {
        TypeData = 0, // Types[8][4]
        Repeat = 1792, // uint16[300][4]
        Raw = 4192, // int8[32][300][4]
        Actual = 42592, // uint16[4]
        LogIn = 42600, // uint16[4]
        Status = 42608, // int8[4]
        Output = 42612, // int8[32][4]
        OutputLength = 42740, // int8[4]
        Size = 42744
    }

    const enum UartCtlOff {
        TypeData = 0, // Types
        Port = 56, // int8
        Mode = 57, // int8
        Size = 58
    }

    const enum IICOff {
        TypeData = 0, // Types[8][4]
        Repeat = 1792, // uint16[300][4]
        Raw = 4192, // int8[32][300][4]
        Actual = 42592, // uint16[4]
        LogIn = 42600, // uint16[4]
        Status = 42608, // int8[4]
        Output = 42612, // int8[32][4]
        OutputLength = 42740, // int8[4]
        Size = 42744
    }

    const enum IICCtlOff {
        TypeData = 0, // Types
        Port = 56, // int8
        Mode = 57, // int8
        Size = 58
    }

    const enum IICDat {
        Result = 0,  // result
        Port = 4, // int8
        Repeat = 5, // int8
        Time = 6, // int16
        WrLng = 8, // int8
        WrData = 9, // int8[32]
        RdLng = 41, // int8
        RdData = 42, //int8[32]
        Size = 74,
    }

    const enum IICStr {
        Port = 0, // int8
        Time = 2, // int16
        Type = 4, // int8
        Mode = 5, // int8
        Manufacturer = 6, // int8[9]
        SensorType = 15, // int[9]
        SetupLng = 24, // int8
        SetupString = 28, // ulong
        PollLng = 32, // int8
        PollString = 36, // ulong
        ReadLng = 40, // int8
        Size = 44
    }

    const enum IO {
        UART_SET_CONN = 0xc00c7500,
        UART_READ_MODE_INFO = 0xc03c7501,
        UART_NACK_MODE_INFO = 0xc03c7502,
        UART_CLEAR_CHANGED = 0xc03c7503,
        IIC_SET_CONN = 0xc00c6902,
        IIC_READ_TYPE_INFO = 0xc03c6903,
        IIC_SETUP = 0xc04c6905,
        IIC_SET = 0xc02c6906,
        TST_PIN_ON = 0xc00b7401,
        TST_PIN_OFF = 0xc00b7402,
        TST_PIN_READ = 0xc00b7403,
        TST_PIN_WRITE = 0xc00b7404,
        TST_UART_ON = 0xc0487405,
        TST_UART_OFF = 0xc0487406,
        TST_UART_EN = 0xc0487407,
        TST_UART_DIS = 0xc0487408,
        TST_UART_READ = 0xc0487409,
        TST_UART_WRITE = 0xc048740a,
    }
}

namespace sensors {
    export enum ThresholdState {
        Normal = 1,
        High = 2,
        Low = 3,
    }

    export class ThresholdDetector {
        public id: number;
        private min: number;
        private max: number;
        private lowThreshold: number;
        private highThreshold: number;
        public level: number;
        public state: ThresholdState;

        constructor(id: number, min = 0, max = 100, lowThreshold = 20, highThreshold = 80) {
            this.id = id;
            this.min = min;
            this.max = max;
            this.lowThreshold = lowThreshold;
            this.highThreshold = highThreshold;
            this.level = Math.ceil((max - min) / 2);
            this.state = ThresholdState.Normal;
        }

        public setLevel(level: number) {
            if (this == null) return
            this.level = this.clampValue(level);

            if (this.level >= this.highThreshold) {
                this.setState(ThresholdState.High);
            }
            else if (this.level <= this.lowThreshold) {
                this.setState(ThresholdState.Low);
            }
            else {
                const interval = (this.highThreshold - this.lowThreshold) / 6;
                if ((this.state == ThresholdState.High && this.level < this.highThreshold - interval) ||
                    (this.state == ThresholdState.Low && this.level > this.lowThreshold + interval))
                    this.setState(ThresholdState.Normal);
            }
        }

        public threshold(t: ThresholdState): number {
            switch (t) {
                case ThresholdState.High: return this.highThreshold;
                case ThresholdState.Low: return this.lowThreshold;
                default: return (this.max - this.min) / 2;
            }
        }

        public setLowThreshold(value: number) {
            this.lowThreshold = this.clampValue(value);
            this.highThreshold = Math.max(this.lowThreshold + 1, this.highThreshold);
        }

        public setHighThreshold(value: number) {
            this.highThreshold = this.clampValue(value);
            this.lowThreshold = Math.min(this.highThreshold - 1, this.lowThreshold);
        }

        private clampValue(value: number) {
            if (value < this.min) {
                return this.min;
            }
            else if (value > this.max) {
                return this.max;
            }
            return value;
        }

        private setState(state: ThresholdState) {
            if (this.state == state) return;

            this.state = state;
            switch (state) {
                case ThresholdState.High:
                    control.raiseEvent(this.id, ThresholdState.High);
                    break;
                case ThresholdState.Low:
                    control.raiseEvent(this.id, ThresholdState.Low);
                    break;
            }
        }
    }
}
