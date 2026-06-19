# Frontend

React, TypeScript, and Vite frontend for the TTB Label Verification proof-of-concept.

Set `VITE_API_BASE_URL` to the backend URL before running or deploying the frontend.

Local example:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Deployed example:

```bash
VITE_API_BASE_URL=https://your-deployed-backend.example.com
```

## Run

```bash
npm install
npm run dev
```

## Checks

```bash
npm run typecheck
npm run test
npm run build
```

## Phase Notes

The current frontend implements the Phase 4 single-label verification flow as the primary screen.
