/**
 * Agent configuration — system prompt, skill registry, tools, model, and LLM
 * message conversion. No DOM, WebSocket, or persistence dependencies.
 */
import { Agent } from "/src/agent.js";
import { getModel, createApiStreamFunction, callWithToolsGoogle } from "/src/llm-integration.js";

// ============================================================================
// Skill Registry
// ============================================================================

export const SKILL_REGISTRY = {
	weather_api: {
		description: "Fetches current weather data.",
		markdown: `# Weather API Skill\nTo get the weather, use the Open-Meteo API. It requires latitude and longitude. No API key is needed.\n\n**Example Usage:**\n\`\`\`javascript\n// 1. Get location\nconst pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));\nconst lat = pos.coords.latitude;\nconst lon = pos.coords.longitude;\n\n// 2. Fetch weather\nconst url = \`https://api.open-meteo.com/v1/forecast?latitude=\${lat}&longitude=\${lon}&current_weather=true\`;\nconst response = await fetch(url);\nconst data = await response.json();\n\nreturn data.current_weather;\n\`\`\``,
	},
	wikipedia_search: {
		description: "Searches Wikipedia for information.",
		markdown: `# Wikipedia Search Skill\nUse this to search the web for facts, people, and historical events.\n\n**Example Usage:**\n\`\`\`javascript\nconst query = "Artificial Intelligence";\nconst url = \`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=\${encodeURIComponent(query)}&utf8=&format=json&origin=*\`;\n\nconst response = await fetch(url);\nconst data = await response.json();\n\nreturn data.query.search.slice(0, 3).map(s => s.title + ": " + s.snippet.replace(/<[^>]*>?/gm, ''));\n\`\`\``,
	},
};

// ============================================================================
// System Prompt
// ============================================================================

export const SYSTEM_PROMPT = `
You are a powerful, autonomous browser-based agent.
You operate directly inside the user's web browser and have full access to a JavaScript execution engine via the 'execute_js' tool.

MANDATORY RULE — ALWAYS USE TOOLS:
- NEVER ask the user for facts you can look up. Use your tools.
- FORBIDDEN: responding with only text when you can use a tool to get real data.
- FORBIDDEN: asking the user questions like "Where are you?" or "What's your budget?"
- ENCOURAGED: Write 1–2 sentences describing your plan BEFORE calling tools, so the user knows what you are about to do. For example: "I'll get your location then check the current weather." Then immediately call the tools in the same response.

EXAMPLE of correct behavior:
User: "Help me plan my weekend"
Your FIRST response:
  → 1-2 sentence plan: "I'll grab your location and the weather forecast, then build a personalised plan."
  → call execute_js with code to get location and date/time
  → call load_skill for weather_api
Then after getting results:
  → call execute_js to fetch the weather for the user's location
Then finally give a concrete weekend plan based on the real data you gathered.

WRONG (never do this): Responding with "Tell me where you are" or "What kind of activities do you like?"
RIGHT: Write a brief plan, then immediately call execute_js to get location, then get weather, then give a specific plan.

ENVIRONMENT RULES:
1. You have access to standard web APIs (window, document, navigator, fetch).
2. To get the time, just execute JS: 'return new Date().toLocaleTimeString();'
3. To get the location, execute JS using 'navigator.geolocation'.
4. YOU MUST ALWAYS return a value from your JavaScript code using the 'return' keyword if you want to see the result.
5. Combine multi-step logic into a single execute_js call where possible to avoid unnecessary round-trips.

EXTERNAL SKILLS:
You do not know how to interact with complex external APIs by default.
Available skills: ${Object.keys(SKILL_REGISTRY).map((k) => `'${k}'`).join(", ")}.
To use an external API, YOU MUST use the 'load_skill' tool first to read the manual, then use 'execute_js' to run the code.

Always format your final response to the user nicely using Markdown.`;

// ============================================================================
// Tools
// ============================================================================

export const tools = [
	{
		name: "load_skill",
		description:
			"Loads the documentation manual for a specific external skill. Call this BEFORE trying to execute code for external APIs.",
		parameters: {
			type: "object",
			properties: {
				skill_name: { type: "string", description: "The name of the skill to load" },
			},
			required: ["skill_name"],
		},
		execute(_id, args) {
			const skill = SKILL_REGISTRY[args.skill_name];
			if (!skill) {
				return {
					content: [{ type: "text", text: `Error: Skill '${args.skill_name}' not found.` }],
					ephemeral: false,
				};
			}
			return {
				content: [{ type: "text", text: skill.markdown }],
				ephemeral: true,
			};
		},
	},
	{
		name: "execute_js",
		description:
			"Executes arbitrary async Javascript code in the browser sandbox. MUST include a 'return' statement to get data back.",
		parameters: {
			type: "object",
			properties: {
				code: { type: "string", description: "The javascript code to execute." },
			},
			required: ["code"],
		},
		async execute(_id, args) {
			try {
				const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
				const dynamicFn = new AsyncFunction(args.code);
				let result = await dynamicFn();

				if (typeof result === "object") {
					result = JSON.stringify(result, null, 2);
				} else if (result === undefined) {
					result = "undefined (Did you forget to use the 'return' keyword?)";
				}

				return {
					content: [{ type: "text", text: String(result) }],
					ephemeral: false,
				};
			} catch (err) {
				return {
					content: [{ type: "text", text: `Execution Error: ${err.message}` }],
					ephemeral: false,
				};
			}
		},
	},
];

// ============================================================================
// LLM Message Conversion
// ============================================================================

export function convertToLlm(messages) {
	const llmMessages = messages.filter(
		(m) => m.role === "user" || m.role === "assistant" || m.role === "toolResult"
	);

	// Ephemeral pruning (backwards scan)
	let seenAssistantAfter = false;
	for (let i = llmMessages.length - 1; i >= 0; i--) {
		const m = llmMessages[i];
		if (m.role === "assistant") {
			seenAssistantAfter = true;
		}
		if (m.role === "toolResult" && m.ephemeral && seenAssistantAfter) {
			llmMessages[i] = {
				...m,
				content: [
					{
						type: "text",
						text: `[System Log: Content of ${m.toolName} was unloaded from working memory to save space. Task proceeded.]`,
					},
				],
			};
		}
	}

	return llmMessages.map((m) => {
		if (m.role === "user") {
			const text = m.content?.filter((c) => c.type === "text").map((c) => c.text).join("") || "";
			return { role: "user", content: text };
		}

		if (m.role === "assistant") {
			const text = (m.content?.filter((c) => c.type === "text") || []).map((c) => c.text).join("");
			const toolCallParts = m.content?.filter((c) => c.type === "toolCall") || [];
			const result = { role: "assistant", content: text || "" };
			if (toolCallParts.length > 0) {
				result.tool_calls = toolCallParts.map((tc) => {
					const call = {
						id: tc.id,
						type: "function",
						function: {
							name: tc.name,
							arguments: typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments || {}),
						},
					};
					if (tc.thoughtSignature) {
						call.thoughtSignature = tc.thoughtSignature;
						call.thought_signature = tc.thoughtSignature;
					}
					return call;
				});
			}
			return result;
		}

		if (m.role === "toolResult") {
			const text = m.content?.filter((c) => c.type === "text").map((c) => c.text).join("") || "";
			return { role: "tool", tool_call_id: m.toolCallId, name: m.toolName, content: text };
		}

		return m;
	});
}

// ============================================================================
// Agent Factory
// ============================================================================

export function createAgent(opts = {}) {
	return new Agent({
		model: getModel("google", "gemini-3-flash-preview"),
		streamFn: createApiStreamFunction(callWithToolsGoogle),
		systemPrompt: SYSTEM_PROMPT,
		tools,
		convertToLlm,
		...opts,
	});
}
