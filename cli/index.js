#!/usr/bin/env node
/**
 * CLI UI layer — wires the agent to stdin/stdout.
 * Agent configuration lives in agent.js; this file handles rendering and input only.
 */
import readline from "readline";
import { createAgent } from "./agent.js";

// ============================================================================
// Terminal styling
// ============================================================================

const C = {
	reset:  "\x1b[0m",
	bold:   "\x1b[1m",
	dim:    "\x1b[2m",
	italic: "\x1b[3m",
	blue:   "\x1b[38;2;0;122;255m",    // iOS system blue #007AFF
	gray:   "\x1b[90m",
	orange: "\x1b[38;2;206;145;120m",  // warm result color (matches terminal-result in web)
};

const W = () => Math.min((process.stdout.columns || 80) - 4, 96);

// Horizontal rule, optionally with a centered label
function rule(label) {
	const w = W();
	if (!label) return `${C.gray}${"─".repeat(w)}${C.reset}`;
	const rest = Math.max(0, w - label.length - 3);
	return `${C.gray}── ${label} ${"─".repeat(rest)}${C.reset}`;
}

// ============================================================================
// Markdown → ANSI renderer
// ============================================================================

function renderMarkdown(text) {
	const lines = text.split("\n");
	const out = [];
	let inFence = false;

	for (const line of lines) {
		if (line.startsWith("```")) {
			inFence = !inFence;
			out.push(`  ${rule()}`);
			continue;
		}
		if (inFence) {
			out.push(`  ${C.dim}${line}${C.reset}`);
			continue;
		}

		// Headings
		if (line.startsWith("### ")) { out.push(`\n  ${C.bold}${inline(line.slice(4))}${C.reset}`); continue; }
		if (line.startsWith("## "))  { out.push(`\n  ${C.bold}${inline(line.slice(3))}${C.reset}`); continue; }
		if (line.startsWith("# "))   { out.push(`\n  ${C.blue}${C.bold}${inline(line.slice(2))}${C.reset}`); continue; }

		// Lists
		if (/^[-*] /.test(line)) {
			out.push(`  • ${inline(line.slice(2))}`);
			continue;
		}
		if (/^\d+\. /.test(line)) {
			out.push(`  ${inline(line)}`);
			continue;
		}

		out.push(line.trim() ? `  ${inline(line)}` : "");
	}

	return out.join("\n");
}

function inline(text) {
	return text
		.replace(/\*\*([^*]+)\*\*/g, `${C.bold}$1${C.reset}`)
		.replace(/\*([^*]+)\*/g,     `${C.italic}$1${C.reset}`)
		.replace(/`([^`]+)`/g,       `${C.dim}$1${C.reset}`);
}

// ============================================================================
// Spinner (matches typing indicator three-dots feel)
// ============================================================================

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let spinTimer = null;
let spinIdx = 0;

function startSpinner(label = "Thinking") {
	if (spinTimer) return;
	spinIdx = 0;
	spinTimer = setInterval(() => {
		process.stdout.write(
			`\r  ${C.blue}${FRAMES[spinIdx % FRAMES.length]}${C.reset}  ${C.dim}${label}…${C.reset}   `
		);
		spinIdx++;
	}, 80);
}

function stopSpinner() {
	if (!spinTimer) return;
	clearInterval(spinTimer);
	spinTimer = null;
	process.stdout.write("\r\x1b[2K");
}

// ============================================================================
// Message rendering
// ============================================================================

function printBanner() {
	console.log();
	console.log(`  ${C.blue}${C.bold}Aarchie${C.reset}  ${C.dim}Terminal Agent${C.reset}`);
	console.log(`  ${C.gray}${"─".repeat(32)}${C.reset}`);
	console.log(`  ${C.dim}Type a message, or 'exit' to quit.${C.reset}`);
	console.log();
}

// Planning text — matches the web's italic 💭 thinking bubble
function printPlanningText(text) {
	const trimmed = text.trim();
	if (!trimmed) return;
	console.log();
	for (const line of trimmed.split("\n")) {
		if (line.trim()) {
			console.log(`  ${C.dim}${C.italic}💭  ${line.trim()}${C.reset}`);
		}
	}
}

// Tool block — matches the web's dark tool-terminal
function printToolStart(toolName, code) {
	console.log(`\n  ${rule(`⚙  ${toolName}`)}`);
	if (code?.trim()) {
		const lines = code.split("\n");
		const preview = lines.slice(0, 12);
		for (const l of preview) {
			console.log(`  ${C.dim}${l}${C.reset}`);
		}
		if (lines.length > 12) {
			console.log(`  ${C.dim}… (${lines.length - 12} more lines)${C.reset}`);
		}
	}
}

function printToolResult(result) {
	const trimmed = (result || "").trim();
	const preview = trimmed.length > 500 ? trimmed.slice(0, 500) + "…" : trimmed;
	console.log(`  ${rule()}`);
	if (preview) {
		for (const line of preview.split("\n")) {
			console.log(`  ${C.orange}${line}${C.reset}`);
		}
	}
}

// Final response — full markdown render
function printResponse(text) {
	console.log();
	console.log(renderMarkdown(text));
	console.log();
}

// ============================================================================
// API key setup
// ============================================================================

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function question(prompt) {
	return new Promise((resolve) => rl.question(prompt, resolve));
}

async function ensureApiKey() {
	if (process.env.GEMINI_API_KEY) return;
	console.log(`\n  ${C.orange}No GEMINI_API_KEY set.${C.reset}`);
	console.log(`  ${C.dim}Get a free key at https://aistudio.google.com/apikey${C.reset}\n`);
	const key = await question(`  ${C.blue}›${C.reset} Enter Gemini API key: `);
	const trimmed = key.trim();
	if (!trimmed) {
		console.error("\n  No key provided. Exiting.");
		process.exit(1);
	}
	process.env.GEMINI_API_KEY = trimmed;
	console.log(`  ${C.dim}Key saved for this session.${C.reset}\n`);
}

// ============================================================================
// Agent setup
// ============================================================================

await ensureApiKey();

const agent = createAgent();

// ============================================================================
// Event subscription
// ============================================================================

agent.subscribe((event) => {
	switch (event.type) {
		case "agent_start":
			startSpinner();
			break;

		case "message_end": {
			const msg = event.message;
			if (!msg) break;

			if (msg.role === "assistant") {
				stopSpinner();
				const text = (msg.content?.filter((c) => c.type === "text") || []).map((c) => c.text).join("");
				const hasToolCalls = msg.content?.some((c) => c.type === "toolCall");

				if (text.trim()) {
					if (hasToolCalls) {
						printPlanningText(text);
					} else {
						printResponse(text);
					}
				}
			}

			if (msg.role === "toolResult") {
				const text = (msg.content?.filter((c) => c.type === "text") || []).map((c) => c.text).join("");
				printToolResult(text);
				startSpinner("Processing");
			}
			break;
		}

		case "tool_execution_start": {
			stopSpinner();
			let code;
			if (event.toolName === "execute_js") {
				code = event.args?.code || "";
			} else if (event.toolName === "load_skill") {
				code = `Loading skill manual: ${event.args?.skill_name || ""}`;
			} else {
				code = JSON.stringify(event.args || {}, null, 2);
			}
			printToolStart(event.toolName, code);
			break;
		}

		case "agent_end":
			stopSpinner();
			break;
	}
});

// ============================================================================
// Input loop
// ============================================================================

printBanner();

async function chat() {
	while (true) {
		const input = await question(`  ${C.blue}›${C.reset} `);
		const trimmed = input.trim();

		if (trimmed === "exit" || trimmed === "quit") break;
		if (!trimmed) continue;

		await agent.prompt(trimmed);
		await agent.waitForIdle();
	}

	console.log(`\n  ${C.dim}Goodbye.${C.reset}\n`);
	rl.close();
}

chat().catch((err) => {
	console.error(`\n  ${C.orange}Error: ${err.message}${C.reset}\n`);
	process.exit(1);
});
