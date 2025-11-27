# Colabora Application Architecture

**Last Updated:** 2025-01-27  
**Status:** Current System Architecture

---

## 📋 Project Overview

**Colabora** is a full-stack collaborative document editing application with democratic governance features. The application enables teams to collaboratively draft documents with a proposal/voting system, organizational management, and real-time collaboration.

### Technology Stack

- **Backend:** Node.js/Express with SQLite database
- **Frontend:** React/TypeScript with Vite
- **Real-time:** Socket.IO (WebSocket) for real-time updates
- **UI Framework:** Radix UI components with Tailwind CSS
- **Deployment:** Fly.io (production), GitHub (source control)
- **Architecture:** Monolithic application with RESTful API

### Core Features

1. **Document Management** - Create, edit, and manage collaborative documents (personal, shared, organizational)
2. **Proposal & Voting System** - Propose changes, vote on proposals (PRO/NEUTRAL/CONTRA)
3. **Comments** - Comment threads on proposals
4. **Activity Tracking** - Activity feed across all documents
5. **Organizational Features** - Organizations, governance rules, elections, rule proposals
6. **User Management** - JWT-based authentication, user profiles, role-based access
7. **Real-time Updates** - WebSocket-based real-time collaboration

---

## 🏗️ System Architecture

### Directory Structure

```
Colabora_App/
├── client/                    # React/TypeScript frontend
│   ├── src/
│   │   ├── components/        # React components (100+ files)
│   │   │   ├── governance/    # Governance-related components
│   │   │   ├── layout/        # Layout components
│   │   │   ├── OrganizationManagement/  # Organization management
│   │   │   └── ui/            # Reusable UI components (Radix UI)
│   │   ├── hooks/             # Custom React hooks
│   │   │   ├── useAuth.ts     # Authentication hook
│   │   │   ├── useWebSocket.ts # WebSocket connection hook
│   │   │   └── useDocuments.ts # Document management hook
│   │   ├── pages/              # Page components
│   │   ├── lib/                # API client and utilities
│   │   │   └── api.ts          # API client with error handling
│   │   └── types/              # TypeScript type definitions
│   └── package.json
├── server/                     # Node.js/Express backend
│   ├── routes/                 # API route handlers (17 files)
│   │   ├── auth.js            # Authentication routes
│   │   ├── documents.js        # Document CRUD operations
│   │   ├── votes.js            # Voting routes
│   │   ├── proposals.js       # Proposal routes
│   │   ├── comments.js        # Comment routes
│   │   ├── organizations.js   # Organization management
│   │   ├── governance.js       # Governance features
│   │   └── ...
│   ├── modules/                # Business logic modules
│   │   ├── websocket.js        # WebSocket manager
│   │   ├── server.js           # Server initialization
│   │   ├── scheduler.js        # Background job scheduler
│   │   ├── document-status.js   # Document status management
│   │   └── ...
│   ├── middleware/             # Express middleware
│   │   ├── auth.js             # Authentication middleware
│   │   ├── logger.js           # Winston logger
│   │   ├── validation.js       # Input validation
│   │   └── monitoring.js       # Request metrics
│   ├── database/               # Database management
│   │   ├── DatabaseManager.js  # Database initialization
│   │   ├── connection.js       # Database connection
│   │   └── services/           # Database services
│   ├── migrations/              # Database migrations
│   └── bootstrap.js             # Application bootstrap
├── docs/                        # Documentation
│   ├── active/                  # Current documentation
│   ├── archive/                 # Historical documentation
│   ├── ARCHITECTURE.md          # This file
│   └── PATTERNS.md              # Code patterns and conventions
└── package.json
```

---

## 🔑 Key Components

### Backend Architecture

#### Application Bootstrap (`server/bootstrap.js`)
- Initializes database connection
- Sets up Express server
- Registers all routes
- Initializes background scheduler
- Handles graceful shutdown

#### Server Manager (`server/modules/server.js`)
- Express app configuration
- Middleware setup (CORS, body parsing, session, auth)
- WebSocket server initialization
- Static file serving

#### Authentication (`server/middleware/auth.js`)
- JWT token generation and verification
- Session-based authentication (fallback)
- Role-based access control (admin, user)
- Document access control (owner, collaborator)

#### WebSocket Manager (`server/modules/websocket.js`)
- Real-time update broadcasting
- Room-based subscriptions (document-level)
- Event types: votes, comments, proposals, paragraphs, document-votes

#### Route Handlers (`server/routes/`)
- RESTful API endpoints
- Input validation
- Database operations
- WebSocket broadcasting
- Error handling

### Frontend Architecture

#### Main App (`client/src/App.tsx`)
- Application state management
- WebSocket event handling
- Navigation and routing
- Document view management

#### API Client (`client/src/lib/api.ts`)
- Centralized API request handling
- Error handling and retries
- Rate limiting
- Response transformation (camelCase)

#### Custom Hooks
- `useAuth` - Authentication state
- `useWebSocket` - WebSocket connection
- `useDocuments` - Document management
- `useDocumentView` - Document viewing state

#### Component Structure
- Page components (`pages/`) - Top-level views
- Feature components (`components/`) - Feature-specific UI
- UI components (`components/ui/`) - Reusable Radix UI components

---

## 🔐 Authentication & Authorization

### Authentication Methods

1. **JWT Token** (Primary)
   - Token in `Authorization: Bearer <token>` header
   - Verified with issuer/audience checks
   - Includes user ID, email, name

2. **Session** (Fallback)
   - Express session for backward compatibility
   - Used when JWT token not present

### Authorization Levels

1. **Public** - No authentication required
   - Health checks
   - Login/register endpoints

2. **Authenticated** - User must be logged in
   - Most API endpoints
   - Uses `requireAuth` middleware

3. **Admin** - User must have admin role
   - Organization creation
   - System-wide management
   - Uses `requireAdmin` middleware

4. **Document Access** - User must own or collaborate on document
   - Document-specific operations
   - Uses `requireDocumentAccess` middleware

5. **Representative** - User must be organization representative
   - Organization-specific operations
   - Checked per-route (not middleware)

---

## 💾 Database Schema

### Core Tables

- `users` - User accounts and profiles
- `documents` - Document metadata
- `paragraphs` - Document paragraphs
- `proposals` - Proposed changes to paragraphs
- `votes` - Votes on proposals
- `comments` - Comments on proposals
- `document_collaborators` - Document sharing
- `organizations` - Organization data
- `organization_members` - Organization membership
- `document_votes` - Document-level votes
- `governance_rules` - Organization governance rules
- `elections` - Representative elections
- `rule_proposals` - Governance rule proposals

### Database Management

- **Database Manager** (`server/database/DatabaseManager.js`)
  - SQLite connection management
  - Migration execution
  - Connection pooling
  - Health checks

- **Migrations** (`server/migrations/`)
  - Version-controlled schema changes
  - Automatic execution on startup

---

## 🔄 Real-time Updates (WebSocket)

### Event Types

1. **Vote Updates** - When votes are cast/updated
2. **Comment Updates** - When comments are added
3. **Proposal Updates** - When proposals are created
4. **Paragraph Updates** - When agreed view changes
5. **Document Vote Updates** - When document-level votes change
6. **Document Status Changes** - When document status transitions

### Subscription Model

- Clients subscribe to document rooms: `document-{documentId}`
- Server broadcasts updates to all subscribers
- Client updates UI directly (no API reload needed)

---

## 📡 API Structure

### RESTful Endpoints

- `/api/auth/*` - Authentication
- `/api/documents/*` - Document operations
- `/api/documents/:id/paragraphs/*` - Paragraph operations
- `/api/documents/:id/paragraphs/:pid/proposals/*` - Proposal operations
- `/api/documents/:id/paragraphs/:pid/proposals/:proposalId/vote` - Voting
- `/api/documents/:id/paragraphs/:pid/proposals/:proposalId/comments` - Comments
- `/api/organizations/*` - Organization management
- `/api/governance/*` - Governance features
- `/api/admin/*` - Admin operations

### Response Format

```json
{
  "data": { /* response data */ },
  "error": "Error message (if error)"
}
```

---

## 🎨 Frontend Patterns

### State Management

- React hooks for local state
- Context API for global state (auth, documents)
- Custom hooks for reusable logic

### Component Patterns

- Functional components with TypeScript
- Props interfaces for type safety
- Custom hooks for data fetching
- Error boundaries for error handling

### Styling

- Tailwind CSS for utility classes
- Radix UI for accessible components
- Responsive design patterns

---

## 🔧 Development Patterns

See [PATTERNS.md](PATTERNS.md) for detailed code patterns and conventions.

### Key Patterns

1. **Authentication** - Always import from `middleware/auth.js`
2. **Logging** - Use Winston logger, not console.log
3. **Database** - Use parameterized queries
4. **Error Handling** - Structured error responses
5. **TypeScript** - Define types, avoid `any`

---

## 🚀 Deployment

### Production Environment

- **Platform:** Fly.io
- **Database:** SQLite (persistent volume)
- **Build:** Vite for frontend, Node.js for backend
- **Process:** Single process running both frontend and backend

### Environment Variables

- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port
- `DATABASE_URL` - Database file path
- `JWT_SECRET` - JWT signing secret
- `SESSION_SECRET` - Session secret
- `ALLOWED_ORIGINS` - CORS allowed origins

---

## 📊 Current Status

### ✅ Working Features

- User authentication (JWT + session)
- Document CRUD operations
- Paragraph-level proposals and voting
- Real-time updates (WebSocket)
- Activity feed
- User profiles
- Organization management (basic)
- Governance features (elections, rule proposals)

### ⚠️ Known Issues

- Console logging needs to be replaced with Winston (764 instances)
- Some TypeScript `any` types need proper definitions
- Code duplication in activity feed components
- Organizational workflow needs end-to-end testing

---

## 🔗 Related Documentation

- [PATTERNS.md](PATTERNS.md) - Code patterns and conventions
- [CODEBASE_SUMMARY.md](active/CODEBASE_SUMMARY.md) - Detailed issue analysis
- [QUICK_START.md](../QUICK_START.md) - Quick start guide

---

**Maintained by:** Development Team  
**Last Architecture Review:** 2025-01-27

