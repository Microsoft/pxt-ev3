

namespace pxsim.visuals {

    export class RotationSliderControl extends ControlView<GyroSensorNode> {
        private group: SVGGElement;
        private slider: SVGGElement;

        private reporter: SVGTextElement;
        private dial: SVGGElement;

        private static SLIDER_RADIUS = 100;

        getInnerView(parent: SVGSVGElement, globalDefs: SVGDefsElement) {
            this.group = svg.elt("g") as SVGGElement;

            // TODO hard coding
            const slider = pxsim.svg.child(this.group, 'g', { 'transform': 'translate(20, 25)'})
            const outerCircle = pxsim.svg.child(slider, "circle", {
                'stroke-dasharray': '565.48', 'stroke-dashoffset': '0',
                'cx': 100, 'cy': 100, 'r': '90', 'style': `fill:transparent;`,
                'stroke': '#a8aaa8', 'stroke-width': '1rem'
            }) as SVGCircleElement;

            this.reporter = pxsim.svg.child(this.group, "text", {
                'x': this.getInnerWidth() / 2, 'y': this.getInnerHeight() / 2,
                'text-anchor': 'middle', 'dominant-baseline': 'middle',
                'style': 'font-size: 50px',
                'class': 'sim-text inverted number'
            }) as SVGTextElement;

            this.dial = pxsim.svg.child(slider, "g", { 'cursor': '-webkit-grab' }) as SVGGElement;
            const handleInner = pxsim.svg.child(this.dial, "g");
            pxsim.svg.child(handleInner, "circle", { 'cx': 0, 'cy': 0, 'r': 30, 'style': 'fill: #f12a21;' });
            pxsim.svg.child(handleInner, "circle", { 'cx': 0, 'cy': 0, 'r': 29.5, 'style': 'fill: none;stroke: #b32e29' });

            this.state.setAngle(0);

            let pt = parent.createSVGPoint();
            let captured = false;

            const dragSurface = svg.child(this.group, "rect", {
                x: 0,
                y: 0,
                width: this.getInnerWidth(),
                height: this.getInnerHeight(),
                opacity: 0,
                cursor: '-webkit-grab'
            })

            touchEvents(dragSurface, ev => {
                if (captured && (ev as MouseEvent).clientY != undefined) {
                    ev.preventDefault();
                    this.updateSliderValue(pt, parent, ev as MouseEvent);
                }
            }, ev => {
                captured = true;
                if ((ev as MouseEvent).clientY != undefined) {
                    dragSurface.setAttribute('cursor', '-webkit-grabbing');
                    this.updateSliderValue(pt, parent, ev as MouseEvent);
                }
            }, () => {
                captured = false;
                //this.handleSliderUp();
            }, () => {
                captured = false;
                //this.handleSliderUp();
            })

            return this.group;
        }

        private getTopPadding() {
            return this.getInnerHeight() / 4;
        }

        updateState() {
            if (!this.visible) {
                return;
            }
            const node = this.state;
            // TODO modes
            const angle = node.getValue();

            // Update dial position
            const deg = angle / this.getMax() * 360; // degrees
            const radius = RotationSliderControl.SLIDER_RADIUS;
            const dialRadius = 5;
            const x = Math.ceil((radius - dialRadius) * Math.sin(deg * Math.PI / 180)) + radius;
            const y = Math.ceil((radius - dialRadius) * -Math.cos(deg * Math.PI / 180)) + radius;
            this.dial.setAttribute('transform', `translate(${x}, ${y})`);

            // Update reporter
            this.reporter.textContent = `${angle}`;
        }

        private updateSliderValue(pt: SVGPoint, parent: SVGSVGElement, ev: MouseEvent) {
            let cur = svg.cursorPoint(pt, parent, ev);
            const coords = {
                x: cur.x / this.scaleFactor - this.left / this.scaleFactor,
                y: cur.y / this.scaleFactor - this.top / this.scaleFactor
            };
            const radius = RotationSliderControl.SLIDER_RADIUS / 2;
            const dx = coords.x - radius;
            const dy = coords.y - radius;
            const atan = Math.atan(-dy / dx);
            let deg = Math.ceil(atan * (180 / Math.PI));

            if (dx < 0) {
                deg -= 270;
            } else if (dy > 0) {
                deg -= 450;
            } else if (dx >= 0 && dy <= 0) {
                deg = 90 - deg;
            }
            const value = Math.abs(Math.ceil((deg % 360) / 360 * this.getMax()));

            let state = this.state;
            state.setAngle(value);
        }

        private getMax() {
            //TODO what is actual max
            //TODO handle angle vs rate mode??
            return 360;
        }

        getInnerWidth() {
            return 250;
        }

        getInnerHeight() {
            return 250;
        }
    }

}