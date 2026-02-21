/**
 * Aardvark — Higher-level wrapper for Agent
 */

import { Agent } from "./agent.js";
import {
	getModel,
	createApiStreamFunction,
	callWithToolsGoogle,
	callWithToolsOpenAI,
} from "./llm-integration.js";
// ============================================================================
// Model Shortcuts
// ============================================================================

const MODEL_SHORTCUTS = {
	gemini: () => getModel("google", "gemini-3-flash-preview"),
	openai: () => getModel("openai", "gpt-4.1-mini"),
	att: () => getModel("att", "gpt-4.1-mini"),
};

function resolveModel(input) {
	if (typeof input === "string") {
		const factory = MODEL_SHORTCUTS[input];
		if (!factory) throw new Error(`Unknown model shortcut: "${input}". Use: ${Object.keys(MODEL_SHORTCUTS).join(", ")}`);
		return factory();
	}
	return input;
}

function resolveStreamFn(model) {
	if (model.provider === "google") return createApiStreamFunction(callWithToolsGoogle);
	if (model.provider === "openai") return createApiStreamFunction(callWithToolsOpenAI);
	return undefined; // use Agent default (streamSimple)
}

// ============================================================================
// Aardvark Class
// ============================================================================

export class Aardvark {
	constructor(systemPrompt, modelOrOpts) {
		let model, opts;
		if (typeof modelOrOpts === "string" || (modelOrOpts && !modelOrOpts.model)) {
			// Aardvark("prompt", "gemini") or Aardvark("prompt", modelObject)
			model = resolveModel(modelOrOpts || "gemini");
			opts = {};
		} else {
			// Aardvark("prompt", { model: "openai", tools: [...], ... })
			opts = modelOrOpts || {};
			model = opts.model ? resolveModel(opts.model) : resolveModel("gemini");
		}

		const streamFn = opts.streamFn || resolveStreamFn(model);

		// Destructure to avoid spreading raw model/streamFn back over resolved values
		const { model: _m, streamFn: _s, ...restOpts } = opts;

		this._agent = new Agent({
			systemPrompt,
			model,
			tools: opts.tools || [],
			thinkingLevel: opts.thinkingLevel || "off",
			...(streamFn ? { streamFn } : {}),
			...restOpts,
		});
	}

	// -- Core API -------------------------------------------------------------

	async ask(prompt, images) {
		await this._agent.prompt(prompt, images);
		await this._agent.waitForIdle();

		const messages = this._agent.state.messages;
		const last = [...messages].reverse().find((m) => m.role === "assistant");
		if (!last) return "";

		if (last.stopReason === "error") {
			throw new Error(last.errorMessage || "LLM returned an error");
		}

		return last.content
			.filter((c) => c.type === "text")
			.map((c) => c.text)
			.join("");
	}

	askStream(prompt, images) {
		const agent = this._agent;
		const self = this;

		return {
			[Symbol.asyncIterator]() {
				let started = false;
				let done = false;
				let queue = [];
				let waiter = null;
				let unsub = null;

				function setup() {
					unsub = agent.subscribe((event) => {
						if (event.type === "message_update" && event.assistantMessageEvent) {
							const ae = event.assistantMessageEvent;
							if (ae.type === "text_delta") {
								enqueue(ae.delta);
							}
						}
						if (event.type === "agent_end") {
							finish();
						}
					});

					agent.prompt(prompt, images).catch(() => finish());
				}

				function enqueue(value) {
					if (waiter) {
						const resolve = waiter;
						waiter = null;
						resolve({ value, done: false });
					} else {
						queue.push(value);
					}
				}

				function finish() {
					done = true;
					if (unsub) { unsub(); unsub = null; }
					if (waiter) {
						const resolve = waiter;
						waiter = null;
						resolve({ value: undefined, done: true });
					}
				}

				return {
					next() {
						if (!started) { started = true; setup(); }
						if (queue.length > 0) {
							return Promise.resolve({ value: queue.shift(), done: false });
						}
						if (done) return Promise.resolve({ value: undefined, done: true });
						return new Promise((resolve) => { waiter = resolve; });
					},
					return() {
						finish();
						return Promise.resolve({ value: undefined, done: true });
					},
				};
			},
		};
	}

	// -- Tool registration ----------------------------------------------------

	tool(name, description, parameters, fn) {
		const wrappedTool = {
			name,
			description,
			parameters,
			execute: async (toolCallId, args, signal, onPartial) => {
				const result = await fn(args, { toolCallId, signal, onPartial });
				if (typeof result === "string") {
					return { content: [{ type: "text", text: result }], details: {} };
				}
				return result;
			},
		};

		const existing = this._agent.state.tools.filter((t) => t.name !== name);
		this._agent.setTools([...existing, wrappedTool]);
		return this;
	}

	// -- Events ---------------------------------------------------------------

	on(eventType, handler) {
		return this._agent.subscribe((event) => {
			if (event.type === eventType) handler(event);
		});
	}

	// -- Configuration --------------------------------------------------------

	configure(opts) {
		if (opts.model !== undefined) {
			const model = resolveModel(opts.model);
			this._agent.setModel(model);
			const streamFn = resolveStreamFn(model);
			if (streamFn) this._agent.streamFn = streamFn;
		}
		if (opts.systemPrompt !== undefined) this._agent.setSystemPrompt(opts.systemPrompt);
		if (opts.thinkingLevel !== undefined) this._agent.setThinkingLevel(opts.thinkingLevel);
		if (opts.streamFn !== undefined) this._agent.streamFn = opts.streamFn;
		if (opts.tools !== undefined) this._agent.setTools(opts.tools);
		if (opts.getApiKey !== undefined) this._agent.getApiKey = opts.getApiKey;
		return this;
	}

	clear() {
		this._agent.reset();
	}

	// -- Getters --------------------------------------------------------------

	get agent() {
		return this._agent;
	}

	get messages() {
		return this._agent.state.messages;
	}

	get lastReply() {
		const last = [...this._agent.state.messages].reverse().find((m) => m.role === "assistant");
		if (!last) return null;
		return last.content
			.filter((c) => c.type === "text")
			.map((c) => c.text)
			.join("");
	}

	get isStreaming() {
		return this._agent.state.isStreaming;
	}
}
