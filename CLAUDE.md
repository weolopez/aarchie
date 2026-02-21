# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a lightweight, framework-agnostic agent loop library for building AI agents that integrate with LLMs. Pure JavaScript (ES6 modules), no npm dependencies, no build step. Designed to be embedded in larger applications.

## Development

There is no package.json, build system, test framework, or linter. The codebase is two files:

- `src/agent.js` — Agent class, agent loop logic, tool execution, state management
- `src/llm-integration.js` — LLM API integration, streaming, multi-provider support

Run directly with Node.js (ES module imports).

## Architecture

### Agent Loop (`src/agent.js`)

The `Agent` class is the main interface. It manages state (messages, tools, model, thinking level), emits events via a subscription system, and handles queued steering/follow-up messages.

Two entry points:
- `agentLoop()` — Start agent with a new prompt
- `agentLoopContinue()` — Resume from existing context

The loop calls the LLM, processes tool calls, executes tools, and repeats until no more tool calls remain or `maxToolTurns` (default 10) is hit. Steering messages can interrupt mid-loop.

Key config options: `systemPrompt`, `model`, `tools`, `thinkingLevel`, `convertToLlm`, `transformContext`, `getApiKey`, `steeringMode`, `streamFn`, `maxToolTurns`.

### LLM Integration (`src/llm-integration.js`)

Multi-provider LLM calling with streaming:
- `callWithToolsGoogle()` — Gemini API
- `callWithToolsOpenAI()` — OpenAI Chat Completions
- `callWithToolsOpenAIResponses()` — OpenAI Responses endpoint (codex models)
- `callWithTools()` — Generic backend proxy API
- `createApiStreamFunction()` — Factory for custom API wrappers

`EventStream` is a generic async iterable stream. `AssistantMessageEventStream` specializes it for LLM responses.

### Event System

Streams emit: `agent_start/end`, `turn_start/end`, `message_start/update/end`, `tool_execution_start/update/end`.

### Message Types

`user`, `assistant`, `toolResult`, `toolCall` (in content), `thinking` (in content).

### Tool System

Tools are objects with `name`, `description`, `parameters`, and `execute()`. Tool execution supports partial result streaming, error handling, and steering message interruption.
