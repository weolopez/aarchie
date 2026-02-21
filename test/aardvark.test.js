import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Aardvark } from "../src/aardvark.js";
import { AssistantMessageEventStream } from "../src/llm-integration.js";

// ============================================================================
// Mock Helpers
// ============================================================================

/**
 * Create a mock streamFn that returns a single assistant text response.
 */
function createMockStreamFn(responseText) {
	return (_model, _context, _options) => {
		const stream = new AssistantMessageEventStream();
		const partial = {
			role: "assistant",
			content: [{ type: "text", text: responseText }],
			api: "mock",
			provider: "mock",
			model: "mock-model",
			usage: {
				input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		};

		queueMicrotask(() => {
			stream.push({ type: "start", partial });
			stream.push({ type: "text_start", contentIndex: 0, partial });
			stream.push({ type: "text_delta", contentIndex: 0, delta: responseText, partial });
			stream.push({ type: "text_end", contentIndex: 0, content: responseText, partial });
			stream.push({ type: "done", reason: "stop", message: partial });
			stream.end(partial);
		});

		return stream;
	};
}

/**
 * Create a mock streamFn that returns multiple text content blocks.
 */
function createMockMultiTextStreamFn(texts) {
	return (_model, _context, _options) => {
		const stream = new AssistantMessageEventStream();
		const partial = {
			role: "assistant",
			content: texts.map((t) => ({ type: "text", text: t })),
			api: "mock",
			provider: "mock",
			model: "mock-model",
			usage: {
				input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		};

		queueMicrotask(() => {
			stream.push({ type: "start", partial });
			for (let i = 0; i < texts.length; i++) {
				stream.push({ type: "text_start", contentIndex: i, partial });
				stream.push({ type: "text_delta", contentIndex: i, delta: texts[i], partial });
				stream.push({ type: "text_end", contentIndex: i, content: texts[i], partial });
			}
			stream.push({ type: "done", reason: "stop", message: partial });
			stream.end(partial);
		});

		return stream;
	};
}

/**
 * Create a mock streamFn that returns an error stopReason.
 */
function createMockErrorStreamFn(errorMessage) {
	return (_model, _context, _options) => {
		const stream = new AssistantMessageEventStream();
		const partial = {
			role: "assistant",
			content: [{ type: "text", text: "" }],
			api: "mock",
			provider: "mock",
			model: "mock-model",
			usage: {
				input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "error",
			errorMessage,
			timestamp: Date.now(),
		};

		queueMicrotask(() => {
			stream.push({ type: "start", partial });
			stream.push({ type: "done", reason: "error", message: partial });
			stream.end(partial);
		});

		return stream;
	};
}

/**
 * Create a mock streamFn that first returns a tool call, then (on second
 * invocation) returns a text response.
 */
function createMockToolCallStreamFn(toolName, args, thenResponse) {
	let callCount = 0;
	return (_model, _context, _options) => {
		callCount++;
		const stream = new AssistantMessageEventStream();

		if (callCount === 1) {
			// First call: return a tool call
			const partial = {
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: `call_mock_${Date.now()}`,
						name: toolName,
						arguments: args,
					},
				],
				api: "mock",
				provider: "mock",
				model: "mock-model",
				usage: {
					input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "toolUse",
				timestamp: Date.now(),
			};

			queueMicrotask(() => {
				stream.push({ type: "start", partial });
				stream.push({ type: "toolcall_start", contentIndex: 0, partial });
				stream.push({ type: "toolcall_end", contentIndex: 0, toolCall: partial.content[0], partial });
				stream.push({ type: "done", reason: "toolUse", message: partial });
				stream.end(partial);
			});
		} else {
			// Subsequent calls: return text
			const partial = {
				role: "assistant",
				content: [{ type: "text", text: thenResponse }],
				api: "mock",
				provider: "mock",
				model: "mock-model",
				usage: {
					input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: Date.now(),
			};

			queueMicrotask(() => {
				stream.push({ type: "start", partial });
				stream.push({ type: "text_start", contentIndex: 0, partial });
				stream.push({ type: "text_delta", contentIndex: 0, delta: thenResponse, partial });
				stream.push({ type: "text_end", contentIndex: 0, content: thenResponse, partial });
				stream.push({ type: "done", reason: "stop", message: partial });
				stream.end(partial);
			});
		}

		return stream;
	};
}

// ============================================================================
// Constructor Tests
// ============================================================================

describe("Constructor", () => {
	it("new Aardvark(prompt, 'gemini') — model shortcut string", () => {
		const a = new Aardvark("You are helpful", "gemini");
		assert.equal(a.agent.state.model.provider, "google");
		assert.equal(a.agent.state.model.id, "gemini-3-flash-preview");
	});

	it("new Aardvark(prompt, 'openai') — openai shortcut", () => {
		const a = new Aardvark("You are helpful", "openai");
		assert.equal(a.agent.state.model.provider, "openai");
		assert.equal(a.agent.state.model.id, "gpt-4.1-mini");
	});

	it("new Aardvark(prompt, { model: 'gemini' }) — opts object with model shortcut", () => {
		const a = new Aardvark("You are helpful", { model: "gemini" });
		assert.equal(a.agent.state.model.provider, "google");
	});

	it("new Aardvark(prompt, { model: rawModelObj }) — opts with raw model object", () => {
		const rawModel = {
			id: "custom-model",
			name: "Custom",
			api: "custom",
			provider: "custom",
			baseUrl: "http://localhost",
		};
		const a = new Aardvark("You are helpful", { model: rawModel });
		assert.equal(a.agent.state.model.id, "custom-model");
		assert.equal(a.agent.state.model.provider, "custom");
	});

	it("new Aardvark(prompt) — defaults to gemini when no model given", () => {
		const a = new Aardvark("You are helpful");
		assert.equal(a.agent.state.model.provider, "google");
		assert.equal(a.agent.state.model.id, "gemini-3-flash-preview");
	});

	it("unknown model shortcut throws", () => {
		assert.throws(
			() => new Aardvark("prompt", "nonexistent"),
			(err) => err.message.includes("Unknown model shortcut")
		);
	});
});

// ============================================================================
// ask() Tests
// ============================================================================

describe("ask(prompt)", () => {
	it("returns text from a simple response", async () => {
		const a = new Aardvark("sys", { model: "gemini", streamFn: createMockStreamFn("Hello world") });
		const result = await a.ask("Hi");
		assert.equal(result, "Hello world");
	});

	it("joins multiple text content blocks", async () => {
		const a = new Aardvark("sys", { model: "gemini", streamFn: createMockMultiTextStreamFn(["Hello ", "world"]) });
		const result = await a.ask("Hi");
		assert.equal(result, "Hello world");
	});

	it("returns empty string when no assistant message", async () => {
		// Use a streamFn that produces no assistant message — we simulate by
		// having an immediate agent_end with no content.
		const streamFn = (_model, _context, _options) => {
			const stream = new AssistantMessageEventStream();
			// Push a minimal assistant message with empty content so the loop
			// completes without tool calls.
			const partial = {
				role: "assistant",
				content: [],
				api: "mock",
				provider: "mock",
				model: "mock-model",
				usage: {
					input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: Date.now(),
			};
			queueMicrotask(() => {
				stream.push({ type: "start", partial });
				stream.push({ type: "done", reason: "stop", message: partial });
				stream.end(partial);
			});
			return stream;
		};
		const a = new Aardvark("sys", { model: "gemini", streamFn });
		const result = await a.ask("Hi");
		// The loop produces an assistant message with empty content, so ask()
		// finds it but there are no text blocks => empty string join.
		assert.equal(result, "");
	});

	it("throws when stopReason is 'error'", async () => {
		const a = new Aardvark("sys", { model: "gemini", streamFn: createMockErrorStreamFn("Something broke") });
		await assert.rejects(
			() => a.ask("Hi"),
			(err) => err.message.includes("Something broke")
		);
	});
});

// ============================================================================
// askStream() Tests
// ============================================================================

describe("askStream(prompt)", () => {
	it("yields text deltas as an async iterable", async () => {
		const a = new Aardvark("sys", { model: "gemini", streamFn: createMockStreamFn("streamed") });
		const chunks = [];
		for await (const chunk of a.askStream("Hi")) {
			chunks.push(chunk);
		}
		assert.ok(chunks.length > 0);
		assert.equal(chunks.join(""), "streamed");
	});

	it("completes when agent ends", async () => {
		const a = new Aardvark("sys", { model: "gemini", streamFn: createMockStreamFn("done") });
		const chunks = [];
		for await (const chunk of a.askStream("Hi")) {
			chunks.push(chunk);
		}
		// If we reach here, the async iterable completed
		assert.equal(chunks.join(""), "done");
	});
});

// ============================================================================
// tool() Tests
// ============================================================================

describe("tool(name, desc, params, fn)", () => {
	it("registers a tool on the agent", () => {
		const a = new Aardvark("sys", { model: "gemini", streamFn: createMockStreamFn("ok") });
		a.tool("greet", "Greet someone", { type: "object", properties: { name: { type: "string" } } }, () => "hi");
		const tools = a.agent.state.tools;
		assert.equal(tools.length, 1);
		assert.equal(tools[0].name, "greet");
	});

	it("string return from fn gets wrapped into content format", async () => {
		const a = new Aardvark("sys", { model: "gemini", streamFn: createMockStreamFn("ok") });
		a.tool("echo", "Echo", {}, () => "echoed");
		const tool = a.agent.state.tools[0];
		const result = await tool.execute("id", {}, null, () => {});
		assert.deepEqual(result, { content: [{ type: "text", text: "echoed" }], details: {} });
	});

	it("object return from fn is passed through", async () => {
		const returnVal = { content: [{ type: "text", text: "custom" }], details: { foo: 1 } };
		const a = new Aardvark("sys", { model: "gemini", streamFn: createMockStreamFn("ok") });
		a.tool("custom", "Custom", {}, () => returnVal);
		const tool = a.agent.state.tools[0];
		const result = await tool.execute("id", {}, null, () => {});
		assert.deepEqual(result, returnVal);
	});

	it("replaces existing tool with same name", () => {
		const a = new Aardvark("sys", { model: "gemini", streamFn: createMockStreamFn("ok") });
		a.tool("t", "v1", {}, () => "v1");
		a.tool("t", "v2", {}, () => "v2");
		assert.equal(a.agent.state.tools.length, 1);
		assert.equal(a.agent.state.tools[0].description, "v2");
	});

	it("chainable (returns this)", () => {
		const a = new Aardvark("sys", { model: "gemini", streamFn: createMockStreamFn("ok") });
		const ret = a.tool("t", "d", {}, () => "x");
		assert.equal(ret, a);
	});
});

// ============================================================================
// on() Tests
// ============================================================================

describe("on(eventType, handler)", () => {
	it("fires handler only for matching event type", async () => {
		const a = new Aardvark("sys", { model: "gemini", streamFn: createMockStreamFn("hi") });
		const events = [];
		a.on("agent_end", (e) => events.push(e));
		await a.ask("Hi");
		assert.ok(events.length > 0);
		assert.ok(events.every((e) => e.type === "agent_end"));
	});

	it("returns an unsubscribe function that stops delivery", async () => {
		const a = new Aardvark("sys", { model: "gemini", streamFn: createMockStreamFn("hi") });
		const events = [];
		const unsub = a.on("agent_end", (e) => events.push(e));
		unsub();
		await a.ask("Hi");
		assert.equal(events.length, 0);
	});
});

// ============================================================================
// configure() Tests
// ============================================================================

describe("configure(opts)", () => {
	it("updates model", () => {
		const a = new Aardvark("sys", { model: "gemini", streamFn: createMockStreamFn("ok") });
		a.configure({ model: "openai" });
		assert.equal(a.agent.state.model.provider, "openai");
	});

	it("updates systemPrompt", () => {
		const a = new Aardvark("sys", { model: "gemini", streamFn: createMockStreamFn("ok") });
		a.configure({ systemPrompt: "new prompt" });
		assert.equal(a.agent.state.systemPrompt, "new prompt");
	});

	it("updates thinkingLevel", () => {
		const a = new Aardvark("sys", { model: "gemini", streamFn: createMockStreamFn("ok") });
		a.configure({ thinkingLevel: "high" });
		assert.equal(a.agent.state.thinkingLevel, "high");
	});

	it("chainable (returns this)", () => {
		const a = new Aardvark("sys", { model: "gemini", streamFn: createMockStreamFn("ok") });
		const ret = a.configure({ systemPrompt: "x" });
		assert.equal(ret, a);
	});
});

// ============================================================================
// clear() Tests
// ============================================================================

describe("clear()", () => {
	it("resets messages to empty", async () => {
		const a = new Aardvark("sys", { model: "gemini", streamFn: createMockStreamFn("hi") });
		await a.ask("Hello");
		assert.ok(a.messages.length > 0);
		a.clear();
		assert.equal(a.messages.length, 0);
	});
});

// ============================================================================
// Getter Tests
// ============================================================================

describe("Getters", () => {
	it("agent returns the underlying Agent instance", () => {
		const a = new Aardvark("sys", { model: "gemini", streamFn: createMockStreamFn("ok") });
		assert.ok(a.agent);
		assert.ok(a.agent.state);
		assert.ok(typeof a.agent.subscribe === "function");
	});

	it("messages returns agent state messages", async () => {
		const a = new Aardvark("sys", { model: "gemini", streamFn: createMockStreamFn("hi") });
		assert.deepEqual(a.messages, []);
		await a.ask("Hello");
		assert.ok(a.messages.length > 0);
	});

	it("lastReply returns text of last assistant message (or null)", async () => {
		const a = new Aardvark("sys", { model: "gemini", streamFn: createMockStreamFn("reply text") });
		assert.equal(a.lastReply, null);
		await a.ask("Hello");
		assert.equal(a.lastReply, "reply text");
	});

	it("isStreaming reflects agent state", async () => {
		const a = new Aardvark("sys", { model: "gemini", streamFn: createMockStreamFn("hi") });
		assert.equal(a.isStreaming, false);
		// After ask completes, should be false again
		await a.ask("Hello");
		assert.equal(a.isStreaming, false);
	});
});
