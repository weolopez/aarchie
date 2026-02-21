/**
 * <tool-terminal> Web Component
 * Dark terminal-style UI for tool calls and results.
 * Collapsible — header always visible, content expands on tap.
 *
 * Attributes:
 *   tool-name — name of the tool being executed
 *   code      — the code / arguments to display
 *   result    — tool execution result text
 *   pruned    — boolean, if set shows pruned notice instead
 */
class ToolTerminal extends HTMLElement {
	static observedAttributes = ["tool-name", "code", "result", "pruned"];

	#open = false;

	constructor() {
		super();
		this.attachShadow({ mode: "open" });
	}

	connectedCallback() {
		this.render();
	}

	attributeChangedCallback() {
		if (this.isConnected) this.render();
	}

	render() {
		const toolName = this.getAttribute("tool-name") || "";
		const code = this.getAttribute("code") || "";
		const result = this.getAttribute("result");
		const pruned = this.hasAttribute("pruned");

		if (pruned) {
			this.shadowRoot.innerHTML = `
				<style>
					:host { display: block; }
					.pruned-notice {
						font-size: 13px;
						color: var(--system-text, rgba(60, 60, 67, 0.6));
						text-align: center;
						font-style: italic;
						margin: 4px 0;
						font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
					}
				</style>
				<div class="pruned-notice">${this._esc(code || "Tool result pruned")}</div>
			`;
			return;
		}

		const isOpen = this.#open;

		this.shadowRoot.innerHTML = `
			<style>
				:host { display: block; }
				.terminal {
					width: 100%;
					background-color: var(--terminal-bg, #1e1e1e);
					border-radius: 10px;
					overflow: hidden;
					font-family: "SF Mono", "Courier New", Courier, monospace;
					font-size: 13px;
					margin: 4px 0;
					border: 1px solid #333;
				}
				.terminal-header {
					background-color: var(--terminal-header, #2d2d2d);
					padding: 0 12px;
					min-height: 44px;
					color: #9cdcfe;
					display: flex;
					justify-content: space-between;
					align-items: center;
					border-bottom: 1px solid #111;
					cursor: pointer;
					user-select: none;
					-webkit-tap-highlight-color: transparent;
					gap: 8px;
				}
				.terminal-header:active {
					opacity: 0.75;
				}
				.tool-label {
					flex: 1;
					min-width: 0;
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
				}
				.chevron {
					flex-shrink: 0;
					color: #9cdcfe;
					transition: transform 0.2s ease;
					display: flex;
					align-items: center;
				}
				.chevron.open {
					transform: rotate(90deg);
				}
				.terminal-body {
					display: ${isOpen ? "block" : "none"};
				}
				.terminal-content {
					padding: 12px;
					color: var(--terminal-text, #d4d4d4);
					white-space: pre-wrap;
					word-wrap: break-word;
					max-height: 300px;
					overflow-y: auto;
				}
				.terminal-result {
					border-top: 1px dashed #444;
					padding: 12px;
					color: #ce9178;
					background-color: #1a1a1a;
					white-space: pre-wrap;
					word-wrap: break-word;
					max-height: 200px;
					overflow-y: auto;
				}
			</style>
			<div class="terminal">
				<div class="terminal-header">
					<span class="tool-label">⚙ <strong>${this._esc(toolName)}</strong></span>
					<span class="chevron ${isOpen ? "open" : ""}">
						<svg width="8" height="13" viewBox="0 0 8 13" fill="none">
							<path d="M1 1l6 5.5L1 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</span>
				</div>
				<div class="terminal-body">
					<div class="terminal-content">${this._esc(code)}</div>
					${result != null ? `<div class="terminal-result">${this._esc(result)}</div>` : ""}
				</div>
			</div>
		`;

		this.shadowRoot.querySelector(".terminal-header").addEventListener("click", () => {
			this.#open = !this.#open;
			this.render();
		});
	}

	_esc(text) {
		return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	}
}

customElements.define("tool-terminal", ToolTerminal);
export default ToolTerminal;
