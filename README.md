
# Rent & Flatmate Finder

A full-stack rental matching platform with AI compatibility scoring, tenant-owner chat, and notification workflows.

## Features

- Owner registration, login, and room listing management
- Tenant registration, profile creation, and listing browsing
- AI-powered compatibility scoring stored per tenant-listing pair
- Owner approval flow for tenant interest requests
- WebSocket-based chat once an interest request is accepted
- Email notifications for high-score interest and owner response events
- Admin views for user and listing management

## Setup

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in values.
4. Start the server:
   ```bash
   npm start
   ```
5. Open `http://localhost:4000` in your browser.

## Environment Variables

- `PORT` - backend server port
- `JWT_SECRET` - secret used for auth tokens
- `OPENAI_API_KEY` - optional OpenAI API key for AI scoring
- `OPENAI_MODEL` - OpenAI model name (default `gpt-4.1-mini`)
- `SMTP_HOST` - SMTP host for notification delivery
- `SMTP_PORT` - SMTP port
- `SMTP_USER` - SMTP username
- `SMTP_PASS` - SMTP password

## API Endpoints

### Auth

- `POST /api/auth/register` - register as tenant, owner, or admin
- `POST /api/auth/login` - login and receive JWT

### Listings

- `GET /api/listings` - browse active listings
- `POST /api/listings` - owner creates a room listing
- `PATCH /api/listings/:id/fill` - owner marks listing filled

### Profile

- `POST /api/profile` - tenant creates or updates profile
- `GET /api/profile` - tenant fetches current profile

### Interest & Matches

- `POST /api/interest/:listingId` - tenant sends interest request
- `POST /api/interest/:matchId/respond` - owner accepts or declines
- `GET /api/matches` - current user matches and scores

### Chat

- `GET /api/chat/:matchId/messages` - message history
- WebSocket: connect to `ws://<host>/ws?token=<JWT>&matchId=<matchId>`

### Admin

- `GET /api/admin/users` - list users
- `GET /api/admin/listings` - list all listings
- `GET /api/admin/activity` - recent matches and messages

## DB Schema

- `users` - `id, name, email, password_hash, role, created_at`
- `tenant_profiles` - `id, user_id, preferred_location, budget_min, budget_max, move_in_date`
- `listings` - `id, owner_id, title, location, rent, available_from, room_type, furnishing, photos, filled`
- `matches` - `id, tenant_id, listing_id, score, explanation, status`
- `messages` - `id, match_id, sender_id, text, created_at`

## AI Compatibility Scoring

The platform uses an LLM prompt to compute compatibility based on tenant preferences and listing details. If OpenAI is unavailable, a fallback rule-based score is used.

Example prompt:

```text
Given this room listing: {location: ..., rent: ..., available_from: ..., room_type: ..., furnishing: ...}
and this tenant profile: {preferred_location: ..., budget_min: ..., budget_max: ..., move_in_date: ...}
compute a compatibility score from 0 to 100 based on budget and location match. Return JSON: { "score": number, "explanation": string }
```

### Example AI Output

```json
{
  "score": 88,
  "explanation": "The room is within budget and located in the desired neighborhood, though the available date is one week later than requested."
}
```

<img width="2200" height="1706" alt="Screenshot 2026-07-03 105623" src="https://github.com/user-attachments/assets/4b7132e2-bdb1-4285-b5a1-1bf1d9871403" />


