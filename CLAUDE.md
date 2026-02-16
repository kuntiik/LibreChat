# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LibreChat is a self-hosted AI chat platform that unifies major AI providers (OpenAI, Anthropic, Google, AWS Bedrock, Azure, etc.) in a single interface. It features AI Agents, Model Context Protocol (MCP) support, Code Interpreter, file search, and multi-user authentication.

**Tech Stack:**
- **Frontend**: React + TypeScript, Vite, TailwindCSS, Radix UI, React Query
- **Backend**: Express.js (Node.js), mostly JavaScript with gradual TypeScript migration
- **Database**: MongoDB with Mongoose
- **Build System**: npm workspaces (monorepo), Turbo for orchestration
- **Testing**: Jest (unit), Playwright (E2E)

## Requirements

- Node.js 20.x
- TypeScript installed globally: `npm i -g typescript`
- MongoDB Community Edition (for E2E tests and local development)

## Repository Structure

This is a monorepo with npm workspaces:

```
LibreChat/
├── api/                    # Backend Express.js server
│   ├── app/                # Business logic
│   │   ├── clients/        # AI provider clients (OpenAI, Anthropic, etc.)
│   │   ├── server/         # Express server setup
│   │   │   ├── controllers/
│   │   │   ├── routes/
│   │   │   ├── middleware/
│   │   │   └── services/
│   ├── models/             # Mongoose models
│   ├── db/                 # Database utilities
│   ├── strategies/         # Authentication strategies (OAuth, LDAP, etc.)
│   └── utils/
├── client/                 # Frontend React app
│   └── src/
│       ├── components/     # React components
│       ├── hooks/          # Custom React hooks
│       ├── store/          # Zustand state management
│       ├── data-provider/  # React Query data fetching
│       ├── routes/         # React Router routes
│       └── locales/        # i18n translations
├── packages/               # Shared packages
│   ├── data-provider/      # Shared data fetching logic (TypeScript)
│   ├── data-schemas/       # Shared validation schemas (TypeScript)
│   ├── api/                # Shared API utilities (TypeScript)
│   └── client/             # Shared client utilities (TypeScript)
├── config/                 # Configuration scripts (user management, etc.)
├── e2e/                    # Playwright E2E tests
└── docker-compose.yml      # Docker setup for local development
```

## Essential Commands

### First-Time Setup

```bash
# Install dependencies
npm ci

# Build packages in order (REQUIRED before running client)
npm run build:data-provider
npm run build:data-schemas
npm run build:api
npm run build:client-package

# Setup environment
cp .env.example .env
cp librechat.example.yaml librechat.yaml

# For E2E tests
cp api/test/.env.test.example api/test/.env.test
cp e2e/config.local.example.ts e2e/config.local.ts
```

### Development

```bash
# Start backend (development mode with nodemon auto-reload)
npm run backend:dev

# Start frontend (development mode with hot reload)
npm run frontend:dev

# Build all packages (required after changes to packages/)
npm run build:packages

# Build frontend for production
npm run frontend

# Update dependencies and rebuild
npm run update
```

### Testing

```bash
# Run backend unit tests
npm run test:api

# Run frontend unit tests
npm run test:client

# Run all unit tests
npm run test:all

# Run E2E tests (requires MongoDB running and built client)
npm run e2e

# Run E2E tests in headed mode (see browser)
npm run e2e:headed

# Debug E2E tests
npm run e2e:debug
```

### Linting & Formatting

```bash
# Lint all files
npm run lint

# Fix linting issues
npm run lint:fix

# Format code with Prettier
npm run format
```

### User Management

```bash
# Create a new user
npm run create-user

# List all users
npm run list-users

# Delete a user
npm run delete-user

# Reset user password
npm run reset-password
```

## Development Workflow

### Package Build Dependencies

The packages MUST be built in this order due to dependencies:
1. `data-provider` (no dependencies)
2. `data-schemas` (depends on data-provider)
3. `api` (depends on data-provider + data-schemas)
4. `client-package` (depends on data-provider)
5. `client` (depends on all above)

**Important**: After modifying code in `packages/`, you must rebuild affected packages before changes appear in the main app.

### Making Changes

1. **Before starting work**:
   - Pull latest: `npm run update`
   - Create a feature branch: `git checkout -b new/feature/description`

2. **During development**:
   - If you modify `packages/`, rebuild them: `npm run build:packages`
   - For frontend changes, compile TypeScript to check for errors: `cd client && npm run build`
   - Run unit tests frequently: `npm run test:api` or `npm run test:client`
   - Clear browser localStorage and cookies when testing UI changes

3. **Before committing**:
   - Run `npm run lint:fix` to fix linting issues
   - Run `npm run reinstall` to ensure clean package state
   - Restart ESLint server in VS Code if needed
   - Run unit tests: `npm run test:all`
   - Run E2E tests if you changed user-facing features: `npm run e2e`

4. **Committing**:
   - Use semantic commit format: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
   - Example: `feat: Add support for Claude 3.5 Sonnet`
   - Husky pre-commit hooks will automatically run linting

### TypeScript Conversion

- Frontend is nearly 100% TypeScript (`.tsx`, `.ts`)
- Backend is mostly JavaScript (`.js`) with gradual TypeScript adoption
- Shared packages (`packages/*`) are TypeScript
- When adding new backend code, prefer JavaScript unless migrating existing code
- React components must use TypeScript

## Architecture Patterns

### Backend (Express.js)

- **Routes** (`api/server/routes/`): Define API endpoints
- **Controllers** (`api/server/controllers/`): Handle request/response logic
- **Services** (`api/server/services/`): Business logic (database queries, external API calls)
- **Middleware** (`api/server/middleware/`): Authentication, validation, error handling
- **Models** (`api/models/`): Mongoose schemas and models
- **Clients** (`api/app/clients/`): AI provider integrations (each provider has its own client class extending `BaseClient`)

Example flow: Route → Controller → Service → Model

### Frontend (React)

- **Components** (`client/src/components/`): Reusable UI components
- **Hooks** (`client/src/hooks/`): Custom React hooks for shared logic
- **Store** (`client/src/store/`): Zustand stores for global state
- **Data Provider** (`client/src/data-provider/`): React Query hooks for API calls
- **Routes** (`client/src/routes/`): React Router route definitions

State management:
- **Local state**: `useState` for component-specific state
- **Global state**: Zustand stores for app-wide state (auth, UI preferences)
- **Server state**: React Query for API data fetching/caching

### Configuration System

LibreChat uses a two-tier configuration:
1. **Environment variables** (`.env`): Server config, API keys, database URLs
2. **librechat.yaml**: App-level config (AI endpoints, features, UI customization)

Both files have `.example` versions in the repo as templates.

### AI Provider Clients

All AI provider clients extend `BaseClient` (`api/app/clients/BaseClient.js`):
- Handles message formatting, token counting, streaming responses
- Each provider implements provider-specific logic (OpenAI, Anthropic, Google, etc.)
- Located in `api/app/clients/` directory

### Agents System

LibreChat has a custom Agents implementation using the `@librechat/agents` package:
- Agents are stored in the `Agent` model (`api/models/Agent.js`)
- Support tools, file search, code execution, MCP servers
- Access control via permissions system

## Testing Guidelines

### Unit Tests (Jest)

- Backend tests: `api/**/*.spec.js` or `api/**/*.test.js`
- Frontend tests: `client/src/**/*.test.tsx` or `client/src/**/*.spec.tsx`
- Package tests: `packages/*/src/**/*.spec.ts`
- Run specific test: `cd api && npm test -- path/to/test.spec.js`

### E2E Tests (Playwright)

- Located in `e2e/` directory
- Require MongoDB running and built client
- Use `e2e/config.local.ts` for local configuration
- Tests run against `http://localhost:3080` by default
- Storage state saved in `e2e/storageState.json` for authenticated tests

### Test Data

For E2E tests, you may need test users:
```bash
npm run create-user
# Follow prompts to create test user
```

## Common Gotchas

1. **Package build order**: Always build `data-provider` → `data-schemas` → `api` → `client-package` before building the main client
2. **MongoDB connection**: Backend requires MongoDB running. Default: `mongodb://127.0.0.1:27017/LibreChat`
3. **TypeScript errors in frontend**: Run `cd client && npm run build` to check for TypeScript errors
4. **ESLint cache issues**: Restart ESLint server in VS Code after reinstalling packages
5. **Module import order**: ESLint enforces import order (npm packages → types → local imports, longest to shortest)
6. **Backend is NOT TypeScript**: Don't add type annotations to `.js` files in `api/` directory
7. **Environment variables**: Copy `.env.example` to `.env` and configure for your environment

## Docker Development

```bash
# Start all services (MongoDB, LibreChat)
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down

# Rebuild after code changes
docker compose up -d --build
```

## Debugging

### Backend (Node.js)

```bash
# Start with Node inspector
npm run backend:inspect

# Then attach VS Code debugger (launch.json is configured)
```

### Frontend (React)

Use browser DevTools:
- React DevTools extension recommended
- Redux DevTools for Zustand stores (requires middleware)

## Documentation

- **Main docs**: https://librechat.ai/docs
- **Configuration guide**: https://librechat.ai/docs/configuration
- **API docs**: Code is self-documenting via JSDoc comments
- **Contributing guide**: `.github/CONTRIBUTING.md`
