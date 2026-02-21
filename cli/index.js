#!/usr/bin/env node
/**
 * CLI UI layer — wires the agent to stdin/stdout.
 * Agent configuration lives in agent.js; this file handles rendering and input only.
 */
import readline from "readline";
import { createAgent } from "./agent.js";

const agent = createAgent();

// ============================================================================
// Render agent events to stdout
// ============================================================================

let needsNewline = false; // track whether we're mid-stream

agent.subscribe((event) => {
	switch (event.type) {
		case "tool_execution_start": {
			if (needsNewline) { process.stdout.write("\n"); needsNewline = false; }
			const detail = event.toolName === "execute_js"
				? (event.args?.code || "").split("\n")[0].trim().slice(0, 60)
				: event.toolName === "load_skill"
					? event.args?.skill_name
					: JSON.stringify(event.args || {});
			process.stdout.write(`  \x1b[2m[${event.toolName}: ${detail}]\x1b[0m\n`);
			break;
		}

		case "message_update":
			if (event.assistantMessageEvent?.type === "text_delta") {
				process.stdout.write(event.assistantMessageEvent.delta);
				needsNewline = true;
			}
			break;

		case "agent_end":
			if (needsNewline) { process.stdout.write("\n"); needsNewline = false; }
			break;
	}
});

// ============================================================================
// Input loop
// ============================================================================

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log("Agent ready. Type 'exit' to quit.\n");

async function chat() {
	while (true) {
		const input = await new Promise((resolve) => rl.question("You: ", resolve));

		if (input.trim() === "exit" || input.trim() === "quit") break;
		if (!input.trim()) continue;

		process.stdout.write("\n");
		await agent.prompt(input.trim());
		await agent.waitForIdle();
		process.stdout.write("\n");
	}

	rl.close();
}

chat().catch((err) => {
	console.error(err.message);
	process.exit(1);
});
