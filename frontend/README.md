# Frontend

This is the Next.js frontend for AI Interview Coach. For project setup, backend
configuration, and run instructions, see the [project README](../README.md).

To run the frontend from this directory:

```bash
npm install
npm run dev
```

The app uses `http://localhost:8000` for the backend by default. Set
`NEXT_PUBLIC_API_URL` in `.env.local` to override it; see `.env.example` for the
local development value.
