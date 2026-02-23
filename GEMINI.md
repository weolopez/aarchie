# GEMINI.md

## Project Overview

**Aarchie** is a lightweight, framework-agnostic agent loop library designed for building AI agents that integrate with LLMs. It features a pure JavaScript architecture with no npm dependencies, making it easy to embed in various environments.

### Core Architecture
- **Agent Loop (`src/agent.js`)**: The central `Agent` class manages state, message history, tool execution, and the main iterative loop. It uses an event-based system for real-time updates.
- **LLM Integration (`src/llm-integration.js`)**: Provides multi-provider support (Gemini, OpenAI) with streaming capabilities.
- **Aardvark (`src/aardvark.js`)**: A high-level wrapper around the `Agent` class for simplified interaction.
- **Web UI (`www/`)**: A browser-native interface built with vanilla JavaScript and Web Components.
- **Deno Server (`server.ts`)**: A lightweight backend that serves the static web files and provides a WebSocket endpoint for real-time conversation capture and logging.

## Building and Running

This project does not use a traditional build system or `package.json`. It runs directly using Node.js or Deno.

### Running the CLI
Execute the agent directly from your terminal:
```bash
node cli.js "Your prompt here"
```

### Running the Web Application
Start the Deno server to serve the web UI:
```bash
deno run --allow-net --allow-read server.ts
```
The application will be available at `http://localhost:3000`.

### Running Tests
Tests use the native Node.js test runner:
```bash
node --test test/aardvark.test.js
```

### Inspection and Logging
To view the latest captured conversation from the server:
```bash
./inspect.sh
```

## Development Conventions

- **Zero Dependencies**: Do not add `package.json` or external npm dependencies. Use standard Web APIs and Node.js built-ins.
- **Module System**: Use ES Modules (`import`/`export`) throughout the project.
- **Testing**: Use `node:test` and `node:assert` for unit and integration tests.
- **Frontend**: Use native Web Components (Custom Elements) and Vanilla CSS. Avoid frontend frameworks.
- **Persistence**: The web UI uses `localStorage` for API keys (`GEMINI_API_KEY`) and chat history.
- **Deno for Tooling**: Use Deno for server-side utilities that benefit from its built-in permissions and TypeScript support.

## Key Files
- `cli.js`: Entry point for the CLI tool.
- `server.ts`: Deno-based static file and WebSocket server.
- `src/agent.js`: Core agent loop logic.
- `src/llm-integration.js`: LLM API connectors.
- `src/aardvark.js`: High-level API for easier agent integration.
- `www/app.js`: Main entry point for the web application.
