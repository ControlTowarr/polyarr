# Polyarr Frontend

The frontend for Polyarr is built with **Angular**, **Angular Material / CDK**, and **TypeScript**.

## Development Server

To start the Angular CLI development server:

```bash
npm start
# or from root
npm run dev:frontend
```

Once running, navigate to **`http://localhost:4200/`**. The app will automatically reload when source files change.

## Building

To build the frontend for production:

```bash
npm run build
```

The build artifacts will be stored in `dist/frontend/browser`. When running in production (or Docker), the backend Express server serves these static assets on port `3000`.

## Architecture & State

- **Settings (`/settings`)**: Primary hub for managing instances, sync profiles, executing Dry Run simulations, and triggering manual scans.
- **Dashboard (`/dashboard`)**: High-level overview of synced vs missing media across instances.
- **Media Detail (`/media/:id`)**: Audio track breakdown and per-instance sync status.
- **History (`/history`)**: Real-time event and action logs.
