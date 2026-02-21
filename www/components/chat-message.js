/**
 * <chat-message> Web Component
 * Renders user/assistant chat bubbles with iOS Messages styling.
 *
 * Attributes:
 *   role    — "user" | "assistant"
 *   content — raw text (markdown parsed for display)
 */
class ChatMessage extends HTMLElement {
	static observedAttributes = ["role", "content", "variant"];

	constructor() {
		super();
		this.attachShadow({ mode: "open" });
	}

	connectedCallback() {
		this.render();
	}

	attributeChangedCallback() {
		this.render();
	}

	render() {
		const role = this.getAttribute("role") || "assistant";
		const content = this.getAttribute("content") || "";
		const isThinking = this.getAttribute("variant") === "thinking";

		this.shadowRoot.innerHTML = `
			<style>
				:host { display: block; }
				.message-row {
					display: flex;
					width: 100%;
				}
				.message-row.user { justify-content: flex-end; }
				.bubble {
					max-width: 75%;
					padding: 10px 14px;
					line-height: 1.4;
					word-wrap: break-word;
					font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
					font-size: 17px;
				}
				.user .bubble {
					background-color: var(--user-bubble, #007AFF);
					color: var(--user-text, #ffffff);
					border-radius: 18px 18px 4px 18px;
				}
				.assistant .bubble {
					background-color: var(--assistant-bubble, #E9E9EB);
					color: var(--assistant-text, #000000);
					border-radius: 18px 18px 18px 4px;
				}
				.assistant.thinking .bubble {
					background-color: #F2F2F7;
					color: rgba(60, 60, 67, 0.6);
					border-radius: 12px;
					font-style: italic;
					font-size: 15px;
				}
				.bubble p { margin-bottom: 8px; }
				.bubble p:last-child { margin-bottom: 0; }
				.bubble strong { font-weight: 600; }
				.bubble code {
					background-color: rgba(0,0,0,0.1);
					padding: 2px 4px;
					border-radius: 4px;
					font-family: "SF Mono", "Courier New", Courier, monospace;
					font-size: 15px;
				}
				.user .bubble code { background-color: rgba(255,255,255,0.2); }
				.bubble pre {
					background-color: #282c34;
					color: #abb2bf;
					padding: 12px;
					border-radius: 8px;
					overflow-x: auto;
					margin: 8px 0;
					font-family: "SF Mono", "Courier New", Courier, monospace;
					font-size: 13px;
				}
				.bubble pre code {
					background-color: transparent;
					padding: 0;
					color: inherit;
					font-size: 13px;
				}
			</style>
			<div class="message-row ${role}${isThinking ? " thinking" : ""}">
				<div class="bubble">${isThinking ? "💭 " : ""}${ChatMessage.parseMarkdown(content)}</div>
			</div>
		`;
	}

	/**
	 * Lightweight Markdown → HTML parser.
	 * Handles code blocks, inline code, bold, italic, paragraphs, newlines.
	 */
	static parseMarkdown(text) {
		if (!text) return "";

		const codeBlocks = [];
		let html = text.replace(/`{3}(?:[a-z]+)?\n([\s\S]*?)`{3}/gi, (_match, code) => {
			codeBlocks.push(code.replace(/</g, "&lt;").replace(/>/g, "&gt;"));
			return `___CODE_BLOCK_${codeBlocks.length - 1}___`;
		});

		html = html
			.replace(/<([^>]+)>/g, "&lt;$1&gt;")
			.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
			.replace(/\*([^*]+)\*/g, "<em>$1</em>")
			.replace(/`([^`]+)`/g, "<code>$1</code>")
			.replace(/\n\n/g, "</p><p>")
			.replace(/\n/g, "<br/>");

		codeBlocks.forEach((code, i) => {
			html = html.replace(`___CODE_BLOCK_${i}___`, `<pre><code>${code}</code></pre>`);
		});

		return `<p>${html}</p>`;
	}
}

customElements.define("chat-message", ChatMessage);
export default ChatMessage;
