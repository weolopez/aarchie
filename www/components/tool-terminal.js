/**
 * <tool-terminal> Web Component
 * Dark terminal-style UI for tool calls and results.
 *
 * Attributes:
 *   tool-name — name of the tool being executed
 *   code      — the code / arguments to display
 *   result    — tool execution result text
 *   pruned    — boolean, if set shows pruned notice instead
 */
class ToolTerminal extends HTMLElement {
	static observedAttributes = ["tool-name", "code", "result", "pruned"];

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
						font-size: 0.8rem;
						color: var(--system-text, #6b7280);
						text-align: center;
						font-style: italic;
						margin: 4px 0;
						font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
					}
				</style>
				<div class="pruned-notice">${this._esc(code || "Tool result pruned")}</div>
			`;
			return;
		}

		this.shadowRoot.innerHTML = `
			<style>
				:host { display: block; }
				.terminal {
					width: 100%;
					max-width: 90%;
					background-color: var(--terminal-bg, #1e1e1e);
					border-radius: 8px;
					overflow: hidden;
					font-family: 'Courier New', Courier, monospace;
					font-size: 0.85rem;
					margin: 4px 0;
					border: 1px solid #333;
				}
				.terminal-header {
					background-color: var(--terminal-header, #2d2d2d);
					padding: 6px 12px;
					color: #9cdcfe;
					display: flex;
					justify-content: space-between;
					align-items: center;
					border-bottom: 1px solid #111;
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
					<span>⚙️ Executing Tool: <strong>${this._esc(toolName)}</strong></span>
				</div>
				<div class="terminal-content">${this._esc(code)}</div>
				${result != null ? `<div class="terminal-result">${this._esc(result)}</div>` : ""}
			</div>
		`;
	}

	_esc(text) {
		return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	}
}

customElements.define("tool-terminal", ToolTerminal);
export default ToolTerminal;
