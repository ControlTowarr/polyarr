# Polyarr Agent Guidelines & Workspace Rules

## 1. Environment & Command Execution
- **Docker Dev Container**: The workspace is run inside a Docker dev container (container name `stupefied_shtern`, path `/workspaces/polyarr`).
- **NO Host Node/NPM Execution**: NEVER run `npm install`, `npm run build`, `npm test`, or script executions directly on the host machine. Doing so injects Darwin/macOS platform dependencies into `package.json` and lockfiles.
- **Execution Format**: Always run commands via:
  ```bash
  docker exec stupefied_shtern bash -c 'cd /workspaces/polyarr/<subfolder> && <command>'
  ```

## 2. Frontend & UI Architecture
- **Settings Page (`settings.component.ts`)**: The Settings page (`/settings`) is the primary UI for managing connected instances, sync profiles, dry run simulations, and global settings.
- When updating instance or sync profile capabilities (buttons, forms, modals, dry runs), ensure changes are reflected in `SettingsComponent`.

## 3. Sync & Simulation Domain Rules
- **Categorization**:
  - **Hardlink**: Main file contains the target language audio -> zero space link created on child.
  - **Needs Download**: Main file lacks the target language audio -> child instance must search indexers and download a separate file.
  - **Errors**: Only report real API timeouts, lookup failures, or filesystem permissions. Do NOT treat missing-language files as errors.
