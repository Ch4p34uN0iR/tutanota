// @flow
import {size, px} from "../size"
import {backface_fix, noselect} from "../mixins"
import m from "mithril"
import stream from "mithril/stream/stream.js"
import {lang} from "../../misc/LanguageViewModel"
import {animations, fontSize, transform} from "./../animation/Animations"
import {ease} from "../animation/Easing"
import {assertMainOrNode} from "../../api/Env"
import {theme} from "../theme"

assertMainOrNode()

const FALSE_CLOSURE = () => {
	return false
}

export const Type = {
	Text: "text",
	Email: "email",
	Password: "password",
	Area: "area",
	ExternalPassword: "externalpassword",
}

/**
 * A text input field.
 */
export class TextField {
	label: string|lazy<string>; // The labelId visible on the button. The labelId is not shown, if it is not provided.
	helpLabel: ?lazy<string>; // returns the translated and formatted help labelId
	value: stream<string>;
	type: TextFieldTypeEnum;
	baseLabelPosition: number;
	active: boolean;
	disabled: boolean;
	_injectionsLeft: ?Function; // only used by the BubbleTextField to display bubbles
	_injectionsRight: ?Function;
	_domWrapper: HTMLElement;
	_domLabel: HTMLElement;
	_domInput: HTMLInputElement;
	view: Function;
	onblur: stream<void>;
	skipNextBlur: boolean;
	_keyHandler: keyHandler; // interceptor used by the BubbleTextField to react on certain keys
	_alignRight: boolean;

	isEmpty: Function;

	constructor(labelIdOrLabelTextFunction: string|lazy<string>, helpLabel: ?lazy<string>) {
		this.label = labelIdOrLabelTextFunction
		this.active = false
		this.disabled = false
		this.helpLabel = helpLabel
		this.value = stream("")
		this.value.map(v => {
			if (this._domInput) {
				if (this.type == Type.Area && this.value != this._domInput.value) {
					this._domInput.value = this.value()
				}
			}
		})
		this.type = Type.Text
		this.baseLabelPosition = size.text_field_label_top
		this.onblur = stream()
		this.skipNextBlur = false
		this._keyHandler = null

		this.view = (): VirtualElement => {
			return m(".text-field.rel.overflow-hidden.text.pt", {
				oncreate: (vnode) => this._domWrapper = vnode.dom,
				onclick: (e) => this.focus(e)
			}, [
				m("label.abs.text-ellipsis.noselect.backface_fix.z1.i.pr-s", {
					class: this.active ? "content-accent-fg" : "",
					oncreate: (vnode) => {
						this._domLabel = vnode.dom
						if (this.isEmpty() && !this.disabled) { // if the text field is disabled do not show the label in base position.
							this._domLabel.style.fontSize = px(size.font_size_base)
							this._domLabel.style.transform = 'translateY(' + this.baseLabelPosition + "px)"
						} else {
							this._domLabel.style.fontSize = px(size.font_size_small)
							this._domLabel.style.transform = 'translateY(' + 0 + "px)"
						}
					},
				}, this.label instanceof Function ? this.label() : lang.get(this.label)),
				m(".flex.flex-column", [ // another wrapper to fix IE 11 min-height bug https://github.com/philipwalton/flexbugs#3-min-height-on-a-flex-container-wont-apply-to-its-flex-items
					m(".flex.items-end.flex-wrap", {
						style: {
							'min-height': px(size.button_height + 2), // 2 px border
							'padding-bottom': this.active ? px(0) : px(1),
							'border-bottom': this.disabled ? '1px solid transparent' : this.active ? `2px solid ${theme.content_accent}` : `1px solid ${theme.content_border}`,
						},
					}, [
						this._injectionsLeft ? this._injectionsLeft() : null,
						m(".inputWrapper.flex-space-between.items-end", {}, [ // additional wrapper element for bubble input field. input field should always be in one line with right injections
							this.type !== Type.Area ? this._getInputField() : this._getTextArea(),
							this._injectionsRight ? m(".mr-negative-s.flex-end.flex-no-shrink", this._injectionsRight()) : null
						])
					]),
				]),
				this.helpLabel ? m("small.noselect.click", {
						onclick: () => {
							if (this._domInput) this._domInput.focus()
						}
					}, this.helpLabel()) : []
			])
		}

		this.isEmpty = (): boolean => {
			return this.value() === ''
		}
	}

	_getInputField(): VirtualElement {
		if (this.disabled) {
			return m(this._alignRight ? ".right" : "", this.value())
		} else {
			return m("input.input" + (this._alignRight ? ".right" : ""), {
				type: (this.type == Type.ExternalPassword) ? (this.isActive() ? Type.Text : Type.Password) : this.type,
				value: this.value(),
				oncreate: (vnode) => this._domInput = vnode.dom,
				onfocus: (e) => this.focus(e),
				onblur: e => this.blur(e),
				onkeydown: e => {
					// keydown is used to cancel certain keypresses of the user (mainly needed for the BubbleTextField)
					let key = {keyCode: e.which, ctrl: e.ctrlKey}
					return this._keyHandler != null ? this._keyHandler(key) : true
				},
				onremove: e => {
					// workaround for chrome error on login with return shortcut "Error: Failed to execute 'removeChild' on 'Node': The node to be removed is no longer a child of this node. Perhaps it was moved in a 'blur' event handler?"
					// TODO test if still needed with mithril 1.1.1
					this._domInput.onblur = null
				},
				oninput: e => {
					if (this.isEmpty() && this._domInput.value !== "" && !this.active) {
						this.animate(true) // animate in case of browser autocompletion
					}
					this.value(this._domInput.value) // update the input on each change
				},
			})
		}
	}

	_getTextArea(): VirtualElement {
		if (this.disabled) {
			return m(".text-linebreaks", this.value())
		} else {
			return m("textarea.input-area", {
				oncreate: (vnode) => {
					this._domInput = vnode.dom
					this._domInput.value = this.value()
				},
				onfocus: (e) => this.focus(e),
				onblur: e => this.blur(e),
				onkeydown: e => {
					let key = {keyCode: e.which, ctrl: e.ctrlKey, shift: e.shiftKey}
					return this._keyHandler != null ? this._keyHandler(key) : true
				},
				oninput: e => {
					if (this.isEmpty() && this._domInput.value !== "" && !this.active) {
						this.animate(true) // animate in case of browser autocompletion
					}
					this._domInput.style.height = '0px';
					this._domInput.style.height = (this._domInput.scrollHeight) + 'px';
					this.value(this._domInput.value) // update the input on each change
				},
			})
		}
	}

	setType(type: TextFieldTypeEnum): TextField {
		this.type = type
		return this
	}

	setValue(value: ?string): TextField {
		this.value(value ? value : "")
		return this
	}

	onUpdate(updateHandler: handler<string>): TextField {
		this.value.map(updateHandler)
		return this
	}

	setDisabled(): TextField {
		this.disabled = true
		return this
	}

	alignRight(): TextField {
		this._alignRight = true
		return this
	}

	focus() {
		if (!this.isActive() && !this.disabled) {
			this.active = true
			this._domInput.focus()
			this._domWrapper.classList.add("active")
			if (this.isEmpty()) {
				this.animate(true)
			}
		}
	}

	blur(e: MouseEvent) {
		if (this.skipNextBlur) {
			this._domInput.focus()
		} else {
			this._domWrapper.classList.remove("active")
			if (this.isEmpty()) {
				this.animate(false)
			}
			this.active = false
			this.onblur(e)
		}
		this.skipNextBlur = false
	}

	animate(fadeIn: boolean) {
		let fontSizes = [size.font_size_base, size.font_size_small]
		let top = [this.baseLabelPosition, 0]
		if (!fadeIn) {
			fontSizes.reverse()
			top.reverse()
		}
		return animations.add(this._domLabel, [
			fontSize(fontSizes[0], fontSizes[1]),
			transform(transform.type.translateY, top[0], top[1])
		], {easing: ease.out})
	}

	isActive(): boolean {
		return this.active
	}

}
