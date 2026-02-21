/**
 * <chat-input> Web Component
 * Auto-growing textarea + iOS-style up-arrow send button.
 * Dispatches a "send" CustomEvent with detail.text.
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
					padding: 8px 12px;
					padding-bottom: max(8px, env(safe-area-inset-bottom));
					background: rgba(255, 255, 255, 0.85);
					backdrop-filter: blur(20px) saturate(180%);
					-webkit-backdrop-filter: blur(20px) saturate(180%);
					border-top: 0.5px solid rgba(60, 60, 67, 0.29);
					display: flex;
					gap: 8px;
					align-items: flex-end;
				}
				textarea {
					flex: 1;
					padding: 10px 14px;
					border: none;
					border-radius: 20px;
					outline: none;
					font-size: 17px;
					line-height: 1.4;
					font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
					background: #F2F2F7;
					color: #000000;
					resize: none;
					overflow-y: auto;
					max-height: calc(5 * 1.4 * 17px + 20px);
					min-height: 40px;
					display: block;
					-webkit-tap-highlight-color: transparent;
				}
				textarea::placeholder {
					color: rgba(60, 60, 67, 0.4);
				}
				textarea:disabled {
					opacity: 0.5;
				}
				.send-btn {
					width: 44px;
					height: 44px;
					min-width: 44px;
					border-radius: 50%;
					border: none;
					background-color: var(--user-bubble, #007AFF);
					color: white;
					cursor: pointer;
					display: flex;
					align-items: center;
					justify-content: center;
					flex-shrink: 0;
					transition: background-color 0.15s, transform 0.1s;
					-webkit-tap-highlight-color: transparent;
				}
				.send-btn:active {
					transform: scale(0.92);
				}
				.send-btn:disabled {
					background-color: #C7C7CC;
					cursor: not-allowed;
					transform: none;
				}
			</style>
			<div class="input-container">
				<textarea
					rows="1"
					placeholder="Message"
					autocomplete="off"
					autocorrect="on"
					autocapitalize="sentences"
					inputmode="text"
					enterkeyhint="send"
				></textarea>
				<button class="send-btn" aria-label="Send">
					<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
						<path d="M10 3L10 17M10 3L5 8M10 3L15 8" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>
			</div>
		`;

		this._textarea = this.shadowRoot.querySelector("textarea");
		this._button = this.shadowRoot.querySelector(".send-btn");

		this._button.addEventListener("click", () => this._send());
		this._textarea.addEventListener("keypress", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				this._send();
			}
		});
		this._textarea.addEventListener("input", () => this._autoGrow());
	}

	_autoGrow() {
		const ta = this._textarea;
		ta.style.height = "auto";
		ta.style.height = ta.scrollHeight + "px";
	}

	attributeChangedCallback(name) {
		if (name === "disabled") {
			const disabled = this.hasAttribute("disabled");
			this._textarea.disabled = disabled;
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
		const text = this._textarea.value.trim();
		if (!text || this.disabled) return;
		this._textarea.value = "";
		this._textarea.style.height = "auto";
		this.dispatchEvent(new CustomEvent("send", { detail: { text } }));
	}

	focus() {
		this._textarea.focus();
	}
}

customElements.define("chat-input", ChatInput);
export default ChatInput;
