# QuMail - Quantum Secure Email Client Application

## Overview

QuMail is a quantum-secure email client application that demonstrates advanced cryptographic concepts by integrating traditional email protocols with simulated Quantum Key Distribution (QKD) technology. The application provides multiple security levels ranging from quantum one-time pad encryption to traditional plaintext, showcasing how quantum cryptography could enhance email security in the future.

The system consists of a full-stack web application with a React frontend, Express.js backend, and PostgreSQL database, along with a simulated Quantum Key Management Entity (KME) that follows ETSI GS QKD-014 standards for key distribution.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Components**: Radix UI primitives with shadcn/ui component library for consistent design
- **Styling**: Tailwind CSS with custom CSS variables for theming
- **State Management**: TanStack Query (React Query) for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Forms**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Session Management**: Express sessions with PostgreSQL session store
- **Authentication**: Session-based authentication with secure cookie configuration

### Data Storage Solutions
- **Primary Database**: PostgreSQL via Neon Database serverless offering
- **ORM**: Drizzle ORM with schema-first approach located in shared directory
- **File Storage**: JSON-based temporary storage for development (keys.json, users.json, messages.json, etc.)
- **Migrations**: Drizzle Kit for database migrations and schema management

### Security Architecture
The application implements a multi-tier security model:

1. **Level 1 - Quantum OTP**: One-Time Pad encryption using quantum-distributed keys
2. **Level 2 - Quantum-seeded AES**: AES-GCM encryption with quantum-derived keys  
3. **Level 3 - Post-Quantum Cryptography**: Simulated hybrid approach combining QKD with post-quantum algorithms
4. **Level 4 - Plain Text**: Traditional unencrypted email for compatibility

### Quantum Key Management
- **KME Simulator**: Custom implementation following ETSI GS QKD-014 protocol standards
- **Key Pool Management**: Automated key generation, distribution, and lifecycle management
- **Key Consumption Tracking**: Monitoring of key usage to prevent reuse and ensure perfect forward secrecy

### Email Integration
- **SMTP**: Nodemailer for sending emails through various providers
- **IMAP**: Support for fetching emails from external providers
- **Microsoft Graph**: Integration with Outlook/Office 365 via Microsoft Graph API
- **Multi-provider Support**: Gmail, Outlook, Yahoo, and internal QuMail accounts

### Authentication and Authorization
- **Session-based Authentication**: Secure session management with PostgreSQL backing
- **Password Security**: Bcrypt hashing for password storage
- **Access Control**: Route-level protection with authentication middleware
- **Audit Logging**: Comprehensive logging of all security-related actions

## External Dependencies

### Core Framework Dependencies
- **@neondatabase/serverless**: PostgreSQL database connectivity
- **drizzle-orm**: TypeScript ORM for database operations
- **express**: Web application framework
- **express-session**: Session management middleware
- **connect-pg-simple**: PostgreSQL session store

### Frontend Dependencies
- **@tanstack/react-query**: Server state management and caching
- **wouter**: Lightweight routing library
- **@radix-ui/***: Headless UI component primitives
- **tailwindcss**: Utility-first CSS framework
- **class-variance-authority**: Type-safe variant API for components

### Email and Communication
- **@microsoft/microsoft-graph-client**: Microsoft Graph API integration
- **@types/nodemailer**: Email sending capabilities (types)

### Development and Build Tools
- **vite**: Fast build tool and development server
- **typescript**: Type checking and compilation
- **esbuild**: Fast JavaScript bundler for production builds
- **tsx**: TypeScript execution for development

### Security and Cryptography
- **Node.js crypto module**: Built-in cryptographic functions
- **bcrypt**: Password hashing (implied from authentication patterns)

### Utilities and Helpers
- **date-fns**: Date manipulation and formatting
- **clsx**: Conditional className utility
- **nanoid**: Unique ID generation
- **zod**: Runtime type validation and schema validation

The application follows a monorepo structure with shared types and schemas, enabling type safety across the entire stack while maintaining clear separation of concerns between frontend, backend, and shared utilities.
