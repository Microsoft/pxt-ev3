
namespace pxsim {

    export class SensorNode extends BaseNode {

        protected mode: number;
        protected valueChanged: boolean;

        constructor(port: number) {
            super(port);
        }

        public isUart() {
            return true;
        }

        public isAnalog() {
            return false;
        }

        public getValue() {
            return 0;
        }

        setMode(mode: number) {
            this.mode = mode;
        }

        getMode() {
            return this.mode;
        }

        getDeviceType() {
            return DAL.DEVICE_TYPE_NONE;
        }

        public hasData() {
            return true;
        }

        valueChange() {
            const res = this.valueChanged;
            this.valueChanged = false;
            return res;
        }
    }

    export class AnalogSensorNode extends SensorNode {

        constructor(port: number) {
            super(port);
        }

        public isUart() {
            return false;
        }

        public isAnalog() {
            return true;
        }
    }

    export class UartSensorNode extends SensorNode {

        constructor(port: number) {
            super(port);
        }

        hasChanged() {
            return this.changed;
        }
    }
}