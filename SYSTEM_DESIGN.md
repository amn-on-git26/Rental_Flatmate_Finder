# System Design Write-up

## Architecture Overview

This application uses a single Node.js backend with Express for API routing and a plain HTML/JavaScript frontend to keep dependencies minimal and focus on core assignment requirements. The database is SQLite, which is lightweight and easy to ship with the codebase.

The backend exposes REST APIs for authentication, profile management, listings, interest flows, and admin oversight. A WebSocket server is mounted alongside Express to support real-time chat once a tenant-owner match is accepted.

## Compatibility Scoring Design

Compatibility scores are stored in the database for each tenant-listing pair. This ensures that once the system computes a score it does not need to recompute on every browser request.

The score is generated when a tenant browses listings for the first time or when they express interest. If a stored compatibility record already exists, the system reuses it. This design means the ranking is stable and avoids redundant LLM calls.

## LLM Integration and Fallback

The LLM integration uses OpenAI's chat completion API. The prompt includes a room listing and a tenant profile and requests a JSON response with `score` and `explanation`.

If OpenAI is unavailable or the response cannot be parsed, the system falls back to a deterministic rule-based score:
- 50 points for budget alignment, scaled by how close the listing rent is to the preferred range
- 50 points for location match based on keyword overlap
- A simple explanation accompanies the fallback score

This provides fault tolerance while preserving compatibility ranking even without API access.

## Chat Implementation

Real-time chat uses a WebSocket server with an authentication token query parameter. When a match is accepted, both tenant and owner can join the same `matchId` room.

Messages are persisted in the `messages` table immediately when received, so chat history remains available after reloads. The backend also exposes a REST endpoint for message history to support clients that reconnect or resume a session.

## Notification Flow

Email notifications are sent in two main situations:
1. When a tenant expresses interest and the compatibility score is above 80, the owner receives a notification with the tenant name and listing details.
2. When the owner accepts or declines the interest request, the tenant receives an email notification describing the owner decision.

The email system is built with `nodemailer` and is configured through environment variables. If SMTP is not configured, the system logs notification actions locally but continues functioning without blocking core flows.

## Data Modeling

The database uses normalized relational tables to separate users, tenant profiles, listings, matches, and messages.

- `users` stores account credentials and role-based access.
- `tenant_profiles` records tenant preferences independent of listing data.
- `listings` stores room metadata and hide filled listings from search.
- `matches` stores compatibility results and interest status.
- `messages` persists chat with sender attribution.

This model supports the platform requirements while remaining simple enough for local deployment.
