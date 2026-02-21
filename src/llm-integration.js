/**
 * Pi AI Implementation
 * This provides the minimum required functionality for the agent package
 */

// ============================================================================
// EventStream Class
// ============================================================================

export class EventStream {
	constructor(isComplete, extractResult) {
		this.queue = [];
		this.waiting = [];
		this.done = false;
		this.isComplete = isComplete;
		this.extractResult = extractResult;
		this.finalResultPromise = new Promise((resolve) => {
			this.resolveFinalResult = resolve;
		});
	}

	push(event) {
		if (this.done) return;

		if (this.isComplete(event)) {
			this.done = true;
			this.resolveFinalResult(this.extractResult(event));
		}

		const waiter = this.waiting.shift();
		if (waiter) {
			waiter({ value: event, done: false });
		} else {
			this.queue.push(event);
		}
	}

	end(result) {
		this.done = true;
		if (result !== undefined) {
			this.resolveFinalResult(result);
		}
		while (this.waiting.length > 0) {
			const waiter = this.waiting.shift();
			waiter({ value: undefined, done: true });
		}
	}

	async *[Symbol.asyncIterator]() {
		while (true) {
			if (this.queue.length > 0) {
				yield this.queue.shift();
			} else if (this.done) {
				return;
			} else {
				const result = await new Promise((resolve) => this.waiting.push(resolve));
				if (result.done) return;
				yield result.value;
			}
		}
	}

	result() {
		return this.finalResultPromise;
	}
}

// ============================================================================
// AssistantMessageEventStream
// ============================================================================

export class AssistantMessageEventStream extends EventStream {
	constructor() {
		super(
			(event) => event.type === "done" || event.type === "error",
			(event) => {
				if (event.type === "done") {
					return event.message;
				} else if (event.type === "error") {
					return event.error;
				}
				throw new Error("Unexpected event type for final result");
			}
		);
	}
}

// ============================================================================
// Model Registry
// ============================================================================
let localStorage = typeof window !== "undefined" ? window.localStorage : null;
let process = typeof global !== "undefined" ? global.process : null;
const MODELS = {
	google: {
		"gemini-3-flash-preview": {
			id: "gemini-3-flash-preview",
			name: "Gemini 3 Flash Preview",
			api: "google-generative-ai",
			provider: "google",
			baseUrl: "https://generativelanguage.googleapis.com",
			reasoning: false,
			input: ["text", "image"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			apiKey: localStorage?.getItem("GEMINI_API_KEY") || process?.env?.GEMINI_API_KEY,
			contextWindow: 1000000,
			maxTokens: 8192,
		},
	},
	openai: {
		"gpt-4.1-mini": {
			id: "gpt-4.1-mini",
			name: "GPT-4.1 Mini",
			api: "openai-completions",
			provider: "openai",
			baseUrl: "https://api.openai.com",
			reasoning: false,
			input: ["text", "image"],
			cost: { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 0 },
			apiKey: localStorage?.getItem("OPENAI_API_KEY") || process?.env?.OPENAI_API_KEY,
			contextWindow: 128000,
			maxTokens: 16384,
		},
	},
	att: {
		"gpt-4.1-mini": {
			id: "gpt-4.1-mini",
			name: "gpt-4.1-mini",
			api: "gpt-4.1-mini",
			provider: "att",
			baseUrl: "/api/ask-att/chat-with-tools",
			reasoning: false,
			input: ["text", "image"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 1000000,
			maxTokens: 8192,
		},
	},
};

export function getModel(provider, modelId) {
	return MODELS[provider]?.[modelId] || MODELS.google["gemini-3-flash-preview"];
}

// ============================================================================
// Factory for Creating Stream Functions for External APIs
// ============================================================================

/**
 * Create a stream function for an external API that uses the standard
 * OpenAI-style choice structure.
 * 
 * @param {Function} apiCall - Async function that calls your external API
 *   Expected signature: apiCall(messages, tools, options) -> Promise<OpenAIResponse>
 *   Expected response: { choices: [{ message, finish_reason }], usage }
 * @returns {Function} Stream function compatible with Agent configuration
 */
export function createApiStreamFunction(apiCall = callWithTools) {
	return (model, context, options = {}) => {
		return streamViaExternalApi(apiCall, model, context, options);
	};
}

// ============================================================================
// Real LLM API Implementation
// ============================================================================

/**
 * Call the LLM API with tools support
 * 
 * @param {Array} messages - Array of message objects
 * @param {Array} tools - Array of tool definitions
 * @param {Object} options - Optional configuration
 * @returns {Promise} Response from the API
 */
export async function callWithTools(messages, tools = [], options = {}) {
	console.log(`[API] Calling with ${messages.length} messages and ${tools.length} tools`);
	
	// Call the backend API
	const response = await fetch(options.baseUrl || '/api/ask-att/chat-with-tools', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(options.headers || {}),
		},
		body: JSON.stringify({
			messages: messages.map(m => {
				const msg = {
					role: m.role,
					content: m.content,
				};
				if (m.tool_calls) msg.tool_calls = m.tool_calls;
				if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
				if (m.name) msg.name = m.name;
				return msg;
			}),
			tools: tools?.map(t => ({
				type: 'function',
				function: {
					name: t.name,
					description: t.description,
					parameters: t.parameters,
				},
			})),
			model: options.model?.id || 'gpt-4.1-mini',
			temperature: options.temperature,
			max_tokens: options.maxTokens,
		}),
		signal: options.signal,
	});

	if (!response.ok) {
		throw new Error(`API error: ${response.status} ${response.statusText}`);
	}

	const actualResponse = await response.json();
	
	// Transform actual response format to expected OpenAI format
	const expectedResponse = {
		id: actualResponse.response_metadata.id,
		object: 'chat.completion',
		created: actualResponse.response_metadata.created,
		model: actualResponse.response_metadata.model_name,
		choices: [
			{
				index: 0,
				message: {
					role: 'assistant',
					content: actualResponse.content,
					tool_calls: actualResponse.tool_calls || [],
				},
				finish_reason: actualResponse.response_metadata.finish_reason,
			},
		],
		usage: {
			prompt_tokens: actualResponse.response_metadata.token_usage.prompt_tokens,
			completion_tokens: actualResponse.response_metadata.token_usage.completion_tokens,
			total_tokens: actualResponse.response_metadata.token_usage.total_tokens,
		},
	};
	
	return expectedResponse;
}

/**
 * Call the Google Gemini API with tools support
 * 
 * @param {Array} messages - Array of message objects
 * @param {Array} tools - Array of tool definitions
 * @param {Object} options - Optional configuration
 * @returns {Promise} Response in OpenAI format
 */
export async function callWithToolsGoogle(messages, tools = [], options = {}) {
	const apiKey = options.apiKey || process?.env.GEMINI_API_KEY;
	if (!apiKey) {
		throw new Error("Google API key is required. Set GEMINI_API_KEY environment variable or pass apiKey in options.");
	}

	const model = options.model?.id || "gemini-3-flash-preview";
	const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
	
	console.log(`[Google API] Calling ${model} with ${messages.length} messages and ${tools.length} tools`);

	const { systemInstruction, contents } = buildGeminiContents(messages);
	const googleTools = tools?.length
		? [{ functionDeclarations: tools.map((t) => ({
			name: t.name,
			description: t.description,
			parameters: t.parameters,
		})) }]
		: undefined;

	const requestBody = {
		contents: contents,
		...(systemInstruction ? { systemInstruction } : {}),
		...(googleTools ? { tools: googleTools } : {}),
		generationConfig: {
			...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
			...(options.maxTokens !== undefined ? { maxOutputTokens: options.maxTokens } : {}),
		},
	};

	const response = await fetch(`${baseUrl}?key=${apiKey}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(options.headers || {}),
		},
		body: JSON.stringify(requestBody),
		signal: options.signal,
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({}));
		console.error(`[Google API] ${response.status} error. Request body:`, JSON.stringify(requestBody, null, 2));
		console.error(`[Google API] Error details:`, error);
		throw new Error(`Google API error: ${response.status} ${response.statusText} - ${error.error?.message || ""}`);
	}

	const googleResponse = await response.json();
	console.log(`[Google API] Success. Usage:`, googleResponse.usageMetadata);
	const candidate = googleResponse.candidates?.[0];
	const { text, toolCalls } = extractGeminiOutput(candidate);
	const expectedResponse = {
		id: googleResponse.id || `gemini_${Date.now()}`,
		object: "chat.completion",
		created: Math.floor(Date.now() / 1000),
		model: model,
		choices: [
			{
				index: 0,
				message: {
					role: "assistant",
					content: text,
					tool_calls: toolCalls,
				},
				finish_reason: mapGeminiFinishReason(candidate?.finishReason, toolCalls.length > 0),
			},
		],
		usage: {
			prompt_tokens: googleResponse.usageMetadata?.promptTokenCount || 0,
			completion_tokens: googleResponse.usageMetadata?.candidatesTokenCount || 0,
			total_tokens: googleResponse.usageMetadata?.totalTokenCount || 0,
		},
	};

	return expectedResponse;
}

/**
 * Call the OpenAI API directly with tools support
 *
 * @param {Array} messages - Array of message objects (OpenAI format)
 * @param {Array} tools - Array of tool definitions
 * @param {Object} options - Optional configuration
 * @returns {Promise} Response in normalized OpenAI format
 */
export async function callWithToolsOpenAI(messages, tools = [], options = {}) {
	const apiKey = options.apiKey || process?.env?.OPENAI_API_KEY || localStorage?.getItem("OPENAI_API_KEY");
	if (!apiKey) {
		throw new Error("OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass apiKey in options.");
	}

	const model = options.model?.id || "gpt-4.1-mini";
	console.log(`[OpenAI API] Calling ${model} with ${messages.length} messages and ${tools.length} tools`);

	const cleanMessages = messages.map(m => {
		const msg = { role: m.role };
		if (m.role === "tool") {
			msg.tool_call_id = m.tool_call_id;
			msg.content = typeof m.content === "string" ? m.content
				: Array.isArray(m.content)
					? m.content.filter(c => c.type === "text").map(c => c.text).join("")
					: "";
		} else if (typeof m.content === "string") {
			msg.content = m.content;
		} else if (Array.isArray(m.content)) {
			msg.content = m.content.filter(c => c.type === "text").map(c => c.text).join("");
		} else {
			msg.content = m.content ?? "";
		}
		if (m.tool_calls) msg.tool_calls = m.tool_calls;
		if (m.name) msg.name = m.name;
		return msg;
	});

	const requestBody = {
		model,
		messages: cleanMessages,
		...(tools.length > 0 ? {
			tools: tools.map(t => ({
				type: "function",
				function: {
					name: t.name,
					description: t.description,
					parameters: t.parameters,
				},
			})),
		} : {}),
		...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
		...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
	};

	const response = await fetch("https://api.openai.com/v1/chat/completions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Authorization": `Bearer ${apiKey}`,
			...(options.headers || {}),
		},
		body: JSON.stringify(requestBody),
		signal: options.signal,
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({}));
		throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${error.error?.message || ""}`);
	}

	const openaiResponse = await response.json();
	console.log(`[OpenAI API] Success. Usage:`, openaiResponse.usage);

	const choice = openaiResponse.choices?.[0];
	const toolCalls = (choice?.message?.tool_calls || []).map(tc => ({
		id: tc.id,
		type: "function",
		function: {
			name: tc.function.name,
			arguments: tc.function.arguments,
		},
	}));

	return {
		id: openaiResponse.id,
		object: "chat.completion",
		created: openaiResponse.created,
		model: openaiResponse.model,
		choices: [
			{
				index: 0,
				message: {
					role: "assistant",
					content: choice?.message?.content || "",
					tool_calls: toolCalls,
				},
				finish_reason: choice?.finish_reason || "stop",
			},
		],
		usage: {
			prompt_tokens: openaiResponse.usage?.prompt_tokens || 0,
			completion_tokens: openaiResponse.usage?.completion_tokens || 0,
			total_tokens: openaiResponse.usage?.total_tokens || 0,
		},
	};
}

/**
 * Build Gemini contents and system instruction from OpenAI-style messages.
 */
function buildGeminiContents(messages) {
	const systemParts = [];
	const contents = [];

	for (const m of messages) {
		if (m.role === "system") {
			if (typeof m.content === "string" && m.content.trim() !== "") {
				systemParts.push({ text: m.content });
			}
			continue;
		}

		if (m.role === "tool") {
			const toolName = m.name || m.toolName || "unknown_tool";
			contents.push({
				role: "user",
				parts: [
					{
						functionResponse: {
							name: toolName,
							response: typeof m.content === "string"
								? { content: m.content }
								: (m.content || { content: "" }),
						},
					},
				],
			});
			continue;
		}

		const role = m.role === "assistant" ? "model" : "user";
		const parts = [];

		if (typeof m.content === "string") {
			parts.push({ text: m.content });
		} else if (Array.isArray(m.content)) {
			for (const part of m.content) {
				if (part?.type === "text" && part.text) {
					parts.push({ text: part.text });
				}
			}
		}

		if (m.tool_calls && m.tool_calls.length > 0) {
			for (const tc of m.tool_calls) {
				const rawArgs = tc.function?.arguments ?? tc.arguments ?? {};
				const args = typeof rawArgs === "string" ? safeParseJson(rawArgs) : rawArgs;
				// Retrieve thoughtSignature (native camelCase or snake_case fallback)
				const sig = tc.thoughtSignature || tc.thought_signature;
				const fcPart = {
					functionCall: {
						name: tc.function?.name || tc.name,
						args: args,
					},
				};
				// Include thoughtSignature if present (required by Gemini 3 for round-tripping)
				if (sig) {
					fcPart.thoughtSignature = sig;
				}
				parts.push(fcPart);
			}
		}

		if (parts.length > 0) {
			contents.push({ role, parts });
		}
	}

	return {
		systemInstruction: systemParts.length > 0 ? { role: "system", parts: systemParts } : undefined,
		contents,
	};
}

/**
 * Extract text and tool calls from a Gemini candidate.
 */
function extractGeminiOutput(candidate) {
	const parts = candidate?.content?.parts || [];
	let text = "";
	const toolCalls = [];

	for (const part of parts) {
		if (part.text && !part.thought) {
			text += part.text;
		}
		if (part.functionCall) {
			// Read thoughtSignature from either camelCase or snake_case (API may return either)
			const sig = part.thoughtSignature || part.thought_signature;
			const tc = {
				id: `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
				type: "function",
				function: {
					name: part.functionCall.name,
					arguments: JSON.stringify(part.functionCall.args || {}),
				},
			};
			// Preserve Gemini thought signature for round-tripping (required for Gemini 3)
			if (sig) {
				tc.thoughtSignature = sig;
				tc.thought_signature = sig; // keep both forms for downstream consumers
			}
			toolCalls.push(tc);
		}
	}

	return { text, toolCalls };
}

/**
 * Helper: map Gemini finishReason to OpenAI format
 */
function mapGeminiFinishReason(finishReason, hasToolCalls) {
	if (hasToolCalls) return "tool_calls";
	switch (finishReason) {
		case "STOP":
			return "stop";
		case "MAX_TOKENS":
			return "length";
		default:
			return "stop";
	}
}

function safeParseJson(value) {
	try {
		return JSON.parse(value);
	} catch {
		return {};
	}
}

/**
 * Default stream function using callWithTools
 */
export function streamSimple(model, context, options = {}) {
	return streamViaExternalApi(callWithTools, model, context, options);
}

// ============================================================================
// Streaming Implementation for External APIs
// ============================================================================

/**
 * Calls an external API and converts the OpenAI-style response to streaming events.
 * 
 * @param {Function} apiCall - Async function that calls the external API
 *   Should return: { choices: [{ message: { content?, tool_calls? }, finish_reason }], usage }
 * @param {Object} model - Model configuration
 * @param {Object} context - LLM context with messages and tools
 * @param {Object} options - Stream options
 * @returns {AssistantMessageEventStream}
 */
export function streamViaExternalApi(apiCall, model, context, options = {}) {
	const stream = new AssistantMessageEventStream();

	(async () => {
		try {
			// Prepend system prompt as a system message if present
			const messages = context.systemPrompt
				? [{ role: "system", content: context.systemPrompt }, ...context.messages]
				: context.messages;

			// Call the external API
			const response = await apiCall(messages, context.tools, options);
			
			// Extract the first choice (standard OpenAI format)
			const choice = response.choices?.[0];
			if (!choice) {
				throw new Error("Invalid API response: no choices");
			}

			// Build the assistant message from the response
			const partial = {
				role: "assistant",
				content: [],
				api: model.api,
				provider: model.provider,
				model: model.id,
				usage: {
					input: response.usage?.prompt_tokens || 0,
					output: response.usage?.completion_tokens || 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: response.usage?.total_tokens || 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: mapOpenAiFinishReason(choice.finish_reason),
				timestamp: Date.now(),
			};

			// Emit start event
			stream.push({ type: "start", partial });

			// Process message content (text)
			if (choice.message?.content) {
				const text = choice.message.content;
				partial.content.push({ type: "text", text });
				
				stream.push({ type: "text_start", contentIndex: 0, partial });
				stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial });
				stream.push({ type: "text_end", contentIndex: 0, content: text, partial });
			}

			// Process tool calls
			if (choice.message?.tool_calls && Array.isArray(choice.message.tool_calls)) {
				for (const toolCall of choice.message.tool_calls) {
					const contentIndex = partial.content.length;
					
					// Add tool call to content (preserve thoughtSignature for Gemini round-tripping)
					const sig = toolCall.thoughtSignature || toolCall.thought_signature;
					partial.content.push({
						type: "toolCall",
						id: toolCall.id || `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
						name: toolCall.function?.name || toolCall.name,
						arguments: typeof toolCall.function?.arguments === "string" 
							? JSON.parse(toolCall.function.arguments)
							: toolCall.function?.arguments || toolCall.arguments || {},
						...(sig ? {
							thoughtSignature: sig,
							thought_signature: sig,
						} : {}),
					});

					// Emit tool call events
					stream.push({ type: "toolcall_start", contentIndex, partial });
					stream.push({ type: "toolcall_end", contentIndex, toolCall: partial.content[contentIndex], partial });
				}
			}

			// Emit done event
			stream.push({ type: "done", reason: partial.stopReason, message: partial });
			stream.end(partial);

		} catch (error) {
			console.error("[streamViaExternalApi] API call failed:", error.message);

			// Forward the error as an assistant message so the agent (and user) can see it
			const errorText = `⚠️ API Error: ${error.message}`;
			const errorMessage = {
				role: "assistant",
				content: [{ type: "text", text: errorText }],
				api: model.api,
				provider: model.provider,
				model: model.id,
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "error",
				errorMessage: error.message,
				timestamp: Date.now(),
			};

			// Emit it like a normal text response so the UI shows the error
			stream.push({ type: "start", partial: errorMessage });
			stream.push({ type: "text_start", contentIndex: 0, partial: errorMessage });
			stream.push({ type: "text_delta", contentIndex: 0, delta: errorText, partial: errorMessage });
			stream.push({ type: "text_end", contentIndex: 0, content: errorText, partial: errorMessage });
			stream.push({ type: "done", reason: "error", message: errorMessage });
			stream.end(errorMessage);
		}
	})();

	return stream;
}

/**
 * Helper: map OpenAI finish_reason to internal stopReason
 */
function mapOpenAiFinishReason(finishReason) {
	switch (finishReason) {
		case "stop":
			return "stop";
		case "tool_calls":
			return "toolUse";
		case "length":
			return "length";
		default:
			return "stop";
	}
}
