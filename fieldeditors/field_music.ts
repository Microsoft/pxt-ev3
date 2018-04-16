/// <reference path="../node_modules/pxt-core/localtypings/blockly.d.ts"/>
/// <reference path="../node_modules/pxt-core/built/pxtblocks.d.ts"/>
/// <reference path="../node_modules/pxt-core/built/pxtsim.d.ts"/>

export interface FieldMusicOptions extends pxtblockly.FieldImagesOptions {
    columns?: string;
    width?: string;
}

declare const pxtTargetBundle: any;

export class FieldMusic extends pxtblockly.FieldImages implements Blockly.FieldCustom {
    public isFieldCustom_ = true;

    private soundCache_: any;

    private static MUSIC_DATA_URI = `data:image/svg+xml;base64,PHN2ZyBpZD0ic3ZnNDEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgdmlld0JveD0iMCAwIDIzIDIzIj48cGF0aCBpZD0ibWVudV9pY25fbXVzaWMiIGQ9Ik0xMy45IDEyLjhjMS43LjMgMy4zIDEuMiA0LjMgMi42aDFzMS41LTQuNC0xLjgtNy41LTkuNy0zLjEtMTIuMSAwYy0xLjcgMi4xLTIuMyA1LTEuNCA3LjVoLjhzMS43LTIuNSA0LjQtMi42QzkgMTcuMiA5IDIxIDkgMjFjLTEuOS0uNC0zLjUtMS42LTQuNC0zLjQtMi0uNC0zLjYtMi4yLTMuNi00LjRDMSA2LjcgNS45IDMgMTEuNSAzczEwLjggNC4zIDEwLjQgMTAuMmMtLjIgNC4xLTMuNiA0LjQtMy42IDQuNC0uOCAxLjgtMi40IDMuMS00LjMgMy40LS4xLTQuNS0uMS04LjItLjEtOC4yeiIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==`;

    constructor(text: string, options: FieldMusicOptions, validator?: Function) {
        super(text, { sort: true, data: options.data }, validator);

        this.columns_ = parseInt(options.columns) || 4;
        this.width_ = parseInt(options.width) || 380;

        this.setText = Blockly.FieldDropdown.prototype.setText;
        this.updateWidth = (Blockly.Field as any).prototype.updateWidth;
        this.updateTextNode_ = Blockly.Field.prototype.updateTextNode_;

        this.soundCache_ = JSON.parse(pxtTargetBundle.bundledpkgs['music']['sounds.jres']);
    }

    /**
     * Create a dropdown menu under the text.
     * @private
     */
    public showEditor_() {
        // If there is an existing drop-down we own, this is a request to hide the drop-down.
        if (Blockly.DropDownDiv.hideIfOwner(this)) {
            return;
        }
        // If there is an existing drop-down someone else owns, hide it immediately and clear it.
        Blockly.DropDownDiv.hideWithoutAnimation();
        Blockly.DropDownDiv.clearContent();
        // Populate the drop-down with the icons for this field.
        let dropdownDiv = Blockly.DropDownDiv.getContentDiv();
        let contentDiv = document.createElement('div');
        // Accessibility properties
        contentDiv.setAttribute('role', 'menu');
        contentDiv.setAttribute('aria-haspopup', 'true');
        const options = this.getOptions();
        options.sort();

        // Create categoies
        console.log(options);
        

        for (let i = 0, option: any; option = options[i]; i++) {
            let content = (options[i] as any)[0]; // Human-readable text or image.
            const value = (options[i] as any)[1]; // Language-neutral value.
            // Icons with the type property placeholder take up space but don't have any functionality
            // Use for special-case layouts
            if (content.type == 'placeholder') {
                let placeholder = document.createElement('span');
                placeholder.setAttribute('class', 'blocklyDropDownPlaceholder');
                placeholder.style.width = content.width + 'px';
                placeholder.style.height = content.height + 'px';
                contentDiv.appendChild(placeholder);
                continue;
            }
            let button = document.createElement('button');
            button.setAttribute('id', ':' + i); // For aria-activedescendant
            button.setAttribute('role', 'menuitem');
            button.setAttribute('class', 'blocklyDropDownButton');
            button.title = content.alt;
            if ((this as any).columns_) {
                button.style.width = (((this as any).width_ / (this as any).columns_) - 8) + 'px';
                //button.style.height = ((this.width_ / this.columns_) - 8) + 'px';
            } else {
                button.style.width = content.width + 'px';
                button.style.height = content.height + 'px';
            }
            let backgroundColor = this.sourceBlock_.getColour();
            if (value == this.getValue()) {
                // This icon is selected, show it in a different colour
                backgroundColor = this.sourceBlock_.getColourTertiary();
                button.setAttribute('aria-selected', 'true');
            }
            button.style.backgroundColor = backgroundColor;
            button.style.borderColor = this.sourceBlock_.getColourTertiary();
            Blockly.bindEvent_(button, 'click', this, this.buttonClick_);
            Blockly.bindEvent_(button, 'mouseup', this, this.buttonClick_);
            // These are applied manually instead of using the :hover pseudoclass
            // because Android has a bad long press "helper" menu and green highlight
            // that we must prevent with ontouchstart preventDefault
            let that = this;
            Blockly.bindEvent_(button, 'mousedown', button, function (e) {
                this.setAttribute('class', 'blocklyDropDownButton blocklyDropDownButtonHover');
                e.preventDefault();
            });
            Blockly.bindEvent_(button, 'mouseenter', button, function () {
                that.buttonEnter_(value);
            });
            Blockly.bindEvent_(button, 'mouseleave', button, function () {
                that.buttonLeave_();
            });
            Blockly.bindEvent_(button, 'mouseover', button, function () {
                this.setAttribute('class', 'blocklyDropDownButton blocklyDropDownButtonHover');
                contentDiv.setAttribute('aria-activedescendant', this.id);
            });
            Blockly.bindEvent_(button, 'mouseout', button, function () {
                this.setAttribute('class', 'blocklyDropDownButton');
                contentDiv.removeAttribute('aria-activedescendant');
            });
            let buttonImg = document.createElement('img');
            buttonImg.src = FieldMusic.MUSIC_DATA_URI;
            //buttonImg.alt = icon.alt;
            // Upon click/touch, we will be able to get the clicked element as e.target
            // Store a data attribute on all possible click targets so we can match it to the icon.
            button.setAttribute('data-value', value);
            buttonImg.setAttribute('data-value', value);
            button.appendChild(buttonImg);
            button.appendChild(this.createTextNode_(content));
            contentDiv.appendChild(button);
        }
        contentDiv.style.width = (this as any).width_ + 'px';
        dropdownDiv.style.maxHeight = `400px`;
        dropdownDiv.appendChild(contentDiv);

        Blockly.DropDownDiv.setColour(this.sourceBlock_.getColour(), this.sourceBlock_.getColourTertiary());

        // Calculate positioning based on the field position.
        let scale = this.sourceBlock_.workspace.scale;
        let bBox = { width: this.size_.width, height: this.size_.height };
        bBox.width *= scale;
        bBox.height *= scale;
        let position = this.fieldGroup_.getBoundingClientRect();
        let primaryX = position.left + bBox.width / 2;
        let primaryY = position.top + bBox.height;
        let secondaryX = primaryX;
        let secondaryY = position.top;
        // Set bounds to workspace; show the drop-down.
        (Blockly.DropDownDiv as any).setBoundsElement(this.sourceBlock_.workspace.getParentSvg().parentNode);
        (Blockly.DropDownDiv as any).show(this, primaryX, primaryY, secondaryX, secondaryY,
            this.onHide_.bind(this));

        // Update colour to look selected.
        if (this.sourceBlock_.isShadow()) {
            this.savedPrimary_ = this.sourceBlock_.getColour();
            this.sourceBlock_.setColour(this.sourceBlock_.getColourTertiary(),
                this.sourceBlock_.getColourSecondary(), this.sourceBlock_.getColourTertiary());
        } else if (this.box_) {
            this.box_.setAttribute('fill', this.sourceBlock_.getColourTertiary());
        }
    }

    trimOptions_() {
    }

    protected onHide_() {
        super.onHide_();
        Blockly.DropDownDiv.getContentDiv().style.maxHeight = '';
    }

    private createTextNode_(content: string) {
        const category = content.substr(0, content.indexOf(' '));
        let text = content.substr(content.indexOf(' ') + 1);
        text = text.length > 15 ? text.substr(0, 12) + "..." : text;
        const textSpan = document.createElement('span');
        textSpan.setAttribute('class', 'blocklyDropdownText');
        textSpan.textContent = text;
        return textSpan;
    }

    protected buttonClick_ = function (e: any) {
        let value = e.target.getAttribute('data-value');
        this.setValue(value);
        Blockly.DropDownDiv.hide();
    };

    /**
     * Callback for when a button is hovered over inside the drop-down.
     * Should be bound to the FieldIconMenu.
     * @param {Event} e DOM event for the mouseover
     * @private
     */
    protected buttonEnter_ = function (value: any) {
        const jresValue = value.substring(value.lastIndexOf('.') + 1);
        const buf = this.soundCache_[jresValue];
        if (buf) {
            const refBuf = {
                data: pxt.U.stringToUint8Array(atob(buf))
            }
            pxsim.AudioContextManager.playBufferAsync(refBuf as any);
        }
    };

    protected buttonLeave_ = function () {
        pxsim.AudioContextManager.stop();
    };
}