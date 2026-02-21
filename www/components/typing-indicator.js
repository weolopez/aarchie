/**
 * <typing-indicator> Web Component
 * Spinner + "Agent is thinking..." text.
 *
 * Attributes:
 *   active — boolean, toggles visibility
 */
class TypingIndicator extends HTMLElement {
	static observedAttributes = ["active"];

	constructor() {
		super();
		this.attachShadow({ mode: "open" });
		this.shadowRoot.innerHTML = `
			<style>
				:host { display: block; }
				.typing-indicator {
					display: none;
					padding: 12px 16px;
					color: var(--system-text, #6b7280);
					font-size: 0.9rem;
					align-items: center;
					gap: 8px;
					font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
				}
				:host([active]) .typing-indicator {
					display: flex;
				}
				.spinner {
					width: 16px;
					height: 16px;
					border: 2px solid var(--border-color, #e5e7eb);
					border-top-color: var(--user-bubble, #3b82f6);
					border-radius: 50%;
					animation: spin 1s linear infinite;
				}
				@keyframes spin {
					to { transform: rotate(360deg); }
				}
			</style>
			<div class="typing-indicator">
				<div class="spinner"></div>
				<span>Agent is thinking...</span>
			</div>
		`;
	}

	get active() {
		return this.hasAttribute("active");
	}

	set active(val) {
		if (val) {
			this.setAttribute("active", "");
		} else {
			this.removeAttribute("active");
		}
	}
}

customElements.define("typing-indicator", TypingIndicator);
export default TypingIndicator;
