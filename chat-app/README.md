# Nova

A lightning-fast, modern mobile chat application built with Expo, React Native, TypeScript, and a backend powered by **Prisma ORM** and **PostgreSQL (Neon DB)**.

## Design & Features

- **Nova Design System**: Radiant Electric Indigo and Vivid Violet palette (`#5B4EF5`), luminous cards, modern squircle avatars with online indicators, and fluid organic chat bubbles.
- **Fast Authentication**: Username/password sign-in and sign-up with persistent session storage (`AsyncStorage`) and salted `scrypt` password hashing.
- **Dynamic Conversation Feed**: Real-time sorting by latest activity, category filter tabs (All, Direct, Groups), live search, message snippet previews, and relative timestamps.
- **Real-Time Direct Messaging**: Polling with cursor-based pagination for history, read receipts (`✓` / `✓✓`), and seamless offline-safe message updates.
- **Rich Media & Attachments**: Image picker with automatic client-side resizing and optimization, thumbnail previews with captions, and full-screen modal viewer.
- **Push Notification Integration**: Foreground and background notification routing directly into chat threads.

## Prerequisites

- Node.js 20+
- A [Neon](https://console.neon.tech) PostgreSQL database connection string
- Expo Go app on iOS/Android (or a simulator/emulator)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment:
   ```env
   DATABASE_URL="postgresql://<user>:<password>@<endpoint>.neon.tech/<dbname>?sslmode=require"
   PORT=3000
   ```

3. Generate the Prisma client and push the schema to Neon DB:
   ```bash
   npm run db:generate
   npm run db:push
   ```

4. Start the backend server:
   ```bash
   npm run server
   ```

5. Start the Expo frontend:
   ```bash
   npm start
   ```

## Scripts

- `npm run server` — start the backend server
- `npm run db:generate` — generate the Prisma Client
- `npm run db:push` — push `prisma/schema.prisma` to Neon PostgreSQL
- `npm start` — start the Expo dev server
- `npm run android` — open on Android
- `npm run ios` — open on iOS
- `npm run web` — open in a web browser
- `npm run typecheck` — run `tsc --noEmit`
