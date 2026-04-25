# Backend

Express + TypeScript backend for ChatApplication (with Prisma).

## Prerequisites

- Node.js 18+ (recommended: latest LTS)
- npm
- Database configured for Prisma

## Setup

```bash
npm install
```

## Environment

Create a `.env` file in `Backend/` and add your runtime values, for example:

```env
PORT=5000
DATABASE_URL=your_database_connection_string
JWT_SECRET=your_jwt_secret
```

## Available Scripts

- `npm run dev` - Run backend in development with nodemon
- `npm run build` - Compile TypeScript to `dist/`
- `npm run start` - Start compiled backend from `dist/`
- `npm run lint` - Run ESLint checks
- `npm run lint:fix` - Auto-fix lint issues when possible

## Prisma

Use Prisma commands from `Backend/` as needed:

```bash
npx prisma generate
npx prisma migrate dev
```

## Build Verification

```bash
npm run lint
npm run build
```
