#!/usr/bin/env node

import { Aardvark } from "./src/aardvark.js";

const prompt = process.argv.slice(2).join(" ");

if (!prompt) {
	console.error("Usage: aardvark <prompt>");
	console.error("  e.g. aardvark add one plus 10");
	process.exit(1);
}

const a = new Aardvark("You are a helpful assistant.");

try {
	const reply = await a.ask(prompt);
	console.log(reply);
} catch (err) {
	console.error("Error:", err.message);
	process.exit(1);
}
