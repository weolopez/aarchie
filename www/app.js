/**
 * UI layer — wires the agent to the DOM.
 * Agent configuration lives in agent.js; this file handles rendering,
 * persistence, WebSocket capture, and user interaction only.
 */
import { createAgent, convertToLlm, SYSTEM_PROMPT, tools } from "/www/agent.js";

// Components (self-registering)
import "/www/components/chat-message.js";
import "/www/components/chat-input.js";
import "/www/components/tool-terminal.js";
import "/www/components/typing-indicator.js";
import "/www/components/conversation-sidebar.js";

// ============================================================================
// WebSocket Connection for Conversation Capture
// ============================================================================

let ws = null;
let wsReady = false;
const wsQueue = [];

function connectWebSocket() {
	const protocol = location.protocol === "https:" ? "wss:" : "ws:";
	ws = new WebSocket(`${protocol}//${location.host}/ws`);

	ws.onopen = () => {
		wsReady = true;
		for (const msg of wsQueue) ws.send(msg);
		wsQueue.length = 0;
		console.log("[WS] Connected to server");
	};

	ws.onmessage = (e) => {
		try {
			const payload = JSON.parse(e.data);
			if (payload.type === "message_injection") {
				const el = document.createElement("chat-message");
				el.setAttribute("role", payload.role || "assistant");
				el.setAttribute("content", payload.content);
				chatContainer.appendChild(el);
				scrollToBottom();
			}
		} catch (err) {
			console.error("[WS] Error parsing message:", err);
		}
	};

	ws.onclose = () => {
		wsReady = false;
		console.log("[WS] Disconnected, reconnecting in 2s...");
		setTimeout(connectWebSocket, 2000);
	};

	ws.onerror = () => {};
}

function wsSend(payload) {
	const msg = JSON.stringify(payload);
	if (wsReady && ws?.readyState === WebSocket.OPEN) {
		ws.send(msg);
	} else {
		wsQueue.push(msg);
	}
}

connectWebSocket();

let conversationId = crypto.randomUUID();

// ============================================================================
// Agent
// ============================================================================

const agent = createAgent({
	convertToLlm(messages) {
		const llmMessages = convertToLlm(messages);
		wsSend({
			conversationId,
			type: "llm_request",
			messages: llmMessages,
			systemPrompt: SYSTEM_PROMPT,
			tools: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
		});
		return llmMessages;
	},
});

// ============================================================================
// Chat History Persistence
// ============================================================================

const INDEX_KEY = "agent-loop:index";
const MSG_PREFIX = "agent-loop:messages:";
let currentConversationId = null;

function getIndex() {
	try {
		const raw = localStorage.getItem(INDEX_KEY);
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

function saveIndex(index) {
	try {
		localStorage.setItem(INDEX_KEY, JSON.stringify(index));
	} catch { /* storage full */ }
}

function getTitleFromMessages(msgs) {
	for (const m of msgs) {
		if (m.role === "user") {
			const text = m.content?.filter((c) => c.type === "text").map((c) => c.text).join("").trim();
			if (text) return text.slice(0, 40);
		}
	}
	return "New Chat";
}

function saveHistory() {
	if (!currentConversationId) return;
	const msgs = agent.state.messages;
	try {
		localStorage.setItem(MSG_PREFIX + currentConversationId, JSON.stringify(msgs));
	} catch { /* storage full */ }

	const index = getIndex();
	const existing = index.findIndex((e) => e.id === currentConversationId);
	const entry = {
		id: currentConversationId,
		title: getTitleFromMessages(msgs),
		updatedAt: new Date().toISOString(),
	};
	if (existing >= 0) index.splice(existing, 1);
	index.unshift(entry);
	saveIndex(index);
	sidebar.conversations = getIndex();
	sidebar.setAttribute("active-id", currentConversationId);
}

function loadMessages(id) {
	try {
		const raw = localStorage.getItem(MSG_PREFIX + id);
		return raw ? JSON.parse(raw) : null;
	} catch {
		localStorage.removeItem(MSG_PREFIX + id);
		return null;
	}
}

function deleteConversation(id) {
	localStorage.removeItem(MSG_PREFIX + id);
	const index = getIndex().filter((e) => e.id !== id);
	saveIndex(index);
	sidebar.conversations = index;
	if (currentConversationId === id) {
		if (index.length > 0) {
			loadConversation(index[0].id);
		} else {
			startNewConversation();
		}
	}
}

function loadConversation(id) {
	const msgs = loadMessages(id);
	if (!msgs) return;
	currentConversationId = id;
	agent.replaceMessages(msgs);
	chatContainer.innerHTML = "";
	renderSavedMessages(msgs);
	scrollToBottom();
	sidebar.setAttribute("active-id", id);
	sidebar.open = false;
}

function startNewConversation() {
	currentConversationId = crypto.randomUUID();
	agent.replaceMessages([]);
	chatContainer.innerHTML = "";
	const greeting = document.createElement("chat-message");
	greeting.setAttribute("role", "assistant");
	greeting.setAttribute(
		"content",
		"Hello! I am your browser-native agent. I can write and execute JavaScript directly in this window. Try asking me:\n- *What time is it?*\n- *Where am I located?*\n- *What is the weather like here?*\n- *Search Wikipedia for Quantum Computing.*"
	);
	chatContainer.appendChild(greeting);
	sidebar.setAttribute("active-id", currentConversationId);
	sidebar.conversations = getIndex();
	sidebar.open = false;
}

// ============================================================================
// DOM Rendering
// ============================================================================

const chatContainer = document.getElementById("chat-container");
const typingIndicator = document.querySelector("typing-indicator");
const chatInput = document.querySelector("chat-input");
const sidebar = document.querySelector("conversation-sidebar");

function scrollToBottom() {
	chatContainer.scrollTop = chatContainer.scrollHeight;
}

const terminalMap = new Map();

function renderSavedMessages(messages) {
	const restoreTerminalMap = new Map();
	for (const msg of messages) {
		if (msg.role === "user") {
			const text = msg.content?.filter((c) => c.type === "text").map((c) => c.text).join("") || "";
			const el = document.createElement("chat-message");
			el.setAttribute("role", "user");
			el.setAttribute("content", text);
			chatContainer.appendChild(el);
		}

		if (msg.role === "assistant") {
			const text = msg.content?.filter((c) => c.type === "text").map((c) => c.text).join("") || "";
			if (text.trim()) {
				const el = document.createElement("chat-message");
				el.setAttribute("role", "assistant");
				el.setAttribute("content", text);
				chatContainer.appendChild(el);
			}
			const toolCalls = msg.content?.filter((c) => c.type === "toolCall") || [];
			for (const tc of toolCalls) {
				const el = document.createElement("tool-terminal");
				el.setAttribute("tool-name", tc.name);
				const args = typeof tc.arguments === "string" ? JSON.parse(tc.arguments || "{}") : (tc.arguments || {});
				if (tc.name === "execute_js") {
					el.setAttribute("code", args.code || "");
				} else if (tc.name === "load_skill") {
					el.setAttribute("code", `Loading skill manual: ${args.skill_name || ""}...`);
				} else {
					el.setAttribute("code", JSON.stringify(args, null, 2));
				}
				restoreTerminalMap.set(tc.id, el);
				chatContainer.appendChild(el);
			}
		}

		if (msg.role === "toolResult") {
			const terminal = restoreTerminalMap.get(msg.toolCallId);
			if (terminal) {
				const text = msg.content?.filter((c) => c.type === "text").map((c) => c.text).join("") || "";
				terminal.setAttribute("result", text);
			}
		}
	}
}

// ============================================================================
// Agent Event Subscription
// ============================================================================

agent.subscribe((event) => {
	wsSend({ conversationId, type: "agent_event", event });

	switch (event.type) {
		case "agent_start":
			conversationId = crypto.randomUUID();
			typingIndicator.active = true;
			chatInput.disabled = true;
			scrollToBottom();
			break;

		case "agent_end":
			typingIndicator.active = false;
			chatInput.disabled = false;
			saveHistory();
			scrollToBottom();
			break;

		case "message_start":
		case "message_end": {
			const msg = event.message;
			if (!msg) break;

			if (msg.role === "user" && event.type === "message_start") {
				const el = document.createElement("chat-message");
				const text = msg.content?.filter((c) => c.type === "text").map((c) => c.text).join("") || "";
				el.setAttribute("role", "user");
				el.setAttribute("content", text);
				chatContainer.appendChild(el);
				scrollToBottom();
			}

			if (msg.role === "assistant" && event.type === "message_end") {
				const text = (msg.content?.filter((c) => c.type === "text") || []).map((c) => c.text).join("");
				if (text.trim()) {
					const el = document.createElement("chat-message");
					el.setAttribute("role", "assistant");
					el.setAttribute("content", text);
					chatContainer.appendChild(el);
					scrollToBottom();
				}
			}

			if (msg.role === "toolResult" && event.type === "message_end") {
				const terminal = terminalMap.get(msg.toolCallId);
				if (terminal) {
					const text = msg.content?.filter((c) => c.type === "text").map((c) => c.text).join("") || "";
					terminal.setAttribute("result", text);
				}
				scrollToBottom();
			}
			break;
		}

		case "tool_execution_start": {
			const el = document.createElement("tool-terminal");
			el.setAttribute("tool-name", event.toolName);
			if (event.toolName === "execute_js") {
				el.setAttribute("code", event.args?.code || "");
			} else if (event.toolName === "load_skill") {
				el.setAttribute("code", `Loading skill manual: ${event.args?.skill_name || ""}...`);
			} else {
				el.setAttribute("code", JSON.stringify(event.args || {}, null, 2));
			}
			terminalMap.set(event.toolCallId, el);
			chatContainer.appendChild(el);
			scrollToBottom();
			break;
		}
	}
});

// ============================================================================
// Input + Startup
// ============================================================================

chatInput.addEventListener("send", (e) => {
	agent.prompt(e.detail.text);
});

// Migration: old single-key format → new per-conversation format
const LEGACY_KEY = "agent-loop:messages";
if (localStorage.getItem(LEGACY_KEY) && !localStorage.getItem(INDEX_KEY)) {
	try {
		const legacyMsgs = JSON.parse(localStorage.getItem(LEGACY_KEY));
		if (legacyMsgs?.length > 0) {
			const migId = crypto.randomUUID();
			localStorage.setItem(MSG_PREFIX + migId, JSON.stringify(legacyMsgs));
			saveIndex([{ id: migId, title: getTitleFromMessages(legacyMsgs), updatedAt: new Date().toISOString() }]);
		}
	} catch { /* corrupt data, skip */ }
	localStorage.removeItem(LEGACY_KEY);
}

const index = getIndex();
if (index.length > 0) {
	loadConversation(index[0].id);
} else {
	startNewConversation();
}

sidebar.conversations = getIndex();
sidebar.addEventListener("select", (e) => loadConversation(e.detail.id));
sidebar.addEventListener("delete", (e) => deleteConversation(e.detail.id));
sidebar.addEventListener("new-chat", () => startNewConversation());
sidebar.addEventListener("close", () => { sidebar.open = false; });
document.getElementById("sidebar-toggle").addEventListener("click", () => {
	sidebar.open = !sidebar.open;
});
