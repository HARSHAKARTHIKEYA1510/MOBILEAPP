# Workspace Chat (`5th-Sem`)

Full-stack chat application with a NestJS + Prisma + MongoDB backend, a clean Web UI, and an Expo / React Native mobile app.

---

## Project Folder Structure

```text
5th-Sem/
├── backend/                 # NestJS + Prisma + MongoDB REST API
│   ├── prisma/              # MongoDB Prisma schema (User, Conversation, File, Message)
│   ├── src/
│   │   ├── auth/            # Basic Auth guard & decorator
│   │   ├── bot/             # Optional FactBot service (BOT_MODE=true)
│   │   ├── common/          # Shared utilities
│   │   ├── conversation/    # DM & Group conversation endpoints
│   │   ├── file/            # File & image upload/download endpoints (POST /file, GET /file/:id)
│   │   ├── message/         # Message, pagination & archive endpoints
│   │   ├── prisma/          # Prisma client service
│   │   ├── user/            # User profile & listing endpoints
│   │   ├── app.module.ts
│   │   └── main.ts          # API entrypoint (serves Web UI & /uploads)
│   └── uploads/             # Uploaded static files
├── frontend/
│   ├── mobile/              # React Native / Expo Go Mobile App
│   │   ├── App.js
│   │   ├── app.json
│   │   ├── assets/
│   │   └── src/
│   │       ├── navigation/  # ChatStack navigator
│   │       ├── screens/chat/# Conversations, ChatRoom, Auth, NewChat, Details, Archive modals
│   │       ├── services/    # REST API client (api.js)
│   │       └── theme/       # Solid UI design tokens
│   └── web/                 # Browser Web Chat UI (served automatically by backend)
│       ├── index.html
│       ├── css/
│       └── js/
├── docker-compose.yml       # MongoDB 7.0 + Backend stack
└── package.json             # Convenience root scripts
```

---

## Where Is Everything?

- **Backend**: `5th-Sem/backend/`
- **Mobile Frontend (Expo Go)**: `5th-Sem/frontend/mobile/`
- **Web Frontend (Browser UI)**: `5th-Sem/frontend/web/` *(served automatically at `http://localhost:3001` when the backend runs)*

---

## How to Start the App (1 Command)

Run this single command from `5th-Sem/`:

```bash
npm start
```

That automatically starts **Docker / MongoDB**, syncs **Prisma**, launches the **Backend + Web UI** (`http://localhost:3001`), and opens **Expo Go** with the QR code in the same terminal. Press `Ctrl+C` to stop everything.

### Manual Start (Optional, Separate Terminals)

**Terminal 1 — MongoDB & Backend (+ Web UI):**
```bash
cd backend
docker compose --env-file .env -f ../docker-compose.yml up -d mongo
npm run prisma:push
npm run start:dev
```

**Terminal 2 — Mobile Frontend (Expo Go):**
```bash
cd frontend/mobile
npx expo start --lan
```
