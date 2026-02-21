/**
 * <conversation-sidebar> Web Component
 * Overlay sidebar for browsing and switching conversations.
 *
 * Attributes:
 *   open      — boolean, controls panel visibility
 *   active-id — string, highlights the current conversation
 *
 * Property:
 *   conversations — array of { id, title, updatedAt }
 *
 * Events dispatched:
 *   "new-chat"  — user clicked New Chat
 *   "select"    — user clicked a conversation; detail: { id }
 *   "close"     — user clicked the overlay backdrop
 */
class ConversationSidebar extends HTMLElement {
	static observedAttributes = ["open", "active-id"];

	#conversations = [];

	constructor() {
		super();
		this.attachShadow({ mode: "open" });
		this.shadowRoot.innerHTML = `
			<style>
				:host {
					position: absolute;
					inset: 0;
					pointer-events: none;
					z-index: 100;
				}
				:host([open]) {
					pointer-events: auto;
				}
				.overlay {
					position: absolute;
					inset: 0;
					background: rgba(0, 0, 0, 0.35);
					opacity: 0;
					transition: opacity 0.2s ease;
				}
				:host([open]) .overlay {
					opacity: 1;
				}
				.panel {
					position: absolute;
					top: 0;
					left: 0;
					bottom: 0;
					width: 220px;
					background: #ffffff;
					border-right: 1px solid #e5e7eb;
					display: flex;
					flex-direction: column;
					transform: translateX(-100%);
					transition: transform 0.2s ease;
					overflow: hidden;
				}
				:host([open]) .panel {
					transform: translateX(0);
				}
				.panel-header {
					padding: 16px 12px 12px;
					border-bottom: 1px solid #e5e7eb;
					font-weight: 600;
					font-size: 0.85rem;
					color: #6b7280;
					text-transform: uppercase;
					letter-spacing: 0.05em;
					font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
				}
				.new-chat-btn {
					display: block;
					width: calc(100% - 24px);
					margin: 12px;
					padding: 8px 12px;
					border-radius: 8px;
					border: 1px solid #e5e7eb;
					background: #f3f4f6;
					color: #111827;
					font-size: 0.9rem;
					font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
					cursor: pointer;
					text-align: left;
				}
				.new-chat-btn:hover {
					background: #e5e7eb;
				}
				.convo-list {
					flex: 1;
					overflow-y: auto;
					padding: 0 8px 8px;
				}
				.convo-item {
					display: flex;
					align-items: center;
					width: 100%;
					padding: 8px 10px;
					border-radius: 6px;
					border: none;
					background: transparent;
					text-align: left;
					cursor: pointer;
					font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
					margin-bottom: 2px;
					box-sizing: border-box;
				}
				.convo-item:hover {
					background: #f3f4f6;
				}
				.convo-item.active {
					background: #dbeafe;
				}
				.convo-text {
					flex: 1;
					min-width: 0;
				}
				.convo-title {
					font-size: 0.875rem;
					color: #111827;
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
				}
				.convo-time {
					font-size: 0.75rem;
					color: #9ca3af;
					margin-top: 2px;
				}
				.delete-btn {
					flex-shrink: 0;
					margin-left: 6px;
					width: 20px;
					height: 20px;
					border-radius: 4px;
					border: none;
					background: transparent;
					color: #9ca3af;
					font-size: 14px;
					line-height: 1;
					cursor: pointer;
					display: flex;
					align-items: center;
					justify-content: center;
					opacity: 0;
					transition: opacity 0.1s, background 0.1s;
					padding: 0;
				}
				.convo-item:hover .delete-btn {
					opacity: 1;
				}
				.delete-btn:hover {
					background: #fee2e2;
					color: #ef4444;
				}
			</style>
			<div class="overlay"></div>
			<div class="panel">
				<div class="panel-header">Conversations</div>
				<button class="new-chat-btn">+ New Chat</button>
				<div class="convo-list"></div>
			</div>
		`;

		this.shadowRoot.querySelector(".overlay").addEventListener("click", () => {
			this.dispatchEvent(new CustomEvent("close", { bubbles: true }));
		});

		this.shadowRoot.querySelector(".new-chat-btn").addEventListener("click", () => {
			this.dispatchEvent(new CustomEvent("new-chat", { bubbles: true }));
		});
	}

	attributeChangedCallback(_name, _old, _new) {
		// active-id change requires re-render to update highlights
		if (_name === "active-id") {
			this.#render();
		}
	}

	get open() {
		return this.hasAttribute("open");
	}

	set open(val) {
		if (val) {
			this.setAttribute("open", "");
		} else {
			this.removeAttribute("open");
		}
	}

	get conversations() {
		return this.#conversations;
	}

	set conversations(arr) {
		this.#conversations = arr || [];
		this.#render();
	}

	#render() {
		const list = this.shadowRoot.querySelector(".convo-list");
		const activeId = this.getAttribute("active-id");
		list.innerHTML = "";

		for (const convo of this.#conversations) {
			const btn = document.createElement("button");
			btn.className = "convo-item" + (convo.id === activeId ? " active" : "");

			const text = document.createElement("div");
			text.className = "convo-text";

			const title = document.createElement("div");
			title.className = "convo-title";
			title.textContent = convo.title || "New Chat";

			const time = document.createElement("div");
			time.className = "convo-time";
			time.textContent = relativeTime(convo.updatedAt);

			text.appendChild(title);
			text.appendChild(time);

			const del = document.createElement("button");
			del.className = "delete-btn";
			del.title = "Delete conversation";
			del.textContent = "✕";
			del.addEventListener("click", (e) => {
				e.stopPropagation();
				this.dispatchEvent(new CustomEvent("delete", { bubbles: true, detail: { id: convo.id } }));
			});

			btn.appendChild(text);
			btn.appendChild(del);

			btn.addEventListener("click", () => {
				this.dispatchEvent(new CustomEvent("select", { bubbles: true, detail: { id: convo.id } }));
			});

			list.appendChild(btn);
		}
	}
}

function relativeTime(isoString) {
	if (!isoString) return "";
	const diff = Date.now() - new Date(isoString).getTime();
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

customElements.define("conversation-sidebar", ConversationSidebar);
export default ConversationSidebar;
