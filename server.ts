/**
 * Deno server for the agent-loop web app.
 *
 * - Serves static files from project root (www/, src/)
 * - WebSocket endpoint at /ws for real-time conversation capture
 * - REST API for retrieving captured conversations
 *
 * Run: deno run --allow-net --allow-read server.ts
 */

const PORT = 3000;

// ============================================================================
// MIME Types
// ============================================================================

const MIME_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".mjs": "application/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".ico": "image/x-icon",
};

function getMimeType(path: string): string {
	const ext = path.substring(path.lastIndexOf("."));
	return MIME_TYPES[ext] || "application/octet-stream";
}

// ============================================================================
// Conversation Store
// ============================================================================

interface ConversationEvent {
	timestamp: string;
	type: string;
	data: unknown;
}

interface Conversation {
	id: string;
	startedAt: string;
	events: ConversationEvent[];
}

const conversations = new Map<string, Conversation>();
const LOG_FILE = "activity.log";

async function logToFile(message: string) {
	const encoder = new TextEncoder();
	const data = encoder.encode(message + "\n");
	await Deno.writeFile(LOG_FILE, data, { append: true });
}

function getOrCreateConversation(id: string): Conversation {
	let conv = conversations.get(id);
	if (!conv) {
		conv = { id, startedAt: new Date().toISOString(), events: [] };
		conversations.set(id, conv);
	}
	return conv;
}

// ============================================================================
// WebSocket Handling
// ============================================================================

const wsClients = new Set<WebSocket>();

function handleWebSocket(req: Request): Response {
	const { socket, response } = Deno.upgradeWebSocket(req);

	socket.onopen = () => {
		wsClients.add(socket);
		console.log(`[WS] Client connected (${wsClients.size} total)`);
	};

	socket.onmessage = (e) => {
		try {
			const payload = JSON.parse(e.data);
			const { conversationId, type, ...rest } = payload;

			if (!conversationId) {
				console.warn("[WS] Received event without conversationId, ignoring");
				return;
			}

			const conv = getOrCreateConversation(conversationId);
			const event: ConversationEvent = {
				timestamp: new Date().toISOString(),
				type,
				data: rest,
			};
			conv.events.push(event);

			// Log to console and file
			let preview = "";
			let fullDetail = "";

			if (type === "llm_request") {
				preview = `(${rest.messages?.length ?? 0} messages, ${rest.tools?.length ?? 0} tools)`;
			} else if (type === "agent_event") {
				const agentEvent = rest.event;
				preview = `(${agentEvent?.type ?? "?"})`;
				
				if (agentEvent?.type === "message_end") {
					const msg = agentEvent.message;
					if (msg.role === "user" || msg.role === "assistant") {
						const text = msg.content?.filter((c: any) => c.type === "text").map((c: any) => c.text).join("") || "";
						if (text) {
							fullDetail = `\n[${msg.role.toUpperCase()}] ${text}`;
						}
					}
				}
			}

			const logLine = `[${new Date().toISOString()}] [${conversationId.slice(0, 8)}] ${type} ${preview}${fullDetail}`;
			console.log(logLine);
			logToFile(logLine);
		} catch (err) {
			console.error("[WS] Failed to parse message:", err);
		}
	};

	socket.onclose = () => {
		wsClients.delete(socket);
		console.log(`[WS] Client disconnected (${wsClients.size} total)`);
	};

	socket.onerror = (err) => {
		console.error("[WS] Error:", err);
		wsClients.delete(socket);
	};

	return response;
}

// ============================================================================
// REST API
// ============================================================================

async function handleApi(req: Request, pathname: string): Promise<Response> {
	const headers = { "Content-Type": "application/json; charset=utf-8" };

	// POST /api/inject-message
	if (pathname === "/api/inject-message" && req.method === "POST") {
		try {
			const body = await req.json();
			const { content, role = "assistant" } = body;
			
			if (!content) {
				return new Response(JSON.stringify({ error: "Missing content" }), { status: 400, headers });
			}

			const payload = JSON.stringify({
				type: "message_injection",
				role,
				content,
				timestamp: new Date().toISOString()
			});

			for (const client of wsClients) {
				if (client.readyState === WebSocket.OPEN) {
					client.send(payload);
				}
			}

			await logToFile(`[${new Date().toISOString()}] [INJECTED] [${role.toUpperCase()}] ${content}`);

			return new Response(JSON.stringify({ success: true }), { headers });
		} catch (err) {
			return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers });
		}
	}

	// GET /api/conversations
	if (pathname === "/api/conversations") {
		const list = [...conversations.values()].map((c) => ({
			id: c.id,
			startedAt: c.startedAt,
			eventCount: c.events.length,
		}));
		return new Response(JSON.stringify(list, null, 2), { headers });
	}

	// GET /api/conversations/latest
	if (pathname === "/api/conversations/latest") {
		const all = [...conversations.values()];
		if (all.length === 0) {
			return new Response(JSON.stringify({ error: "No conversations yet" }), {
				status: 404,
				headers,
			});
		}
		const latest = all[all.length - 1];
		return new Response(JSON.stringify(latest, null, 2), { headers });
	}

	// GET /api/conversations/:id
	const match = pathname.match(/^\/api\/conversations\/(.+)$/);
	if (match) {
		const conv = conversations.get(match[1]);
		if (!conv) {
			return new Response(JSON.stringify({ error: "Conversation not found" }), {
				status: 404,
				headers,
			});
		}
		return new Response(JSON.stringify(conv, null, 2), { headers });
	}

	return new Response(JSON.stringify({ error: "Not found" }), {
		status: 404,
		headers,
	});
}

// ============================================================================
// Static File Serving
// ============================================================================

async function serveStaticFile(pathname: string): Promise<Response> {
	// Route / to /www/index.html
	if (pathname === "/") {
		pathname = "/www/index.html";
	}

	const filePath = `.${pathname}`;

	try {
		const file = await Deno.open(filePath, { read: true });
		const stat = await file.stat();

		if (stat.isDirectory) {
			file.close();
			return new Response("Not Found", { status: 404 });
		}

		return new Response(file.readable, {
			headers: {
				"Content-Type": getMimeType(pathname),
				"Content-Length": String(stat.size),
				"Cache-Control": "no-store",
			},
		});
	} catch {
		return new Response("Not Found", { status: 404 });
	}
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve({ port: PORT }, async (req: Request): Promise<Response> => {
	const url = new URL(req.url);
	const pathname = url.pathname;

	// WebSocket upgrade
	if (pathname === "/ws") {
		if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
			return handleWebSocket(req);
		}
		return new Response("Expected WebSocket upgrade", { status: 400 });
	}

	// REST API
	if (pathname.startsWith("/api/")) {
		return await handleApi(req, pathname);
	}

	// Static files
	return await serveStaticFile(pathname);
});

console.log(`Server running at http://localhost:${PORT}`);
