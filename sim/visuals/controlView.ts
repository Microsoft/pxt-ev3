/// <reference path="./nodes/moduleView.ts" />

namespace pxsim.visuals {

    export const CONTROL_WIDTH = 87.5;
    export const CONTROL_HEIGHT = 175;

    export const CONTROL_TEXT_COLOR = '#000';

    export abstract class ControlView<T extends BaseNode> extends SimView<T> implements LayoutElement {
        protected content: SVGSVGElement;

        abstract getInnerView(parent: SVGSVGElement, globalDefs: SVGDefsElement): SVGElement;

        constructor(protected parent: SVGSVGElement, protected globalDefs: SVGDefsElement, protected state: T, protected port: number) {
            super(state);

        }

        getInnerWidth(): number {
            return CONTROL_WIDTH;
        }

        getInnerHeight(): number {
            return CONTROL_HEIGHT;
        }

        getPaddingRatio() {
            return 0;
        }

        getWiringRatio() {
            return 0.5;
        }

        public hasClick() {
            return false;
        }

        buildDom(): SVGElement {
            this.content = svg.elt("svg", { viewBox: `0 0 ${this.getInnerWidth()} ${this.getInnerHeight()}` }) as SVGSVGElement;
            this.content.appendChild(this.getInnerView(this.parent, this.globalDefs));
            return this.content;
        }

        public resize(width: number, height: number) {
            super.resize(width, height);
            this.updateDimensions(width, height);
        }

        private updateDimensions(width: number, height: number) {
            if (this.content) {
                const currentWidth = this.getInnerWidth();
                const currentHeight = this.getInnerHeight();
                const newHeight = currentHeight / currentWidth * width;
                const newWidth = currentWidth / currentHeight * height;
                if (newHeight > height) {
                    // scale width instead
                    this.content.setAttribute('width', `${newWidth}`);
                    this.content.setAttribute('height', `${height}`);
                    // translate to the middle (width)
                    this.translate(width / 2 - newWidth / 2, 0);
                } else {
                    this.content.setAttribute('width', `${width}`);
                    this.content.setAttribute('height', `${newHeight}`);
                    // translate to the middle (height)
                    this.translate(0, height / 2 - newHeight / 2);
                }
            }
        }

        onComponentVisible() {
        }
    }
}