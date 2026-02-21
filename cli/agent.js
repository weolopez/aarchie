/**
 * CLI agent configuration — system prompt, skill registry, tools, and LLM
 * message conversion. Node.js runtime: fetch available, navigator is not.
 */
import { Agent } from "../src/agent.js";
import { getModel, createApiStreamFunction, callWithToolsGoogle } from "../src/llm-integration.js";

// ============================================================================
// Skill Registry
// ============================================================================

export const SKILL_REGISTRY = {
	weather_api: {
		description: "Fetches current weather using IP-based location.",
		markdown: `# Weather API Skill
Get the user's location via their IP address, then fetch weather from Open-Meteo. No API keys needed.

**Example Usage:**
\`\`\`javascript
// 1. Get location from IP
const geoRes = await fetch("https://ipapi.co/json/");
const geo = await geoRes.json();
const { latitude: lat, longitude: lon, city, region } = geo;

// 2. Fetch weather
const url = \`https://api.open-meteo.com/v1/forecast?latitude=\${lat}&longitude=\${lon}&current_weather=true&hourly=temperature_2m,precipitation_probability&forecast_days=3\`;
const weatherRes = await fetch(url);
const data = await weatherRes.json();

return { city, region, current: data.current_weather, hourly: data.hourly };
\`\`\``,
	},
	wikipedia_search: {
		description: "Searches Wikipedia for information.",
		markdown: `# Wikipedia Search Skill
Use this to search the web for facts, people, and historical events.

**Example Usage:**
\`\`\`javascript
const query = "Artificial Intelligence";
const url = \`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=\${encodeURIComponent(query)}&utf8=&format=json&origin=*\`;

const response = await fetch(url);
const data = await response.json();

return data.query.search.slice(0, 3).map(s => s.title + ": " + s.snippet.replace(/<[^>]*>?/gm, ""));
\`\`\``,
	},
};

// ============================================================================
// System Prompt
// ============================================================================

export const SYSTEM_PROMPT = `
You are a powerful, autonomous Node.js-based agent running in a terminal.
You have full access to a JavaScript execution engine via the 'execute_js' tool.

MANDATORY RULE — ACT FIRST, NEVER ASK:
You MUST use your tools to gather information before responding. NEVER ask the user for facts you can look up.
You are FORBIDDEN from responding with only text. You MUST call at least one tool before giving your answer.
You are FORBIDDEN from asking the user questions like "Where are you?" or "What's your budget?"

EXAMPLE of correct behavior:
User: "Help me plan my weekend"
Your FIRST response must be tool calls (not text):
  → call load_skill for weather_api
Then after getting the skill manual:
  → call execute_js to fetch location via IP and weather in a single call
Then finally give a concrete weekend plan based on the real data you gathered.

WRONG (never do this): Responding with "Tell me where you are" or "What kind of activities do you like?"
RIGHT: Immediately load the weather_api skill and fetch real data, then give a specific plan.

ENVIRONMENT RULES:
1. You are running in Node.js — you do NOT have window, document, or navigator.
2. You DO have: fetch (Node 18+), crypto, process, and all standard JS globals.
3. To get the time: return new Date().toLocaleString();
4. To get location: use fetch("https://ipapi.co/json/") — see the weather_api skill for the full example.
5. YOU MUST ALWAYS return a value from your JavaScript code using the 'return' keyword.
6. Combine multi-step logic into a single execute_js call where possible to avoid unnecessary round-trips.

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
			"Executes arbitrary async JavaScript in a Node.js sandbox. Has access to fetch and standard globals. MUST include a 'return' statement to get data back.",
		parameters: {
			type: "object",
			properties: {
				code: { type: "string", description: "The JavaScript code to execute." },
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
		if (m.role === "assistant") seenAssistantAfter = true;
		if (m.role === "toolResult" && m.ephemeral && seenAssistantAfter) {
			llmMessages[i] = {
				...m,
				content: [{
					type: "text",
					text: `[System Log: Content of ${m.toolName} was unloaded from working memory to save space. Task proceeded.]`,
				}],
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
