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
					background: rgba(0, 0, 0, 0.4);
					opacity: 0;
					transition: opacity 0.25s ease;
				}
				:host([open]) .overlay {
					opacity: 1;
				}
				.panel {
					position: absolute;
					top: 0;
					left: 0;
					bottom: 0;
					width: 280px;
					background: #ffffff;
					border-right: 0.5px solid rgba(60, 60, 67, 0.29);
					display: flex;
					flex-direction: column;
					transform: translateX(-100%);
					transition: transform 0.25s ease;
					overflow: hidden;
					padding-top: env(safe-area-inset-top);
					padding-bottom: env(safe-area-inset-bottom);
				}
				:host([open]) .panel {
					transform: translateX(0);
				}
				.panel-header {
					padding: 16px 16px 10px;
					border-bottom: 0.5px solid rgba(60, 60, 67, 0.29);
					font-size: 13px;
					font-weight: 600;
					color: rgba(60, 60, 67, 0.6);
					text-transform: uppercase;
					letter-spacing: 0.06em;
					font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
				}
				.new-chat-btn {
					display: block;
					width: calc(100% - 24px);
					margin: 12px;
					padding: 0 16px;
					height: 44px;
					border-radius: 22px;
					border: none;
					background: #007AFF;
					color: #ffffff;
					font-size: 17px;
					font-weight: 600;
					font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
					cursor: pointer;
					text-align: center;
					-webkit-tap-highlight-color: transparent;
					transition: opacity 0.15s;
				}
				.new-chat-btn:active {
					opacity: 0.75;
				}
				.convo-list {
					flex: 1;
					overflow-y: auto;
					-webkit-overflow-scrolling: touch;
					padding: 4px 0 8px;
				}
				.convo-item {
					display: flex;
					align-items: center;
					width: 100%;
					min-height: 44px;
					padding: 12px 16px;
					border-radius: 0;
					border: none;
					background: transparent;
					text-align: left;
					cursor: pointer;
					font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
					-webkit-tap-highlight-color: transparent;
					box-sizing: border-box;
				}
				.convo-item:active {
					background: #F2F2F7;
				}
				.convo-item.active {
					background: rgba(0, 122, 255, 0.1);
				}
				.convo-text {
					flex: 1;
					min-width: 0;
				}
				.convo-title {
					font-size: 15px;
					color: #000000;
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
				}
				.convo-time {
					font-size: 13px;
					color: rgba(60, 60, 67, 0.6);
					margin-top: 2px;
				}
				.delete-btn {
					flex-shrink: 0;
					margin-left: 8px;
					width: 44px;
					height: 44px;
					border-radius: 50%;
					border: none;
					background: transparent;
					color: #8E8E93;
					cursor: pointer;
					display: flex;
					align-items: center;
					justify-content: center;
					opacity: 0.4;
					transition: opacity 0.15s, background 0.15s;
					padding: 0;
					-webkit-tap-highlight-color: transparent;
				}
				.delete-btn:active,
				.delete-btn:focus {
					opacity: 1;
					background: rgba(255, 59, 48, 0.1);
					color: #FF3B30;
				}
			</style>
			<div class="overlay"></div>
			<div class="panel">
				<div class="panel-header">Conversations</div>
				<button class="new-chat-btn">New Chat</button>
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
			del.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
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
