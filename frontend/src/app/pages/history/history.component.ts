import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { SyncRun, SyncRunDetail, SyncHistoryEntry } from '../../core/models';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Sync History & Audit</h1>
        <p class="page-subtitle">Inspect sync events, analyze hardlinks, downloads, and review execution logs</p>
      </div>
      <button class="btn btn-secondary btn-sm" (click)="refreshCurrentView()" [disabled]="isLoading">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
        </svg>
        {{ isLoading ? 'Refreshing...' : 'Refresh' }}
      </button>
    </div>

    <!-- View Mode Selector -->
    <div class="filter-pills mb-lg">
      <button
        class="filter-pill"
        [class.active]="activeView === 'events'"
        (click)="switchView('events')"
      >
        ⚡ Sync Events (Runs) ({{ totalRunsCount }})
      </button>
      <button
        class="filter-pill"
        [class.active]="activeView === 'logs'"
        (click)="switchView('logs')"
      >
        📜 All Raw Logs ({{ totalLogsCount }})
      </button>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════
         VIEW 1: SYNC EVENTS (RUNS)
         ═══════════════════════════════════════════════════════════════ -->
    <div *ngIf="activeView === 'events'">
      <!-- Trigger Type Filter Pills -->
      <div class="filter-pills mb-md">
        <button
          class="filter-pill"
          [class.active]="selectedTriggerFilter === ''"
          (click)="filterByTrigger('')"
        >
          All Runs ({{ totalRunsCount }})
        </button>
        <button
          class="filter-pill"
          [class.active]="selectedTriggerFilter === 'live'"
          (click)="filterByTrigger('live')"
        >
          ⚡ Live Syncs ({{ liveRunsCount }})
        </button>
        <button
          class="filter-pill"
          [class.active]="selectedTriggerFilter === 'dry_run'"
          (click)="filterByTrigger('dry_run')"
        >
          🧪 Dry Runs ({{ dryRunsCount }})
        </button>
      </div>

      <div class="card">
        <div *ngIf="isLoading" class="loading-center">
          <span class="spinner spinner-lg"></span>
        </div>

        <div *ngIf="!isLoading && syncRuns.length === 0" class="empty-state empty-state-lg">
          <div class="empty-icon-lg">⚡</div>
          <p class="empty-state-text">No sync events recorded yet.</p>
          <p class="empty-hint">
            Sync events are created whenever a manual sync, dry run simulation, background schedule, or webhook import runs.
          </p>
        </div>

        <div class="table-responsive" *ngIf="!isLoading && syncRuns.length > 0">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Profile</th>
                <th>Trigger</th>
                <th>Results Summary</th>
                <th>Status</th>
                <th>Duration</th>
                <th class="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let run of syncRuns" (click)="openRunDetail(run)" class="table-row-clickable">
                <td class="text-primary-semibold text-nowrap">
                  {{ formatDate(run.createdAt) }}
                </td>
                <td>
                  <div class="flex-row-gap-sm">
                    <span class="badge badge-radarr" *ngIf="run.syncProfile?.mainInstance?.type === 'radarr'">RADARR</span>
                    <span class="badge badge-sonarr" *ngIf="run.syncProfile?.mainInstance?.type === 'sonarr'">SONARR</span>
                    <strong class="profile-title-text">
                      {{ getProfileDisplayName(run) }}
                    </strong>
                  </div>
                </td>
                <td>
                  <span class="badge" [ngClass]="{
                    'badge-info': run.triggerType === 'manual',
                    'badge-muted': run.triggerType === 'scheduled',
                    'badge-warning': run.triggerType === 'webhook',
                    'badge-sonarr': run.triggerType === 'dry_run'
                  }">
                    {{ run.triggerType === 'manual' ? '⚡ MANUAL' : (run.triggerType === 'scheduled' ? '⏰ SCHEDULED' : (run.triggerType === 'dry_run' ? '🧪 DRY RUN' : '🪝 WEBHOOK')) }}
                  </span>
                </td>
                <td>
                  <div class="flex-row-wrap-sm">
                    <span class="badge badge-success" *ngIf="run.linkedCount > 0">
                      🔗 {{ run.linkedCount }} {{ run.triggerType === 'dry_run' ? 'would link' : 'linked' }}
                    </span>
                    <span class="badge badge-info" *ngIf="run.searchTriggeredCount > 0">
                      📥 {{ run.searchTriggeredCount }} {{ run.triggerType === 'dry_run' ? 'would download' : 'searched' }}
                    </span>
                    <span class="badge badge-muted" *ngIf="run.alreadyExistsChildCount > 0">
                      📁 {{ run.alreadyExistsChildCount }} on 2nd
                    </span>
                    <span class="badge badge-danger" *ngIf="run.errorCount > 0">
                      ⚠️ {{ run.errorCount }} error{{ run.errorCount > 1 ? 's' : '' }}
                    </span>
                    <span class="badge-count-hint" *ngIf="run.totalScanned > 0">
                      ({{ run.totalScanned }} scanned)
                    </span>
                  </div>
                </td>
                <td>
                  <span class="badge" [ngClass]="{
                    'badge-success': run.status === 'completed',
                    'badge-warning': run.status === 'partial',
                    'badge-danger': run.status === 'error',
                    'badge-info': run.status === 'running',
                    'badge-interrupted': run.status === 'interrupted'
                  }">
                    <span class="spinner-inline" *ngIf="run.status === 'running'"></span>
                    {{ run.status === 'interrupted' ? '⏸️ INTERRUPTED' : (run.status | uppercase) }}
                  </span>
                </td>
                <td class="duration-text">
                  <span *ngIf="run.status === 'running'" class="duration-running">
                    {{ formatDuration(getRunDuration(run)) }}
                  </span>
                  <span *ngIf="run.status !== 'running'">
                    {{ formatDuration(getRunDuration(run)) }}
                  </span>
                </td>
                <td class="text-right" (click)="$event.stopPropagation()">
                  <button class="btn btn-secondary btn-sm" (click)="openRunDetail(run)">
                    🔍 Inspect
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════
         VIEW 2: ALL RAW LOGS
         ═══════════════════════════════════════════════════════════════ -->
    <div *ngIf="activeView === 'logs'">
      <!-- Filter Pills -->
      <div class="filter-pills">
        <button
          class="filter-pill"
          [class.active]="selectedAction === ''"
          (click)="filterByAction('')"
        >
          All Actions ({{ totalLogsCount }})
        </button>
        <button
          class="filter-pill"
          [class.active]="selectedAction === 'linked'"
          (click)="filterByAction('linked')"
        >
          🔗 Linked
        </button>
        <button
          class="filter-pill"
          [class.active]="selectedAction === 'search_triggered'"
          (click)="filterByAction('search_triggered')"
        >
          🔍 Searches Triggered
        </button>
        <button
          class="filter-pill"
          [class.active]="selectedAction === 'added'"
          (click)="filterByAction('added')"
        >
          ➕ Added
        </button>
        <button
          class="filter-pill"
          [class.active]="selectedAction === 'error'"
          (click)="filterByAction('error')"
        >
          ⚠️ Errors
        </button>
      </div>

      <div class="card">
        <div *ngIf="isLoading" class="loading-center">
          <span class="spinner spinner-lg"></span>
        </div>

        <div *ngIf="!isLoading && history.length === 0" class="empty-state empty-state-lg">
          <div class="empty-icon-md">📋</div>
          <p class="empty-state-text">No raw logs recorded yet.</p>
        </div>

        <div class="table-responsive" *ngIf="!isLoading && history.length > 0">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Title</th>
                <th>Type</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of history">
                <td class="text-time-muted">{{ formatDate(item.createdAt) }}</td>
                <td class="text-title-bold">{{ item.mediaTitle }}</td>
                <td>
                  <span class="badge" [ngClass]="item.mediaType === 'movie' ? 'badge-radarr' : 'badge-sonarr'">
                    {{ item.mediaType | uppercase }}
                  </span>
                </td>
                <td>
                  <span class="badge" [ngClass]="{
                    'badge-success': item.action === 'linked' || item.action === 'added' || item.action === 'would_link',
                    'badge-info': item.action === 'search_triggered' || item.action === 'needs_download',
                    'badge-warning': item.action === 'season_monitored',
                    'badge-danger': item.action === 'error'
                  }">
                    {{ item.action }}
                  </span>
                </td>
                <td class="text-detail-secondary">
                  {{ item.details }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════
         FULL-SCREEN / LARGE SYNC RUN REPORT MODAL
         ═══════════════════════════════════════════════════════════════ -->
    <div *ngIf="showRunModal && selectedRunDetail" class="dry-run-overlay" (click)="onBackdropClick($event)">
      <div class="dry-run-modal card" (click)="$event.stopPropagation()">
        
        <!-- Modal Header -->
        <div class="dry-run-header">
          <div>
            <div class="dry-run-header-title">
              <span class="dry-run-header-icon">{{ selectedRunDetail.run.triggerType === 'dry_run' ? '🧪' : '⚡' }}</span>
              <h2 class="dry-run-header-h2">
                {{ selectedRunDetail.run.triggerType === 'dry_run' ? 'Dry Run Simulation Analysis' : 'Sync Event Audit & Inspection' }}
              </h2>
              <span class="badge" [ngClass]="{
                'badge-success': selectedRunDetail.run.status === 'completed',
                'badge-warning': selectedRunDetail.run.status === 'partial',
                'badge-danger': selectedRunDetail.run.status === 'error',
                'badge-info': selectedRunDetail.run.status === 'running',
                'badge-interrupted': selectedRunDetail.run.status === 'interrupted'
              }">
                <span class="spinner-inline" *ngIf="selectedRunDetail.run.status === 'running'"></span>
                {{ selectedRunDetail.run.status === 'interrupted' ? '⏸️ INTERRUPTED' : (selectedRunDetail.run.status | uppercase) }}
              </span>
              <span class="badge" [ngClass]="selectedRunDetail.run.triggerType === 'dry_run' ? 'badge-sonarr' : 'badge-info'" *ngIf="selectedRunDetail.run.triggerType">
                {{ selectedRunDetail.run.triggerType === 'dry_run' ? '🧪 DRY RUN' : (selectedRunDetail.run.triggerType | uppercase) }}
              </span>
            </div>
            <p class="dry-run-header-sub">
              Profile: <strong class="text-primary-emphasis">{{ getProfileDisplayName(selectedRunDetail.run) }}</strong> &bull; 
              Executed at {{ formatDate(selectedRunDetail.run.createdAt) }} &bull; 
              Duration: <strong>{{ formatDuration(getRunDuration(selectedRunDetail.run)) }}</strong>
            </p>
          </div>

          <div class="dry-run-header-actions">
            <button class="btn btn-ghost btn-sm btn-close-modal" (click)="closeRunModal()">
              ✕
            </button>
          </div>
        </div>

        <!-- Modal Body Scrollable -->
        <div class="dry-run-body">
          
          <!-- Running In-Progress Banner -->
          <div class="running-banner" *ngIf="selectedRunDetail.run.status === 'running'">
            <span class="spinner-inline"></span>
            <span>Sync is currently running... Items and logs are updating live in real time.</span>
          </div>
          
          <!-- Summary Metrics Cards Grid -->
          <div class="dry-run-stats-grid">
            
            <!-- 1. Hardlinked / Would Link -->
            <div class="stat-card stat-card-would-link">
              <div class="stat-icon stat-icon-would-link">🔗</div>
              <div class="stat-content">
                <div class="stat-number stat-num-would-link">{{ selectedRunDetail.summary.linkedCount }}</div>
                <div class="stat-label">{{ selectedRunDetail.run.triggerType === 'dry_run' ? 'Would Hardlink' : 'Hardlinked' }}</div>
                <div class="stat-sub">{{ selectedRunDetail.run.triggerType === 'dry_run' ? 'Has target audio; instant / 0 space' : 'Zero-space link created' }}</div>
              </div>
            </div>

            <!-- 2. Searches Triggered / Needs Download -->
            <div class="stat-card stat-card-needs-download">
              <div class="stat-icon stat-icon-needs-download">📥</div>
              <div class="stat-content">
                <div class="stat-number stat-num-needs-download">{{ selectedRunDetail.summary.searchTriggeredCount }}</div>
                <div class="stat-label">{{ selectedRunDetail.run.triggerType === 'dry_run' ? 'Needs Download' : 'Searches Triggered' }}</div>
                <div class="stat-sub">{{ selectedRunDetail.run.triggerType === 'dry_run' ? 'Lacks target audio; secondary downloads' : 'Dispatched to child indexers' }}</div>
              </div>
            </div>

            <!-- 3. Already Hardlinked -->
            <div class="stat-card stat-card-already-linked">
              <div class="stat-icon stat-icon-already-linked">✅</div>
              <div class="stat-content">
                <div class="stat-number stat-num-already-linked">{{ selectedRunDetail.summary.alreadyLinkedCount }}</div>
                <div class="stat-label">Already Hardlinked</div>
                <div class="stat-sub">Existing link verified</div>
              </div>
            </div>

            <!-- 4. On Secondary -->
            <div class="stat-card stat-card-already-child">
              <div class="stat-icon stat-icon-already-child">📁</div>
              <div class="stat-content">
                <div class="stat-number stat-num-already-child">{{ selectedRunDetail.summary.alreadyExistsChildCount }}</div>
                <div class="stat-label">Already on Secondary</div>
                <div class="stat-sub">Secondary downloaded copy</div>
              </div>
            </div>

            <!-- 5. Errors -->
            <div class="stat-card stat-card-errors">
              <div class="stat-icon stat-icon-errors">⚠️</div>
              <div class="stat-content">
                <div class="stat-number stat-num-errors">{{ selectedRunDetail.summary.errorCount }}</div>
                <div class="stat-label">Errors</div>
                <div class="stat-sub">{{ selectedRunDetail.summary.errorCount === 0 ? 'Clean run' : 'Issues encountered' }}</div>
              </div>
            </div>

          </div>

          <!-- In-Modal Search Bar -->
          <div class="search-bar-container">
            <input 
              type="text" 
              class="form-input" 
              placeholder="Search items by title or path in this run..." 
              [(ngModel)]="modalSearchQuery"
            />
          </div>

          <!-- Categorized Collapsible Details Sections -->
          <div class="dry-run-sections">
            
            <!-- SECTION 1: Hardlinked / Would Link Items -->
            <details class="details-section" [open]="filteredLinked.length > 0">
              <summary class="section-summary summary-would-link">
                <div class="summary-left">
                  <span class="summary-icon">🔗</span>
                  <span class="section-title">
                    {{ selectedRunDetail.run.triggerType === 'dry_run' ? 'Would Hardlink Items' : 'Hardlinked Items' }} ({{ filteredLinked.length }})
                  </span>
                </div>
                <span class="summary-hint">Zero-space hardlinks created or simulated</span>
              </summary>
              <div class="section-content">
                <div *ngIf="filteredLinked.length === 0" class="section-empty">
                  No items in this category.
                </div>
                <div *ngFor="let item of filteredLinked" class="item-row">
                  <div class="item-header">
                    <div class="item-title-group">
                      <span class="item-title-text">{{ item.mediaTitle }}</span>
                      <span class="badge" [ngClass]="item.mediaType === 'movie' ? 'badge-radarr' : 'badge-sonarr'">
                        {{ item.mediaType | uppercase }}
                      </span>
                    </div>
                  </div>
                  <div class="item-paths" *ngIf="item.sourcePath || item.destinationPath">
                    <div class="path-line" *ngIf="item.sourcePath">
                      <span class="path-tag">SOURCE:</span>
                      <code>{{ item.sourcePath }}</code>
                    </div>
                    <div class="path-line" *ngIf="item.destinationPath">
                      <span class="path-tag">TARGET:</span>
                      <code>{{ item.destinationPath }}</code>
                    </div>
                  </div>
                  <div class="item-reason" *ngIf="item.details && item.details !== item.mediaTitle">
                    {{ item.details }}
                  </div>
                </div>
              </div>
            </details>

            <!-- SECTION 2: Searches Triggered / Needs Download -->
            <details class="details-section" [open]="filteredSearchTriggered.length > 0">
              <summary class="section-summary summary-needs-download">
                <div class="summary-left">
                  <span class="summary-icon">📥</span>
                  <span class="section-title">
                    {{ selectedRunDetail.run.triggerType === 'dry_run' ? 'Needs Download on Child' : 'Searches Triggered on Child' }} ({{ filteredSearchTriggered.length }})
                  </span>
                </div>
                <span class="summary-hint">Missing target audio; downloaded from indexers</span>
              </summary>
              <div class="section-content">
                <div *ngIf="filteredSearchTriggered.length === 0" class="section-empty">
                  No items in this category.
                </div>
                <div *ngFor="let item of filteredSearchTriggered" class="item-row">
                  <div class="item-header">
                    <div class="item-title-group">
                      <span class="item-title-text">{{ item.mediaTitle }}</span>
                      <span class="badge" [ngClass]="item.mediaType === 'movie' ? 'badge-radarr' : 'badge-sonarr'">
                        {{ item.mediaType | uppercase }}
                      </span>
                    </div>
                  </div>
                  <div class="item-reason">{{ item.details }}</div>
                </div>
              </div>
            </details>

            <!-- SECTION 3: Already on Secondary -->
            <details class="details-section" [open]="filteredAlreadyExists.length > 0">
              <summary class="section-summary summary-already-child">
                <div class="summary-left">
                  <span class="summary-icon">📁</span>
                  <span class="section-title">Already on Secondary ({{ filteredAlreadyExists.length }})</span>
                </div>
                <span class="summary-hint">Secondary instance has its own separate downloaded file</span>
              </summary>
              <div class="section-content">
                <div *ngIf="filteredAlreadyExists.length === 0" class="section-empty">
                  No secondary duplicate files found.
                </div>
                <div *ngFor="let item of filteredAlreadyExists" class="item-row">
                  <div class="item-header">
                    <div class="item-title-group">
                      <span class="item-title-text">{{ item.mediaTitle }}</span>
                      <span class="badge" [ngClass]="item.mediaType === 'movie' ? 'badge-radarr' : 'badge-sonarr'">
                        {{ item.mediaType | uppercase }}
                      </span>
                    </div>
                  </div>
                  <div class="item-reason">{{ item.details }}</div>
                </div>
              </div>
            </details>

            <!-- SECTION 4: Errors -->
            <details class="details-section" [open]="filteredErrors.length > 0">
              <summary class="section-summary summary-errors">
                <div class="summary-left">
                  <span class="summary-icon">⚠️</span>
                  <span class="section-title">Errors Encountered ({{ filteredErrors.length }})</span>
                </div>
                <span class="summary-hint">API timeouts, permissions, or lookup failures</span>
              </summary>
              <div class="section-content">
                <div *ngIf="filteredErrors.length === 0" class="section-empty">
                  Zero errors encountered during this sync run.
                </div>
                <div *ngFor="let item of filteredErrors" class="item-row item-row-error">
                  <div class="item-header">
                    <div class="item-title-group">
                      <span class="item-title-text">{{ item.mediaTitle }}</span>
                      <span class="badge badge-danger">ERROR</span>
                    </div>
                  </div>
                  <div class="item-reason item-reason-error">{{ item.details }}</div>
                  <div class="item-paths" *ngIf="item.sourcePath">
                    <div class="path-line">
                      <span class="path-tag">FILE:</span>
                      <code>{{ item.sourcePath }}</code>
                    </div>
                  </div>
                </div>
              </div>
            </details>

            <!-- SECTION 5: Raw Logs Stream for this Run -->
            <details class="details-section" [open]="selectedRunDetail.items.length > 0">
              <summary class="section-summary summary-already-linked">
                <div class="summary-left">
                  <span class="summary-icon">📜</span>
                  <span class="section-title">Raw Execution Logs ({{ filteredLogs.length }})</span>
                </div>
                <span class="summary-hint">Chronological logs for this sync event</span>
              </summary>
              <div class="section-content logs-section-content">
                <div *ngIf="filteredLogs.length === 0" class="section-empty">
                  No log entries recorded.
                </div>
                <div class="raw-logs-container" *ngIf="filteredLogs.length > 0">
                  <div *ngFor="let log of filteredLogs" class="raw-log-line">
                    <span class="raw-log-time">{{ formatDate(log.createdAt) }}</span>
                    <span class="badge badge-log-tag" [ngClass]="{
                      'badge-success': log.action === 'linked' || log.action === 'added' || log.action === 'would_link',
                      'badge-info': log.action === 'search_triggered' || log.action === 'needs_download',
                      'badge-warning': log.action === 'season_monitored',
                      'badge-danger': log.action === 'error',
                      'badge-muted': log.action === 'already_linked' || log.action === 'already_exists_child'
                    }">
                      {{ log.action | uppercase }}
                    </span>
                    <span class="raw-log-msg">
                      <strong>{{ log.mediaTitle }}</strong>: {{ log.details }}
                    </span>
                  </div>
                </div>
              </div>
            </details>

          </div>

        </div>

        <!-- Modal Footer -->
        <div class="dry-run-footer">
          <div class="dry-run-footer-hint">
            Sync Run ID: <code>{{ selectedRunDetail.run.syncRunId }}</code>
          </div>
          <button class="btn btn-secondary btn-sm" (click)="closeRunModal()">
            Done
          </button>
        </div>

      </div>
    </div>
  `,
})
export class HistoryComponent implements OnInit, OnDestroy {
  activeView: 'events' | 'logs' = 'events';
  isLoading = false;

  // Sync Runs (Events)
  syncRuns: SyncRun[] = [];
  totalRunsCount = 0;
  liveRunsCount = 0;
  dryRunsCount = 0;
  selectedTriggerFilter: '' | 'live' | 'dry_run' = '';

  // Raw Logs
  history: SyncHistoryEntry[] = [];
  totalLogsCount = 0;
  selectedAction = '';

  // Inspection Modal
  showRunModal = false;
  selectedRunDetail: SyncRunDetail | null = null;
  modalSearchQuery = '';

  // Live Timer & Polling State
  private liveTickerTimer: any = null;
  private pollingTimer: any = null;
  now: number = Date.now();

  constructor(
    private api: ApiService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.startLiveTicker();
    this.loadSyncRuns();
    this.loadSyncRunsCount();
    this.loadRawLogsCount();
  }

  ngOnDestroy() {
    this.stopLiveTicker();
    this.stopPolling();
  }

  private startLiveTicker() {
    if (this.liveTickerTimer) return;
    this.liveTickerTimer = setInterval(() => {
      this.now = Date.now();
      const hasActive = this.syncRuns.some(r => r.status === 'running') || this.selectedRunDetail?.run.status === 'running';
      if (hasActive) {
        this.cdr.detectChanges();
      }
    }, 1000);
  }

  private stopLiveTicker() {
    if (this.liveTickerTimer) {
      clearInterval(this.liveTickerTimer);
      this.liveTickerTimer = null;
    }
  }

  private checkAndSetupPolling() {
    const hasRunning = this.syncRuns.some(r => r.status === 'running');
    if (hasRunning && !this.pollingTimer) {
      this.pollingTimer = setInterval(() => {
        this.pollActiveRuns();
      }, 3000);
    } else if (!hasRunning && this.pollingTimer) {
      this.stopPolling();
    }
  }

  private stopPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  private pollActiveRuns() {
    const params: any = { limit: 50 };
    if (this.selectedTriggerFilter === 'dry_run') {
      params.triggerType = 'dry_run';
    }

    this.api.getSyncRuns(params).subscribe({
      next: (res: any) => {
        let list: SyncRun[] = res?.data || res?.items || (Array.isArray(res) ? res : []);
        if (this.selectedTriggerFilter === 'live') {
          list = list.filter(r => r.triggerType !== 'dry_run');
        }
        this.syncRuns = list;
        this.checkAndSetupPolling();
        this.cdr.detectChanges();
      },
    });

    // If inspection modal is open on a running job, refresh its details too
    if (this.showRunModal && this.selectedRunDetail && this.selectedRunDetail.run.status === 'running') {
      this.api.getSyncRunDetail(this.selectedRunDetail.run.id).subscribe({
        next: (detail: SyncRunDetail) => {
          this.selectedRunDetail = detail;
          this.cdr.detectChanges();
        },
      });
    }
  }

  switchView(view: 'events' | 'logs') {
    this.activeView = view;
    if (view === 'events') {
      this.loadSyncRuns();
      this.loadSyncRunsCount();
    } else {
      this.loadRawLogs();
      this.loadRawLogsCount();
    }
  }

  refreshCurrentView() {
    if (this.activeView === 'events') {
      this.loadSyncRuns();
      this.loadSyncRunsCount();
      this.loadRawLogsCount();
    } else {
      this.loadRawLogs();
      this.loadSyncRunsCount();
      this.loadRawLogsCount();
    }
  }

  filterByTrigger(trigger: '' | 'live' | 'dry_run') {
    this.selectedTriggerFilter = trigger;
    this.loadSyncRuns();
  }

  loadSyncRuns() {
    this.isLoading = true;
    this.cdr.markForCheck();

    const params: any = { limit: 50 };
    if (this.selectedTriggerFilter === 'dry_run') {
      params.triggerType = 'dry_run';
    }

    this.api.getSyncRuns(params).subscribe({
      next: (res: any) => {
        let list: SyncRun[] = res?.data || res?.items || (Array.isArray(res) ? res : []);
        if (this.selectedTriggerFilter === 'live') {
          list = list.filter(r => r.triggerType !== 'dry_run');
        }
        this.syncRuns = list;
        this.isLoading = false;
        this.checkAndSetupPolling();
        this.cdr.detectChanges();
      },
      error: () => {
        this.syncRuns = [];
        this.isLoading = false;
        this.checkAndSetupPolling();
        this.cdr.detectChanges();
      },
    });
  }

  loadSyncRunsCount() {
    this.api.getSyncRuns({ limit: 200 }).subscribe({
      next: (res: any) => {
        const list: SyncRun[] = res?.data || res?.items || (Array.isArray(res) ? res : []);
        this.totalRunsCount = res?.total ?? list.length;
        this.dryRunsCount = list.filter(r => r.triggerType === 'dry_run').length;
        this.liveRunsCount = list.filter(r => r.triggerType !== 'dry_run').length;
        this.cdr.detectChanges();
      },
    });
  }

  loadRawLogs() {
    this.isLoading = true;
    this.cdr.markForCheck();

    this.api.getHistory({
      limit: 100,
      action: this.selectedAction || undefined,
    }).subscribe({
      next: (res: any) => {
        this.history = res?.data || res?.items || (Array.isArray(res) ? res : []);
        this.totalLogsCount = res?.total ?? this.history.length;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.history = [];
        this.isLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  loadRawLogsCount() {
    this.api.getHistory({ limit: 1 }).subscribe({
      next: (res: any) => {
        this.totalLogsCount = res?.total ?? 0;
        this.cdr.detectChanges();
      },
    });
  }

  filterByAction(action: string) {
    this.selectedAction = action;
    this.loadRawLogs();
  }

  openRunDetail(run: SyncRun) {
    this.modalSearchQuery = '';
    this.api.getSyncRunDetail(run.id).subscribe({
      next: (detail: SyncRunDetail) => {
        this.selectedRunDetail = detail;
        this.showRunModal = true;
        this.cdr.detectChanges();
      },
      error: () => {
        // Fallback detail if endpoint fails
        this.selectedRunDetail = {
          run,
          items: [],
          summary: {
            totalScanned: run.totalScanned,
            linkedCount: run.linkedCount,
            alreadyLinkedCount: run.alreadyLinkedCount,
            searchTriggeredCount: run.searchTriggeredCount,
            alreadyExistsChildCount: run.alreadyExistsChildCount,
            skippedCount: run.skippedCount,
            errorCount: run.errorCount,
            durationMs: run.durationMs,
          },
          categorized: {
            linked: [],
            alreadyLinked: [],
            searchTriggered: [],
            alreadyExistsChild: [],
            added: [],
            seasonMonitored: [],
            errors: [],
          },
        };
        this.showRunModal = true;
        this.cdr.detectChanges();
      },
    });
  }

  closeRunModal() {
    this.showRunModal = false;
    this.selectedRunDetail = null;
    this.modalSearchQuery = '';
  }

  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('dry-run-overlay')) {
      this.closeRunModal();
    }
  }

  getProfileDisplayName(run: SyncRun): string {
    if (run.syncProfile) {
      const mainName = run.syncProfile.mainInstance?.name || 'Main';
      const childName = run.syncProfile.childInstance?.name || 'Child';
      return `${mainName} ➔ ${childName}`;
    }
    return `Profile #${run.syncProfileId}`;
  }

  formatDate(dateStr?: string | Date): string {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return String(dateStr);
    }
  }

  getRunDuration(run?: SyncRun): number {
    if (!run) return 0;
    if (run.status === 'running' && run.createdAt) {
      const start = new Date(run.createdAt).getTime();
      return Math.max(0, this.now - start);
    }
    return run.durationMs || 0;
  }

  formatDuration(ms?: number): string {
    if (!ms || ms <= 0) return '0s';
    if (ms < 1000) return `${ms}ms`;
    const sec = (ms / 1000).toFixed(1);
    return `${sec}s`;
  }

  // Filtered Getters for Modal
  get filteredLinked(): SyncHistoryEntry[] {
    const list = this.selectedRunDetail?.categorized?.linked || [];
    return this.applyModalFilter(list);
  }

  get filteredSearchTriggered(): SyncHistoryEntry[] {
    const list = this.selectedRunDetail?.categorized?.searchTriggered || [];
    return this.applyModalFilter(list);
  }

  get filteredAlreadyExists(): SyncHistoryEntry[] {
    const list = this.selectedRunDetail?.categorized?.alreadyExistsChild || [];
    return this.applyModalFilter(list);
  }

  get filteredErrors(): SyncHistoryEntry[] {
    const list = this.selectedRunDetail?.categorized?.errors || [];
    return this.applyModalFilter(list);
  }

  get filteredLogs(): SyncHistoryEntry[] {
    const list = this.selectedRunDetail?.items || [];
    return this.applyModalFilter(list);
  }

  private applyModalFilter(items: SyncHistoryEntry[]): SyncHistoryEntry[] {
    if (!this.modalSearchQuery || this.modalSearchQuery.trim() === '') {
      return items;
    }
    const q = this.modalSearchQuery.toLowerCase();
    return items.filter(i =>
      i.mediaTitle?.toLowerCase().includes(q) ||
      i.details?.toLowerCase().includes(q) ||
      i.sourcePath?.toLowerCase().includes(q) ||
      i.destinationPath?.toLowerCase().includes(q)
    );
  }
}

