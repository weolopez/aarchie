/**
 * <chat-message> Web Component
 * Renders user/assistant chat bubbles with markdown support.
 *
 * Attributes:
 *   role    — "user" | "assistant"
 *   content — raw text (markdown parsed for display)
 */
class ChatMessage extends HTMLElement {
	static observedAttributes = ["role", "content"];

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

		this.shadowRoot.innerHTML = `
			<style>
				:host { display: block; }
				.message-row {
					display: flex;
					width: 100%;
				}
				.message-row.user { justify-content: flex-end; }
				.bubble {
					max-width: 80%;
					padding: 12px 16px;
					border-radius: 12px;
					line-height: 1.5;
					word-wrap: break-word;
					font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
					font-size: 1rem;
				}
				.user .bubble {
					background-color: var(--user-bubble, #3b82f6);
					color: var(--user-text, #ffffff);
					border-bottom-right-radius: 4px;
				}
				.assistant .bubble {
					background-color: var(--assistant-bubble, #f3f4f6);
					color: var(--assistant-text, #1f2937);
					border-bottom-left-radius: 4px;
				}
				.bubble p { margin-bottom: 8px; }
				.bubble p:last-child { margin-bottom: 0; }
				.bubble strong { font-weight: 600; }
				.bubble code {
					background-color: rgba(0,0,0,0.1);
					padding: 2px 4px;
					border-radius: 4px;
					font-family: monospace;
					font-size: 0.9em;
				}
				.user .bubble code { background-color: rgba(255,255,255,0.2); }
				.bubble pre {
					background-color: #282c34;
					color: #abb2bf;
					padding: 12px;
					border-radius: 8px;
					overflow-x: auto;
					margin: 8px 0;
					font-family: monospace;
					font-size: 0.9em;
				}
				.bubble pre code {
					background-color: transparent;
					padding: 0;
					color: inherit;
				}
			</style>
			<div class="message-row ${role}">
				<div class="bubble">${ChatMessage.parseMarkdown(content)}</div>
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
