/**
 * <typing-indicator> Web Component
 * iOS Messages-style three bouncing dots indicator.
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
				.typing-row {
					display: none;
					padding: 4px 16px 8px;
					align-items: center;
				}
				:host([active]) .typing-row {
					display: flex;
				}
				.bubble {
					background: #E9E9EB;
					border-radius: 18px 18px 18px 4px;
					padding: 10px 14px;
					display: flex;
					align-items: center;
					gap: 5px;
				}
				.dot {
					width: 8px;
					height: 8px;
					border-radius: 50%;
					background: #8E8E93;
					animation: bounce 0.6s ease-in-out infinite;
				}
				.dot:nth-child(2) { animation-delay: 0.15s; }
				.dot:nth-child(3) { animation-delay: 0.3s; }
				@keyframes bounce {
					0%, 100% { transform: translateY(0); }
					40% { transform: translateY(-6px); }
				}
			</style>
			<div class="typing-row">
				<div class="bubble">
					<div class="dot"></div>
					<div class="dot"></div>
					<div class="dot"></div>
				</div>
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
