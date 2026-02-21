/**
 * <chat-input> Web Component
 * Input field + send button. Dispatches a "send" CustomEvent with detail.text.
 *
 * Attributes / Properties:
 *   disabled — boolean, disables input and button during processing
 */
class ChatInput extends HTMLElement {
	static observedAttributes = ["disabled"];

	constructor() {
		super();
		this.attachShadow({ mode: "open" });
		this.shadowRoot.innerHTML = `
			<style>
				:host { display: block; }
				.input-container {
					padding: 16px;
					background-color: var(--chat-bg, #ffffff);
					border-top: 1px solid var(--border-color, #e5e7eb);
					display: flex;
					gap: 12px;
				}
				input {
					flex: 1;
					padding: 12px 16px;
					border: 1px solid var(--border-color, #e5e7eb);
					border-radius: 24px;
					outline: none;
					font-size: 1rem;
					transition: border-color 0.2s;
					font-family: inherit;
				}
				input:focus {
					border-color: var(--user-bubble, #3b82f6);
				}
				button {
					background-color: var(--user-bubble, #3b82f6);
					color: white;
					border: none;
					border-radius: 24px;
					padding: 0 24px;
					font-weight: 600;
					cursor: pointer;
					transition: background-color 0.2s;
					display: flex;
					align-items: center;
					justify-content: center;
					font-family: inherit;
				}
				button:hover { background-color: #2563eb; }
				button:disabled {
					background-color: #93c5fd;
					cursor: not-allowed;
				}
			</style>
			<div class="input-container">
				<input type="text" placeholder="Ask me for the weather, time, or location..." autocomplete="off" />
				<button>Send</button>
			</div>
		`;

		this._input = this.shadowRoot.querySelector("input");
		this._button = this.shadowRoot.querySelector("button");

		this._button.addEventListener("click", () => this._send());
		this._input.addEventListener("keypress", (e) => {
			if (e.key === "Enter") this._send();
		});
	}

	attributeChangedCallback(name) {
		if (name === "disabled") {
			const disabled = this.hasAttribute("disabled");
			this._input.disabled = disabled;
			this._button.disabled = disabled;
		}
	}

	get disabled() {
		return this.hasAttribute("disabled");
	}

	set disabled(val) {
		if (val) {
			this.setAttribute("disabled", "");
		} else {
			this.removeAttribute("disabled");
		}
	}

	_send() {
		const text = this._input.value.trim();
		if (!text || this.disabled) return;
		this._input.value = "";
		this.dispatchEvent(new CustomEvent("send", { detail: { text } }));
	}

	focus() {
		this._input.focus();
	}
}

customElements.define("chat-input", ChatInput);
export default ChatInput;
