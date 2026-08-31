# Polyarr Agent Guidelines & Workspace Rules

## 1. Environment & Command Execution
- **Docker Dev Container**: The workspace is run inside a Docker dev container (container name `stupefied_shtern`, path `/workspaces/polyarr`).
- **NO Host Node/NPM Execution**: NEVER run `npm install`, `npm run build`, `npm test`, or script executions directly on the host machine. Doing so injects Darwin/macOS platform dependencies into `package.json` and lockfiles.
- **Execution Format**: Always run commands via:
  ```bash
  docker exec stupefied_shtern bash -c 'cd /workspaces/polyarr/<subfolder> && <command>'
  ```

## 2. Planning & Verification Discipline
- **Mandatory Plans for Non-Trivial Changes**: When a user request involves architectural changes, bug fixes across multiple files, or behavioral adjustments, ALWAYS create an `implementation_plan.md` artifact and obtain explicit user approval before modifying code.
- **Verify in Container**: Always run `npm test` (backend) and `npm run build` (frontend) inside the Docker container to verify changes before presenting completion.

## 3. Frontend & UI Architecture
- **Settings Page (`settings.component.ts`)**: The Settings page (`/settings`) is the primary UI for managing connected instances, sync profiles, dry run simulations, and global settings.
- When updating instance or sync profile capabilities (buttons, forms, modals, dry runs), ensure changes are reflected in `SettingsComponent` and `SyncProfilesComponent`.

## 4. Sync, Path Translation & Simulation Domain Rules
- **Automatic Path Translation**:
  - Path translation between Main and Child instances MUST automatically resolve from `mainInstance.rootFolderPath` and `childInstance.rootFolderPath`.
  - Do NOT require manual path mapping overrides unless explicitly specified by the user.
- **Resilient File Resolution**:
  - Radarr/Sonarr list APIs (e.g. `GET /movie`) may omit full nested `movieFile` objects.
  - Always implement fallback queries (e.g. `getMovieFiles(movieId)`) so media items with files on disk are never silently skipped during scans, syncs, or dry runs.
- **Categorization**:
  - **Hardlink**: Main file contains the target language audio -> zero space link created on child.
  - **Needs Download**: Main file lacks the target language audio -> child instance must search indexers and download a separate file.
  - **Errors**: Only report real API timeouts, lookup failures, or filesystem permissions. Do NOT treat missing-language files as errors.
- **Comprehensive Audit Logging**:
  - Every sync or scan run must log all actions (`linked`, `already_linked`, `search_triggered`, `added`, `season_monitored`, `error`) and write a summary audit record to `SyncHistory`.

## 5. Git & Version Control Guardrails
- **Explicit User Request Required**: NEVER run `git commit` or `git push` unless the user explicitly and directly asks you to do so in their message.
- Do not automatically commit when creating/editing files, documentation, or rules unless specifically instructed.
