/**
 * Standalone Agent Implementation
 * (Updated with Ephemeral Tool Context Pruning for Dynamic Skills)
 */

import { EventStream, getModel, streamSimple } from "./llm-integration.js";

// ============================================================================
// Agent Loop Implementation
// ============================================================================

/**
 * Start an agent loop with a new prompt message.
 * The prompt is added to the context and events are emitted for it.
 */
export function agentLoop(prompts, context, config, signal, streamFn) {
	const stream = createAgentStream();

	(async () => {
		const newMessages = [...prompts];
		const currentContext = {
			...context,
			messages: [...context.messages, ...prompts],
		};

		stream.push({ type: "agent_start" });
		stream.push({ type: "turn_start" });
		for (const prompt of prompts) {
			stream.push({ type: "message_start", message: prompt });
			stream.push({ type: "message_end", message: prompt });
		}

		await runLoop(currentContext, newMessages, config, signal, stream, streamFn);
	})();

	return stream;
}

/**
 * Continue an agent loop from the current context without adding a new message.
 * Used for retries - context already has user message or tool results.
 */
export function agentLoopContinue(context, config, signal, streamFn) {
	if (context.messages.length === 0) {
		throw new Error("Cannot continue: no messages in context");
	}

	if (context.messages[context.messages.length - 1].role === "assistant") {
		throw new Error("Cannot continue from message role: assistant");
	}

	const stream = createAgentStream();

	(async () => {
		const newMessages = [];
		const currentContext = { ...context };

		stream.push({ type: "agent_start" });
		stream.push({ type: "turn_start" });

		await runLoop(currentContext, newMessages, config, signal, stream, streamFn);
	})();

	return stream;
}

function createAgentStream() {
	return new EventStream(
		(event) => event.type === "agent_end",
		(event) => (event.type === "agent_end" ? event.messages : [])
	);
}

/**
 * Main loop logic shared by agentLoop and agentLoopContinue.
 */
async function runLoop(currentContext, newMessages, config, signal, stream, streamFn) {
	let firstTurn = true;
	let pendingMessages = (await config.getSteeringMessages?.()) || [];
	const MAX_TOOL_TURNS = config.maxToolTurns || 10;
	let toolTurnCount = 0;

	// Outer loop: continues when queued follow-up messages arrive after agent would stop
	while (true) {
		let hasMoreToolCalls = true;
		let steeringAfterTools = null;

		// Inner loop: process tool calls and steering messages
		while (hasMoreToolCalls || pendingMessages.length > 0) {
			if (!firstTurn) {
				stream.push({ type: "turn_start" });
			} else {
				firstTurn = false;
			}

			// Safety: prevent infinite tool-call loops
			if (toolTurnCount >= MAX_TOOL_TURNS) {
				console.warn(`[Agent] Max tool turns (${MAX_TOOL_TURNS}) reached, stopping loop.`);

				// Inject a system message asking for a progress summary
				const limitMessage = {
					role: "user",
					content: [{
						type: "text",
						text: "You have reached the maximum number of tool calls allowed for this session. Please summarize: (1) what you have accomplished so far, and (2) what still needs to be done, so the user can decide how to continue.",
					}],
					timestamp: Date.now(),
				};
				currentContext.messages.push(limitMessage);
				newMessages.push(limitMessage);
				stream.push({ type: "message_start", message: limitMessage });
				stream.push({ type: "message_end", message: limitMessage });

				// Make one final LLM call to get a summary response
				const summaryMessage = await streamAssistantResponse(currentContext, config, signal, stream, streamFn);
				newMessages.push(summaryMessage);
				stream.push({ type: "turn_end", message: summaryMessage, toolResults: [] });

				hasMoreToolCalls = false;
				break;
			}

			// Process pending messages (inject before next assistant response)
			if (pendingMessages.length > 0) {
				for (const message of pendingMessages) {
					stream.push({ type: "message_start", message });
					stream.push({ type: "message_end", message });
					currentContext.messages.push(message);
					newMessages.push(message);
				}
				pendingMessages = [];
			}

			// Stream assistant response
			const message = await streamAssistantResponse(currentContext, config, signal, stream, streamFn);
			newMessages.push(message);

			if (message.stopReason === "error" || message.stopReason === "aborted") {
				stream.push({ type: "turn_end", message, toolResults: [] });
				stream.push({ type: "agent_end", messages: newMessages });
				stream.end(newMessages);
				return;
			}

			// Check for tool calls
			const toolCalls = message.content.filter((c) => c.type === "toolCall");
			hasMoreToolCalls = toolCalls.length > 0;

			const toolResults = [];
			if (hasMoreToolCalls) {
				toolTurnCount++;
				const toolExecution = await executeToolCalls(
					currentContext.tools,
					message,
					signal,
					stream,
					config.getSteeringMessages
				);
				toolResults.push(...toolExecution.toolResults);
				steeringAfterTools = toolExecution.steeringMessages ?? null;

				for (const result of toolResults) {
					currentContext.messages.push(result);
					newMessages.push(result);
				}
			}

			stream.push({ type: "turn_end", message, toolResults });

			// Get steering messages after turn completes
			if (steeringAfterTools && steeringAfterTools.length > 0) {
				pendingMessages = steeringAfterTools;
				steeringAfterTools = null;
			} else {
				pendingMessages = (await config.getSteeringMessages?.()) || [];
			}
		}

		// Agent would stop here. Check for follow-up messages.
		const followUpMessages = (await config.getFollowUpMessages?.()) || [];
		if (followUpMessages.length > 0) {
			// Set as pending so inner loop processes them
			pendingMessages = followUpMessages;
			continue;
		}

		// No more messages, exit
		break;
	}

	stream.push({ type: "agent_end", messages: newMessages });
	stream.end(newMessages);
}

/**
 * Stream an assistant response from the LLM.
 */
async function streamAssistantResponse(context, config, signal, stream, streamFn) {
	// Apply context transform if configured
	let messages = context.messages;
	if (config.transformContext) {
		messages = await config.transformContext(messages, signal);
	}

	// Convert to LLM-compatible messages (Prunes ephemeral skills)
	const llmMessages = await config.convertToLlm(messages);

	// Build LLM context
	const llmContext = {
		systemPrompt: context.systemPrompt,
		messages: llmMessages,
		tools: context.tools,
	};

	const streamFunction = streamFn || streamSimple;

	const resolvedApiKey =
		(config.getApiKey ? await config.getApiKey(config.model.provider) : undefined) || config.apiKey;

	const response = await streamFunction(config.model, llmContext, {
		...config,
		apiKey: resolvedApiKey,
		signal,
	});

	let partialMessage = null;
	let addedPartial = false;

	for await (const event of response) {
		switch (event.type) {
			case "start":
				partialMessage = event.partial;
				context.messages.push(partialMessage);
				addedPartial = true;
				stream.push({ type: "message_start", message: { ...partialMessage } });
				break;

			case "text_start":
			case "text_delta":
			case "text_end":
			case "thinking_start":
			case "thinking_delta":
			case "thinking_end":
			case "toolcall_start":
			case "toolcall_delta":
			case "toolcall_end":
				if (partialMessage) {
					partialMessage = event.partial;
					context.messages[context.messages.length - 1] = partialMessage;
					stream.push({
						type: "message_update",
						assistantMessageEvent: event,
						message: { ...partialMessage },
					});
				}
				break;

			case "done":
			case "error": {
				const finalMessage = await response.result();
				if (addedPartial) {
					context.messages[context.messages.length - 1] = finalMessage;
				} else {
					context.messages.push(finalMessage);
				}
				if (!addedPartial) {
					stream.push({ type: "message_start", message: { ...finalMessage } });
				}
				stream.push({ type: "message_end", message: finalMessage });
				return finalMessage;
			}
		}
	}

	return await response.result();
}

/**
 * Execute tool calls from an assistant message.
 */
async function executeToolCalls(tools, assistantMessage, signal, stream, getSteeringMessages) {
	const toolCalls = assistantMessage.content.filter((c) => c.type === "toolCall");
	const results = [];
	let steeringMessages;

	for (let index = 0; index < toolCalls.length; index++) {
		const toolCall = toolCalls[index];
		const tool = tools?.find((t) => t.name === toolCall.name);

		stream.push({
			type: "tool_execution_start",
			toolCallId: toolCall.id,
			toolName: toolCall.name,
			args: toolCall.arguments,
		});

		let result;
		let isError = false;

		try {
			if (!tool) throw new Error(`Tool ${toolCall.name} not found`);

			result = await tool.execute(toolCall.id, toolCall.arguments, signal, (partialResult) => {
				stream.push({
					type: "tool_execution_update",
					toolCallId: toolCall.id,
					toolName: toolCall.name,
					args: toolCall.arguments,
					partialResult,
				});
			});
		} catch (e) {
			result = {
				content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
				details: {},
				ephemeral: false // Defaults to false on error
			};
			isError = true;
		}

		stream.push({
			type: "tool_execution_end",
			toolCallId: toolCall.id,
			toolName: toolCall.name,
			result,
			isError,
		});

		const toolResultMessage = {
			role: "toolResult",
			toolCallId: toolCall.id,
			toolName: toolCall.name,
			content: result.content,
			details: result.details || {},
			isError,
			ephemeral: result.ephemeral === true, // NEW: Capture the ephemeral flag
			timestamp: Date.now(),
		};

		results.push(toolResultMessage);
		stream.push({ type: "message_start", message: toolResultMessage });
		stream.push({ type: "message_end", message: toolResultMessage });

		// Check for steering messages - skip remaining tools if user interrupted
		if (getSteeringMessages) {
			const steering = await getSteeringMessages();
			if (steering.length > 0) {
				steeringMessages = steering;
				const remainingCalls = toolCalls.slice(index + 1);
				for (const skipped of remainingCalls) {
					results.push(skipToolCall(skipped, stream));
				}
				break;
			}
		}
	}

	return { toolResults: results, steeringMessages };
}

function skipToolCall(toolCall, stream) {
	const result = {
		content: [{ type: "text", text: "Skipped due to queued user message." }],
		details: {},
		ephemeral: false
	};

	stream.push({
		type: "tool_execution_start",
		toolCallId: toolCall.id,
		toolName: toolCall.name,
		args: toolCall.arguments,
	});
	stream.push({
		type: "tool_execution_end",
		toolCallId: toolCall.id,
		toolName: toolCall.name,
		result,
		isError: true,
	});

	const toolResultMessage = {
		role: "toolResult",
		toolCallId: toolCall.id,
		toolName: toolCall.name,
		content: result.content,
		details: {},
		isError: true,
		ephemeral: false,
		timestamp: Date.now(),
	};

	stream.push({ type: "message_start", message: toolResultMessage });
	stream.push({ type: "message_end", message: toolResultMessage });

	return toolResultMessage;
}

// ============================================================================
// Agent Class
// ============================================================================

/**
 * Default convertToLlm: 
 * Keeps LLM-compatible messages and intelligently prunes heavy "ephemeral" 
 * tool results (like loaded skill manuals) from previous turns.
 */
function defaultConvertToLlm(messages) {
	// Filter to valid LLM roles
	const llmMessages = messages.filter((m) => m.role === "user" || m.role === "assistant" || m.role === "toolResult");

	// Prune ephemeral messages that are no longer in the active turn.
	// We determine a message is "old" if there is a subsequent 'assistant' message after it,
	// which implies the agent has already read it and taken its next action.
	let seenAssistantAfter = false;

	// Iterate backwards to safely mutate while checking future context
	for (let i = llmMessages.length - 1; i >= 0; i--) {
		const m = llmMessages[i];
		
		if (m.role === "assistant") {
			seenAssistantAfter = true;
		}

		// If it's an ephemeral tool result AND the assistant has already responded since then
		if (m.role === "toolResult" && m.ephemeral && seenAssistantAfter) {
			// Replace heavy content with a placeholder to save tokens
			llmMessages[i] = {
				...m,
				content: [{ 
					type: "text", 
					text: `[System Log: Content of ${m.toolName} was unloaded from working memory to save space. Task proceeded.]` 
				}]
			};
		}
	}

	return llmMessages;
}

export class Agent {
	constructor(opts = {}) {
		this._state = {
			systemPrompt: opts.systemPrompt !== undefined ? opts.systemPrompt : "",
			model: opts.model !== undefined ? opts.model : getModel("google", "gemini-3-flash-preview"),
			thinkingLevel: opts.thinkingLevel !== undefined ? opts.thinkingLevel : "off",
			tools: opts.tools !== undefined ? opts.tools : [],
			messages: opts.messages !== undefined ? opts.messages : [],
			isStreaming: opts.isStreaming !== undefined ? opts.isStreaming : false,
			streamMessage: opts.streamMessage !== undefined ? opts.streamMessage : null,
			pendingToolCalls: opts.pendingToolCalls !== undefined ? opts.pendingToolCalls : new Set(),
			error: opts.error,
			...opts.initialState,
		};

		this.listeners = new Set();
		this.abortController = undefined;
		this.convertToLlm = opts.convertToLlm || defaultConvertToLlm; // Uses our new pruning logic
		this.transformContext = opts.transformContext;
		this.steeringQueue = [];
		this.followUpQueue = [];
		this.steeringMode = opts.steeringMode || "one-at-a-time";
		this.followUpMode = opts.followUpMode || "one-at-a-time";
		this.streamFn = opts.streamFn || streamSimple;
		this._sessionId = opts.sessionId;
		this.getApiKey = opts.getApiKey || (() => opts.model?.apiKey);
		this.runningPrompt = undefined;
		this.resolveRunningPrompt = undefined;
		this._thinkingBudgets = opts.thinkingBudgets;
		this._maxRetryDelayMs = opts.maxRetryDelayMs;
	}

    // ... (All getters, setters, and class methods remain exactly identical to your original code from here down)
    
	get sessionId() { return this._sessionId; }
	set sessionId(value) { this._sessionId = value; }
	get thinkingBudgets() { return this._thinkingBudgets; }
	set thinkingBudgets(value) { this._thinkingBudgets = value; }
	get maxRetryDelayMs() { return this._maxRetryDelayMs; }
	set maxRetryDelayMs(value) { this._maxRetryDelayMs = value; }
	get state() { return this._state; }

	subscribe(fn) {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	setSystemPrompt(v) { this._state.systemPrompt = v; }
	setModel(m) { this._state.model = m; }
	setThinkingLevel(l) { this._state.thinkingLevel = l; }
	setSteeringMode(mode) { this.steeringMode = mode; }
	getSteeringMode() { return this.steeringMode; }
	setFollowUpMode(mode) { this.followUpMode = mode; }
	getFollowUpMode() { return this.followUpMode; }
	setTools(t) { this._state.tools = t; }

	replaceMessages(ms) { this._state.messages = ms.slice(); }
	appendMessage(m) { this._state.messages = [...this._state.messages, m]; }
	steer(m) { this.steeringQueue.push(m); }
	followUp(m) { this.followUpQueue.push(m); }
	clearSteeringQueue() { this.steeringQueue = []; }
	clearFollowUpQueue() { this.followUpQueue = []; }
	clearAllQueues() { this.steeringQueue = []; this.followUpQueue = []; }
	clearMessages() { this._state.messages = []; }
	abort() { this.abortController?.abort(); }
	waitForIdle() { return this.runningPrompt ?? Promise.resolve(); }

	reset() {
		this._state.messages = [];
		this._state.isStreaming = false;
		this._state.streamMessage = null;
		this._state.pendingToolCalls = new Set();
		this._state.error = undefined;
		this.steeringQueue = [];
		this.followUpQueue = [];
	}

	async prompt(input, images) {
		if (this._state.isStreaming) {
			throw new Error("Agent is already processing a prompt.");
		}

		const model = this._state.model;
		if (!model) throw new Error("No model configured");

		let msgs;

		if (Array.isArray(input)) {
			msgs = input;
		} else if (typeof input === "string") {
			const content = [{ type: "text", text: input }];
			if (images && images.length > 0) {
				content.push(...images);
			}
			msgs = [
				{
					role: "user",
					content,
					timestamp: Date.now(),
				},
			];
		} else {
			msgs = [input];
		}

		await this._runLoop(msgs);
	}

	async continue() {
		if (this._state.isStreaming) {
			throw new Error("Agent is already processing.");
		}

		const messages = this._state.messages;
		if (messages.length === 0) {
			throw new Error("No messages to continue from");
		}
		if (messages[messages.length - 1].role === "assistant") {
			throw new Error("Cannot continue from message role: assistant");
		}

		await this._runLoop(undefined);
	}

	async _runLoop(messages) {
		const model = this._state.model;
		if (!model) throw new Error("No model configured");

		this.runningPrompt = new Promise((resolve) => {
			this.resolveRunningPrompt = resolve;
		});

		this.abortController = new AbortController();
		this._state.isStreaming = true;
		this._state.streamMessage = null;
		this._state.error = undefined;

		const reasoning = this._state.thinkingLevel === "off" ? undefined : this._state.thinkingLevel;

		const context = {
			systemPrompt: this._state.systemPrompt,
			messages: this._state.messages.slice(),
			tools: this._state.tools,
		};

		const config = {
			model,
			reasoning,
			sessionId: this._sessionId,
			thinkingBudgets: this._thinkingBudgets,
			maxRetryDelayMs: this._maxRetryDelayMs,
			convertToLlm: this.convertToLlm,
			transformContext: this.transformContext,
			getApiKey: this.getApiKey,
			getSteeringMessages: async () => {
				if (this.steeringMode === "one-at-a-time") {
					if (this.steeringQueue.length > 0) {
						const first = this.steeringQueue[0];
						this.steeringQueue = this.steeringQueue.slice(1);
						return [first];
					}
					return [];
				} else {
					const steering = this.steeringQueue.slice();
					this.steeringQueue = [];
					return steering;
				}
			},
			getFollowUpMessages: async () => {
				if (this.followUpMode === "one-at-a-time") {
					if (this.followUpQueue.length > 0) {
						const first = this.followUpQueue[0];
						this.followUpQueue = this.followUpQueue.slice(1);
						return [first];
					}
					return [];
				} else {
					const followUp = this.followUpQueue.slice();
					this.followUpQueue = [];
					return followUp;
				}
			},
		};

		let partial = null;

		try {
			const stream = messages
				? agentLoop(messages, context, config, this.abortController.signal, this.streamFn)
				: agentLoopContinue(context, config, this.abortController.signal, this.streamFn);

			for await (const event of stream) {
				switch (event.type) {
					case "message_start":
					case "message_update":
						partial = event.message;
						this._state.streamMessage = event.message;
						break;

					case "message_end":
						partial = null;
						this._state.streamMessage = null;
						this.appendMessage(event.message);
						break;

					case "tool_execution_start": {
						const s = new Set(this._state.pendingToolCalls);
						s.add(event.toolCallId);
						this._state.pendingToolCalls = s;
						break;
					}

					case "tool_execution_end": {
						const s = new Set(this._state.pendingToolCalls);
						s.delete(event.toolCallId);
						this._state.pendingToolCalls = s;
						break;
					}

					case "turn_end":
						if (event.message.role === "assistant" && event.message.errorMessage) {
							this._state.error = event.message.errorMessage;
						}
						break;

					case "agent_end":
						this._state.isStreaming = false;
						this._state.streamMessage = null;
						break;
				}

				this.emit(event);
			}

			if (partial && partial.role === "assistant" && partial.content.length > 0) {
				const onlyEmpty = !partial.content.some(
					(c) =>
						(c.type === "thinking" && c.thinking.trim().length > 0) ||
						(c.type === "text" && c.text.trim().length > 0) ||
						(c.type === "toolCall" && c.name.trim().length > 0)
				);
				if (!onlyEmpty) {
					this.appendMessage(partial);
				} else {
					if (this.abortController?.signal.aborted) {
						throw new Error("Request was aborted");
					}
				}
			}
		} catch (err) {
			const errorMsg = {
				role: "assistant",
				content: [{ type: "text", text: "" }],
				api: model.api,
				provider: model.provider,
				model: model.id,
				usage: {
					input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: this.abortController?.signal.aborted ? "aborted" : "error",
				errorMessage: err?.message || String(err),
				timestamp: Date.now(),
			};

			this.appendMessage(errorMsg);
			this._state.error = err?.message || String(err);
			this.emit({ type: "agent_end", messages: [errorMsg] });
		} finally {
			this._state.isStreaming = false;
			this._state.streamMessage = null;
			this._state.pendingToolCalls = new Set();
			this.abortController = undefined;
			this.resolveRunningPrompt?.();
			this.runningPrompt = undefined;
			this.resolveRunningPrompt = undefined;
		}
	}

	emit(e) {
		for (const listener of this.listeners) {
			listener(e);
		}
	}
}

// ... (Stream Proxy Implementation remains identical)