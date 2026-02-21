#!/usr/bin/env node

/**
 * Multi-tool example — registers several tools and lets the LLM
 * orchestrate them to answer a complex prompt.
 *
 * Usage:
 *   node examples/multi-tool.js "What is the weather in NYC and LA, convert both temps to celsius, then summarize"
 */

import { Aardvark } from "../src/aardvark.js";

const prompt = process.argv.slice(2).join(" ") ||
	"Look up the weather in New York and Los Angeles, convert both temperatures from fahrenheit to celsius, then summarize the results.";

const a = new Aardvark("You are a helpful assistant. Use the provided tools to answer the user's request. Call multiple tools as needed.", {
	model: "gemini",
});

// -- Tools --------------------------------------------------------------------

a.tool("get_weather", "Get current weather for a city", {
	type: "object",
	properties: {
		city: { type: "string", description: "City name" },
	},
	required: ["city"],
}, ({ city }) => {
	const data = {
		"new york":    { temp_f: 42, condition: "Cloudy", humidity: 65 },
		"los angeles": { temp_f: 71, condition: "Sunny",  humidity: 30 },
		"chicago":     { temp_f: 28, condition: "Snowy",  humidity: 80 },
		"miami":       { temp_f: 79, condition: "Partly cloudy", humidity: 72 },
	};
	const key = city.toLowerCase();
	const match = Object.keys(data).find((k) => key.includes(k));
	if (!match) return JSON.stringify({ error: `No weather data for "${city}"` });
	return JSON.stringify({ city: match, ...data[match] });
});

a.tool("fahrenheit_to_celsius", "Convert a temperature from Fahrenheit to Celsius", {
	type: "object",
	properties: {
		temp_f: { type: "number", description: "Temperature in Fahrenheit" },
	},
	required: ["temp_f"],
}, ({ temp_f }) => {
	const temp_c = ((temp_f - 32) * 5) / 9;
	return JSON.stringify({ temp_f, temp_c: Math.round(temp_c * 10) / 10 });
});

a.tool("summarize", "Summarize a list of data points into a short paragraph", {
	type: "object",
	properties: {
		points: {
			type: "array",
			items: { type: "string" },
			description: "List of facts to summarize",
		},
	},
	required: ["points"],
}, ({ points }) => {
	return `Summary: ${points.join(" ")}`;
});

// -- Events (show what the agent is doing) ------------------------------------

a.on("tool_execution_start", (e) => {
	console.log(`  [tool] ${e.toolName}(${JSON.stringify(e.args)})`);
});

a.on("tool_execution_end", (e) => {
	const text = e.result?.content?.map((c) => c.text).join("") ?? "";
	console.log(`  [result] ${text}`);
});

// -- Run ----------------------------------------------------------------------

console.log(`Prompt: "${prompt}"\n`);

try {
	const reply = await a.ask(prompt);
	console.log(`\nReply:\n${reply}`);
} catch (err) {
	console.error("Error:", err.message);
	process.exit(1);
}
