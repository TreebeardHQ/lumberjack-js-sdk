# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

### Core Commands

- `npm run build` - Build all packages in the monorepo
- `npm run dev` - Run development mode for all packages concurrently
- `npm run test` - Run Jest tests (no tests currently written)
- `npm run lint` - Run ESLint on all packages with TypeScript support
- `npm run typecheck` - Run TypeScript type checking across all packages
- `npm run clean` - Clean build artifacts from all packages

### Publishing

- `npm run bump-alpha` - Bump versions and publish alpha releases for all packages

### Package-specific Commands

Run commands for specific packages:

- `npm run build -w @lumberjack-sdk/core`
- `npm run dev -w @lumberjack-sdk/nextjs`

## Architecture Overview

This is a TypeScript monorepo using npm workspaces with three packages:

### @lumberjack-sdk/core

- Core SDK for logging and tracing
- Event-driven architecture using EventEmitter pattern
- AsyncLocalStorage for request-scoped context management
- Log batching for performance optimization
- Console capture capability via monkey-patching
- Automatic caller information extraction from stack traces
- No external dependencies (uuid will be added)
- Supports multiple environments: Node.js, Browser, Edge

### @lumberjack-sdk/nextjs

- Next.js 15+ integration package
- Instrumentation API integration
- Error handling middleware
- Configuration helpers
- Depends on @lumberjack-sdk/core

### @lumberjack-sdk/express

- Express.js integration (early stage, minimal implementation)
- Planned instrumentation capabilities

## Key Technical Patterns

### Context Management

Uses Node.js AsyncLocalStorage for maintaining trace context across async boundaries. The context flows automatically through the request lifecycle without manual propagation.

### Error Enrichment

Automatic extraction of:

- Stack traces with file paths and line numbers
- Function names from call stacks
- Error metadata (name, message, stack)

### Log Format

Supports OpenTelemetry format with automatic conversion including:

- Timestamp in nanoseconds
- Severity levels mapped to OTEL standards
- Resource attributes (service.name, source)
- Trace context (TraceId, SpanId)
- Code location attributes

### Environment Detection

Automatic detection of:

- Runtime environment (Node.js version, platform)
- CI environment variables for commit SHA
- API configuration from environment variables

## TypeScript Configuration

- Target: ES2020
- Module: ESNext
- Strict mode enabled
- Declaration files generated
- Source maps included
- Exact optional property types enforced

## Important Notes

- All packages use ES modules (`"type": "module"`)
- Minimum Node.js version: 16.0.0
- Published to npm under `@lumberjack-sdk` scope with public access
- No Prettier configuration - formatting not standardized
- No automated tests written yet
- No CI/CD workflows configured
