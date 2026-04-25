# Frontend

Next.js + TypeScript frontend for ChatApplication.

## Prerequisites

- Node.js 18+ (recommended: latest LTS)
- npm

## Setup

```bash
npm install
```

## Environment

Create a `.env.local` file in `frontend/`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Create production build
- `npm run start` - Run production server
- `npm run lint` - Run ESLint checks

## Project Structure

- `app/` - App Router pages and layouts
- `components/` - Shared UI and layout components
- `lib/` - API, auth, and utility modules
- `hooks/` - Reusable React hooks
- `types/` - Shared TypeScript types
- `styles/` - Global style variables

## Build Verification

```bash
npm run lint
npm run build
```
