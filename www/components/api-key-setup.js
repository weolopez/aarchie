/**
 * <api-key-setup> Web Component
 * Full-screen onboarding/settings screen for entering the Gemini API key.
 *
 * Attributes:
 *   open — boolean, shows the screen when present
 *
 * Events dispatched:
 *   "key-saved" — user submitted a key; detail: { key }
 */
class ApiKeySetup extends HTMLElement {
	static observedAttributes = ["open"];

	constructor() {
		super();
		this.attachShadow({ mode: "open" });
		this.shadowRoot.innerHTML = `
			<style>
				:host {
					display: none;
					position: absolute;
					inset: 0;
					z-index: 200;
					font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
				}
				:host([open]) {
					display: flex;
					flex-direction: column;
				}
				.screen {
					flex: 1;
					display: flex;
					flex-direction: column;
					align-items: center;
					justify-content: center;
					background: #F2F2F7;
					padding: 32px 24px;
					padding-top: calc(32px + env(safe-area-inset-top));
					padding-bottom: calc(32px + env(safe-area-inset-bottom));
					gap: 0;
				}
				.icon {
					width: 72px;
					height: 72px;
					border-radius: 16px;
					background: #007AFF;
					display: flex;
					align-items: center;
					justify-content: center;
					margin-bottom: 20px;
					font-size: 36px;
				}
				h1 {
					font-size: 28px;
					font-weight: 700;
					color: #000;
					margin-bottom: 8px;
					text-align: center;
					letter-spacing: -0.5px;
				}
				.subtitle {
					font-size: 15px;
					color: rgba(60, 60, 67, 0.6);
					text-align: center;
					line-height: 1.4;
					margin-bottom: 36px;
					max-width: 300px;
				}
				.field-group {
					width: 100%;
					max-width: 360px;
					background: #fff;
					border-radius: 12px;
					overflow: hidden;
					margin-bottom: 12px;
				}
				.field-label {
					font-size: 13px;
					font-weight: 500;
					color: rgba(60, 60, 67, 0.6);
					text-transform: uppercase;
					letter-spacing: 0.04em;
					padding: 12px 16px 4px;
				}
				input {
					display: block;
					width: 100%;
					padding: 10px 16px 14px;
					border: none;
					outline: none;
					font-size: 17px;
					font-family: inherit;
					background: transparent;
					color: #000;
					-webkit-tap-highlight-color: transparent;
				}
				input::placeholder {
					color: rgba(60, 60, 67, 0.3);
					font-family: "SF Mono", "Courier New", Courier, monospace;
					font-size: 14px;
				}
				.error {
					width: 100%;
					max-width: 360px;
					font-size: 13px;
					color: #FF3B30;
					padding: 4px 4px 8px;
					display: none;
				}
				.error.visible { display: block; }
				.save-btn {
					width: 100%;
					max-width: 360px;
					height: 50px;
					border-radius: 14px;
					border: none;
					background: #007AFF;
					color: #fff;
					font-size: 17px;
					font-weight: 600;
					font-family: inherit;
					cursor: pointer;
					margin-top: 4px;
					-webkit-tap-highlight-color: transparent;
					transition: opacity 0.15s;
				}
				.save-btn:active { opacity: 0.75; }
				.save-btn:disabled {
					background: #C7C7CC;
					cursor: not-allowed;
				}
				.help-link {
					margin-top: 20px;
					font-size: 15px;
					color: #007AFF;
					text-decoration: none;
					-webkit-tap-highlight-color: transparent;
				}
				.help-link:active { opacity: 0.6; }
				.dismiss-bar {
					display: none;
					justify-content: flex-end;
					padding: 12px 16px;
					padding-top: calc(12px + env(safe-area-inset-top));
					background: rgba(255,255,255,0.85);
					backdrop-filter: blur(20px) saturate(180%);
					-webkit-backdrop-filter: blur(20px) saturate(180%);
					border-bottom: 0.5px solid rgba(60,60,67,0.29);
				}
				:host([dismissible]) .dismiss-bar { display: flex; }
				.dismiss-btn {
					font-size: 17px;
					color: #007AFF;
					border: none;
					background: transparent;
					cursor: pointer;
					padding: 0;
					font-family: inherit;
					-webkit-tap-highlight-color: transparent;
				}
			</style>
			<div class="dismiss-bar">
				<button class="dismiss-btn">Done</button>
			</div>
			<div class="screen">
				<div class="icon">🤖</div>
				<h1>Welcome to Aarchie</h1>
				<p class="subtitle">Enter your Google Gemini API key to get started. Your key is stored locally on this device.</p>
				<div class="field-group">
					<div class="field-label">Gemini API Key</div>
					<input
						type="password"
						placeholder="AIza..."
						autocomplete="off"
						autocorrect="off"
						autocapitalize="none"
						spellcheck="false"
					/>
				</div>
				<div class="error"></div>
				<button class="save-btn">Continue</button>
				<a
					class="help-link"
					href="https://aistudio.google.com/apikey"
					target="_blank"
					rel="noopener"
				>Get a free API key →</a>
			</div>
		`;

		this._input = this.shadowRoot.querySelector("input");
		this._btn = this.shadowRoot.querySelector(".save-btn");
		this._error = this.shadowRoot.querySelector(".error");

		this._btn.addEventListener("click", () => this._save());
		this._input.addEventListener("keypress", (e) => {
			if (e.key === "Enter") this._save();
		});
		this._input.addEventListener("input", () => {
			this._error.classList.remove("visible");
		});
		this.shadowRoot.querySelector(".dismiss-btn").addEventListener("click", () => {
			this.dispatchEvent(new CustomEvent("dismiss", { bubbles: true }));
		});
	}

	attributeChangedCallback(name) {
		if (name === "open" && this.hasAttribute("open")) {
			// Pre-fill with existing key if editing
			const existing = localStorage.getItem("GEMINI_API_KEY");
			if (existing) this._input.value = existing;
			setTimeout(() => this._input.focus(), 50);
		}
	}

	get open() {
		return this.hasAttribute("open");
	}

	set open(val) {
		if (val) this.setAttribute("open", "");
		else this.removeAttribute("open");
	}

	_save() {
		const key = this._input.value.trim();
		if (!key) {
			this._showError("Please enter your API key.");
			return;
		}
		if (!key.startsWith("AIza") || key.length < 20) {
			this._showError("That doesn't look like a valid Gemini API key.");
			return;
		}
		localStorage.setItem("GEMINI_API_KEY", key);
		this.dispatchEvent(new CustomEvent("key-saved", { bubbles: true, detail: { key } }));
	}

	_showError(msg) {
		this._error.textContent = msg;
		this._error.classList.add("visible");
		this._input.focus();
	}
}

customElements.define("api-key-setup", ApiKeySetup);
export default ApiKeySetup;
