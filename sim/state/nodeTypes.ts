namespace pxsim {
    export enum NodeType {
        Port = 0,
        Brick = 1,
        TouchSensor = 2,
        MediumMotor = 3,
        LargeMotor = 4,
        GyroSensor = 5,
        ColorSensor = 6,
        UltrasonicSensor = 7
    }

    export interface Node {
        id: number;
        didChange(): boolean;
    }

    export class BaseNode implements Node {
        public id: number;
        public port: number;
        public isOutput = false;

        private used = false;
        protected changed = true;

        constructor(port: number) {
            this.port = port;
        }

        didChange() {
            const res = this.changed;
            this.changed = false;
            return res;
        }
    }
}