# Colabora - Project Summary

**Last Updated:** 2025-01-27  
**Status:** Active Development - Production Ready (with known issues)

---

## 📋 Executive Summary

**Colabora** is a full-stack collaborative document editing application with democratic governance features. It enables teams to collaboratively draft documents using a proposal/voting system, organizational management, and real-time collaboration capabilities.

### Key Value Proposition
- **Collaborative Drafting**: Multiple users can work on documents simultaneously
- **Democratic Decision-Making**: Proposal and voting system for document changes
- **Organizational Governance**: Support for organizations with governance rules, elections, and policy voting
- **Real-time Updates**: WebSocket-based real-time collaboration
- **Activity Tracking**: Comprehensive activity feed across all documents

---

## 🛠️ Technology Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: SQLite3 (with migration system)
- **Authentication**: JWT (JSON Web Tokens) + Express Sessions (fallback)
- **Real-time**: Socket.IO (WebSocket)
- **Security**: Helmet, CORS, express-rate-limit, bcryptjs
- **Logging**: Winston (structured logging)
- **Validation**: express-validator

### Frontend
- **Framework**: React 18.3.1 with TypeScript
- **Build Tool**: Vite 6.3.5
- **UI Components**: Radix UI (comprehensive component library)
- **Styling**: Tailwind CSS
- **State Management**: React Hooks (useState, useEffect, custom hooks)
- **Forms**: react-hook-form
- **Real-time**: socket.io-client
- **Notifications**: Sonner (toast notifications)
- **Charts**: Recharts

### Deployment
- **Platform**: Fly.io (production)
- **Database**: SQLite with persistent volumes
- **Architecture**: Monolithic (single process serving both frontend and backend)
- **Build**: Vite for frontend, Node.js for backend

---

## 🏗️ Architecture Overview

### Directory Structure

```
Colabora_App/
├── client/                    # React/TypeScript frontend
│   ├── src/
│   │   ├── components/        # 100+ React components
│   │   │   ├── governance/    # Governance-related components
│   │   │   ├── layout/        # Layout components
│   │   │   ├── OrganizationManagement/  # Organization management
│   │   │   └── ui/            # Reusable UI components (Radix UI)
│   │   ├── hooks/             # 7 custom React hooks
│   │   │   ├── useAuth.ts     # Authentication hook
│   │   │   ├── useWebSocket.ts # WebSocket connection hook
│   │   │   └── useDocuments.ts # Document management hook
│   │   ├── pages/             # 4 page components
│   │   ├── lib/               # API client and utilities
│   │   │   └── api.ts         # Centralized API client
│   │   └── types/             # TypeScript type definitions
│   └── package.json
│
├── server/                    # Node.js/Express backend
│   ├── routes/                # 15 API route handlers
│   │   ├── auth.js            # Authentication routes
│   │   ├── documents.js       # Document CRUD operations
│   │   ├── votes.js            # Voting routes
│   │   ├── proposals.js       # Proposal routes
│   │   ├── comments.js        # Comment routes
│   │   ├── organizations.js   # Organization management
│   │   ├── governance.js      # Governance features
│   │   └── ...                # Additional routes
│   ├── modules/               # Business logic modules
│   │   ├── websocket.js       # WebSocket manager
│   │   ├── server.js          # Server initialization
│   │   ├── scheduler.js       # Background job scheduler
│   │   ├── document-status.js # Document status management
│   │   └── voting.js          # Voting logic
│   ├── middleware/            # Express middleware
│   │   ├── auth.js            # Authentication middleware
│   │   ├── logger.js          # Winston logger
│   │   ├── validation.js      # Input validation
│   │   └── monitoring.js      # Request metrics
│   ├── database/              # Database management
│   │   ├── DatabaseManager.js # Database initialization
│   │   ├── connection.js      # Database connection
│   │   └── services/          # Database services
│   ├── migrations/            # Database migrations
│   └── bootstrap.js           # Application bootstrap
│
├── docs/                      # Documentation
│   ├── active/                # Current documentation
│   ├── archive/               # Historical documentation
│   ├── ARCHITECTURE.md        # System architecture
│   └── PATTERNS.md            # Code patterns
│
└── package.json               # Root package.json
```

### Application Flow

1. **Bootstrap** (`server/bootstrap.js`)
   - Initializes database connection
   - Sets up Express server
   - Registers all routes
   - Initializes WebSocket server
   - Starts background scheduler
   - Handles graceful shutdown

2. **Request Flow**
   - Client → Express Middleware (CORS, body parsing, auth) → Route Handler → Database → Response
   - Real-time updates broadcast via WebSocket

3. **Authentication Flow**
   - JWT token in `Authorization: Bearer <token>` header (primary)
   - Express session (fallback for backward compatibility)
   - Role-based access control (admin, user, document owner, collaborator)

---

## ✨ Core Features

### 1. Document Management
- **Create Documents**: Personal, shared, or organizational documents
- **Edit Documents**: Paragraph-level editing with version control
- **Document Types**: Personal documents, shared documents, organizational documents
- **Document Status**: Draft, Voting, Adopted, Rejected
- **Agreed View**: View approved content based on voting thresholds

### 2. Proposal & Voting System
- **Proposals**: Suggest changes to paragraphs
- **Voting**: Vote on proposals (PRO/NEUTRAL/CONTRA)
- **Voting Thresholds**: Configurable approval thresholds (default 75%)
- **Automatic Acceptance**: Proposals automatically accepted when threshold met
- **History Tracking**: Complete history of all changes

### 3. Comments System
- **Threaded Comments**: Comments on proposals
- **User Attribution**: Comments show user avatar and name
- **Real-time Updates**: Comments appear in real-time via WebSocket

### 4. Activity Tracking
- **Activity Feed**: Comprehensive activity feed across all documents
- **Activity Types**: Proposals, votes, comments, acceptances
- **Filtering**: Filter by type, document, date
- **Statistics**: Dashboard showing activity statistics
- **Auto-refresh**: Updates every 30 seconds

### 5. User Management
- **Authentication**: JWT-based authentication with session fallback
- **User Profiles**: Avatar, name, email, bio
- **Role-Based Access**: Admin, user roles
- **Document Access Control**: Owner, collaborator permissions

### 6. Organizational Features
- **Organizations**: Create and manage organizations
- **Organization Members**: Member management
- **Representatives**: Elected representatives for organizations
- **Governance Rules**: Configurable governance rules
- **Elections**: Representative elections
- **Rule Proposals**: Propose changes to governance rules
- **Policy Voting**: Document-level voting for organizational documents

### 7. Real-time Collaboration
- **WebSocket Integration**: Real-time updates via Socket.IO
- **Event Types**: Votes, comments, proposals, paragraphs, document-votes
- **Room-based Subscriptions**: Document-level rooms for efficient updates
- **Client-side Handling**: Automatic UI updates without API reload

### 8. Admin Features
- **Admin Dashboard**: System-wide management
- **Organization Creation**: Admins can create organizations
- **User Management**: Admin user management capabilities

---

## 📊 Database Schema

### Core Tables
- `users` - User accounts and profiles
- `documents` - Document metadata
- `paragraphs` - Document paragraphs
- `proposals` - Proposed changes to paragraphs
- `votes` - Votes on proposals
- `comments` - Comments on proposals
- `document_collaborators` - Document sharing
- `paragraph_history` - History of paragraph changes
- `document_votes` - Document-level votes

### Organizational Tables
- `organizations` - Organization data
- `organization_members` - Organization membership
- `organization_representatives` - Organization representatives
- `governance_rules` - Organization governance rules
- `elections` - Representative elections
- `rule_proposals` - Governance rule proposals
- `policy_votes` - Policy voting records

### Database Management
- **Auto-initialization**: Database and schema created automatically
- **Migrations**: Version-controlled schema changes
- **Demo Data**: Automatic demo user creation for testing
- **Connection Pooling**: Efficient database connection management

---

## 🔐 Security Features

### Authentication & Authorization
- **JWT Tokens**: Secure token-based authentication
- **Password Hashing**: bcryptjs for password security
- **Session Management**: Express sessions with secure configuration
- **Role-Based Access Control**: Admin, user, document owner, collaborator roles
- **Document Access Control**: Middleware to verify document access

### Security Middleware
- **Helmet**: Security headers
- **CORS**: Configurable cross-origin resource sharing
- **Rate Limiting**: express-rate-limit for API protection
- **Input Validation**: express-validator for request validation
- **SQL Injection Prevention**: Parameterized queries

---

## 📡 API Structure

### RESTful Endpoints

#### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

#### Documents
- `GET /api/documents` - List documents
- `POST /api/documents` - Create document
- `GET /api/documents/:id` - Get document
- `PUT /api/documents/:id` - Update document
- `DELETE /api/documents/:id` - Delete document
- `GET /api/documents/:id/paragraphs` - Get paragraphs
- `POST /api/documents/:id/paragraphs` - Create paragraph
- `PUT /api/documents/:id/paragraphs/:pid` - Update paragraph

#### Proposals & Voting
- `POST /api/documents/:id/paragraphs/:pid/proposals` - Create proposal
- `POST /api/documents/:id/paragraphs/:pid/proposals/:proposalId/vote` - Vote on proposal
- `GET /api/documents/:id/paragraphs/:pid/proposals/:proposalId/comments` - Get comments
- `POST /api/documents/:id/paragraphs/:pid/proposals/:proposalId/comments` - Add comment

#### Organizations
- `GET /api/organizations` - List organizations
- `POST /api/organizations` - Create organization (admin only)
- `GET /api/organizations/:id` - Get organization
- `PUT /api/organizations/:id` - Update organization

#### Governance
- `GET /api/governance/rules/:orgId` - Get governance rules
- `POST /api/governance/rules/:orgId/proposals` - Propose rule change
- `GET /api/governance/elections/:orgId` - Get elections

#### Activity
- `GET /api/activity` - Get activity feed

### Response Format
```json
{
  "data": { /* response data */ },
  "error": "Error message (if error)"
}
```

---

## 🎨 Frontend Architecture

### Component Structure
- **Page Components** (`pages/`): Top-level views (DocumentsPage, DocumentViewPage, ActivityPage, ProfilePage)
- **Feature Components** (`components/`): Feature-specific UI (DocumentEditor, ProposalCard, etc.)
- **UI Components** (`components/ui/`): Reusable Radix UI components

### State Management
- **React Hooks**: useState, useEffect for local state
- **Custom Hooks**: 
  - `useAuth` - Authentication state
  - `useWebSocket` - WebSocket connection
  - `useDocuments` - Document management
  - `useDocumentView` - Document viewing state
- **Context API**: Global state for auth and documents

### Key Frontend Features
- **Responsive Design**: Works on desktop, tablet, mobile
- **Dark Mode Support**: Theme switching capability
- **Accessibility**: Radix UI components are accessible
- **Error Handling**: Comprehensive error boundaries and error messages
- **Loading States**: Loading indicators throughout the app

---

## ✅ Current Status

### Working Features
- ✅ User authentication (JWT + session)
- ✅ Document CRUD operations
- ✅ Paragraph-level proposals and voting
- ✅ Comments on proposals
- ✅ Real-time updates (WebSocket) for votes and paragraphs
- ✅ Activity feed with filtering
- ✅ User profiles with avatars
- ✅ Organization management (basic)
- ✅ Governance features (elections, rule proposals)
- ✅ Admin dashboard
- ✅ Agreed view (approved content display)

### Known Issues & Limitations

#### ✅ Resolved Issues (Verified January 2025)
1. **WebSocket Implementation - ✅ COMPLETE**
   - ✅ Comments broadcast WebSocket updates (`server/routes/comments.js:122`)
   - ✅ Proposals broadcast WebSocket updates (`server/routes/proposals.js:111`)
   - ✅ Document-level votes broadcast (`server/routes/documents.js:2324`)
   - ✅ Frontend handles all events (`client/src/App.tsx`)
   - ✅ Organization updates also broadcast and handled
   - **Status:** ✅ **COMPLETE** - All event types are broadcast and handled correctly

2. **Console Logging - Routes/Modules Complete**
   - ✅ **Routes**: 0 `console.log` found - All 15 route files use Winston logger
   - ✅ **Modules**: 0 `console.log` found - All modules use structured logging
   - ✅ **Logger Usage**: 483 `logger.*` calls in routes (proper structured logging)
   - ⚠️ **Migrations**: 52 `console.log` instances (acceptable for migration scripts)
   - ⚠️ **Frontend**: Some `console.log` remain (low priority)
   - **Status:** ✅ **COMPLETE in routes/modules** - Backend logging fully structured

3. **Organizational Document Workflow**
   - Basic functionality works
   - Some advanced workflow features may be incomplete
   - Paragraph cutoff and adoption logic may need work
   - Status: Core features functional, advanced features need verification

4. **TypeScript Types**
   - Some components use `any` types
   - Missing type definitions for some API responses
   - Status: Needs improvement

5. **Code Duplication**
   - Activity feed components duplicate `SuggestionCard` functionality
   - Status: Documented, needs refactoring

#### 🟢 Medium Priority Issues
6. **Error Handling**
   - Some routes may need better error handling
   - Error response formats could be more consistent
   - Status: Generally good, could be improved

---

## 📈 Development Progress

### Completed Phases
- ✅ **Phase 1**: Pattern Standardization (auth middleware consolidation)
- ✅ **Phase 2**: Documentation Organization (50+ files organized)
- 🔄 **Phase 3**: Console Logging Replacement (31% complete - 220/711 instances)

### In Progress
- TypeScript type improvements (117 `any` types remain, mostly low priority)
- Component refactoring (activity feed duplication)
- Documentation updates (reflect current state)

### Pending
- Frontend console.log replacement (low priority)
- Code duplication fixes (activity feed components)
- Performance optimizations
- Enhanced testing coverage

---

## 🚀 Deployment

### Production Environment
- **Platform**: Fly.io
- **Database**: SQLite with persistent volumes
- **Build Process**: 
  - Frontend: Vite build
  - Backend: Node.js runtime
  - Single process serving both

### Environment Variables
- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port
- `DATABASE_URL` - Database file path
- `JWT_SECRET` - JWT signing secret
- `SESSION_SECRET` - Session secret
- `ALLOWED_ORIGINS` - CORS allowed origins

### Deployment Scripts
- `deploy-fly.sh` - Fly.io deployment script
- `deploy-fresh.sh` - Fresh deployment script
- `setup-fly-secrets.js` - Secret management

---

## 📚 Documentation

### Key Documentation Files
- `docs/ARCHITECTURE.md` - System architecture overview
- `docs/PATTERNS.md` - Code patterns and conventions
- `docs/active/CODEBASE_SUMMARY.md` - Detailed issue analysis
- `docs/active/USAGE_GUIDE.md` - User guide
- `docs/active/ADMIN_SETUP.md` - Admin setup instructions
- `docs/active/DEPLOYMENT_GUIDE.md` - Deployment guide
- `QUICK_START.md` - Quick start guide

### Documentation Organization
- **Active** (`docs/active/`): Current, maintained documentation
- **Archive** (`docs/archive/`): Historical documentation

---

## 🧪 Testing

### Test Structure
- **Unit Tests**: `tests/unit/` - Auth, governance, validation tests
- **Integration Tests**: `tests/integration/` - API integration tests
- **Test Scripts**: Various test scripts in `scripts/` directory

### Test Commands
- `npm test` - Run all tests
- `npm run test:unit` - Run unit tests
- `npm run test:integration` - Run integration tests
- `npm run test:security` - Run security tests
- `npm run test:smoke` - Run smoke tests

---

## 🎯 Key Strengths

1. **Well-Organized Codebase**: Clear separation of concerns, modular structure
2. **Modern Tech Stack**: React, TypeScript, Express, modern tooling
3. **Comprehensive Features**: Document editing, voting, governance, real-time collaboration
4. **Security Focus**: JWT authentication, role-based access, input validation
5. **Real-time Capabilities**: WebSocket integration for live updates
6. **User Experience**: Activity feed, profiles, responsive design
7. **Documentation**: Comprehensive documentation organized by status

---

## 🔮 Future Enhancements

### Potential Improvements
1. Complete WebSocket implementation for all event types
2. Enhanced organizational workflow features
3. Better TypeScript type coverage
4. Performance optimizations
5. Enhanced testing coverage
6. Mobile app (React Native)
7. Advanced analytics and reporting
8. Export/import functionality
9. Version control improvements
10. Advanced search capabilities

---

## 📝 Summary

**Colabora** is a sophisticated collaborative document editing platform with democratic governance features. It combines modern web technologies (React, TypeScript, Express, SQLite) with real-time collaboration capabilities to enable teams to collaboratively draft documents using a proposal and voting system.

The application is **production-ready** with core features working. Recent improvements:
- ✅ WebSocket implementation complete (all events broadcast and handled)
- ✅ Console logging replacement complete in routes/modules (100%)
- ⚠️ Some organizational workflow features may need verification
- ⚠️ TypeScript type improvements needed (117 `any` types, mostly low priority)

The codebase is well-organized, well-documented, and follows modern development practices. The application successfully demonstrates:
- Full-stack development with React and Node.js
- Real-time collaboration with WebSockets
- Complex business logic (voting, governance, proposals)
- Security best practices
- User experience considerations

**Status**: Active development, production-ready. Several previously documented issues have been resolved (WebSocket ✅, Console Logging ✅). See `docs/active/CODEBASE_ANALYSIS_2025.md` for verification details.

---

**Last Updated**: 2025-01-27  
**Maintained by**: Development Team

