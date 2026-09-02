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
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let run of syncRuns" (click)="openRunDetail(run)" class="table-row-clickable">
                <td class="text-primary-semibold text-nowrap">
                  {{ formatDate(run.createdAt) }}
                </td>
                <td class="text-nowrap">
                  <div class="flex-row-gap-sm">
                    <span class="badge badge-radarr" *ngIf="run.syncProfile?.mainInstance?.type === 'radarr'">RADARR</span>
                    <span class="badge badge-sonarr" *ngIf="run.syncProfile?.mainInstance?.type === 'sonarr'">SONARR</span>
                    <strong class="profile-title-text">
                      {{ getProfileDisplayName(run) }}
                    </strong>
                  </div>
                </td>
                <td class="text-nowrap">
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
                <td class="text-nowrap">
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
                <td class="text-right">
                  <span class="row-chevron">›</span>
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
                  <span class="badge" [ngClass]="getActionBadgeClass(item.action)">
                    {{ getActionLabel(item.action) }}
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
                {{ selectedRunDetail.run.triggerType === 'dry_run' ? 'Dry Run Simulation Analysis' : 'Sync Event Details & Audit' }}
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
          
          <!-- Summary Metrics Cards Grid (4 Media Categories) -->
          <div class="dry-run-stats-grid">
            
            <!-- 1. Hardlinked / Would Link -->
            <div class="stat-card stat-card-would-link">
              <div class="stat-icon stat-icon-would-link">🔗</div>
              <div class="stat-content">
                <div class="stat-number stat-num-would-link">{{ selectedRunDetail.summary.linkedCount }}</div>
                <div class="stat-label">{{ selectedRunDetail.run.triggerType === 'dry_run' ? 'Ready to Hardlink' : 'Hardlinked' }}</div>
                <div class="stat-sub stat-sub-highlight" *ngIf="isEpisodeRun() && selectedRunDetail.categorized.linked.length">
                  {{ getBreakdownText(selectedRunDetail.categorized.linked) }}
                </div>
                <div class="stat-sub">{{ selectedRunDetail.run.triggerType === 'dry_run' ? 'Has target audio; instant / 0 space' : 'Zero-space link created' }}</div>
              </div>
            </div>

            <!-- 2. Searches Triggered / Needs Download -->
            <div class="stat-card stat-card-needs-download">
              <div class="stat-icon stat-icon-needs-download">📥</div>
              <div class="stat-content">
                <div class="stat-number stat-num-needs-download">{{ selectedRunDetail.summary.searchTriggeredCount }}</div>
                <div class="stat-label">{{ selectedRunDetail.run.triggerType === 'dry_run' ? 'Needs Download' : 'Searches Triggered' }}</div>
                <div class="stat-sub stat-sub-highlight" *ngIf="isEpisodeRun() && selectedRunDetail.categorized.searchTriggered.length">
                  {{ getBreakdownText(selectedRunDetail.categorized.searchTriggered) }}
                </div>
                <div class="stat-sub">{{ selectedRunDetail.run.triggerType === 'dry_run' ? 'Lacks target audio; secondary downloads' : 'Dispatched to child indexers' }}</div>
              </div>
            </div>

            <!-- 3. Already Hardlinked -->
            <div class="stat-card stat-card-already-linked">
              <div class="stat-icon stat-icon-already-linked">✅</div>
              <div class="stat-content">
                <div class="stat-number stat-num-already-linked">{{ selectedRunDetail.summary.alreadyLinkedCount }}</div>
                <div class="stat-label">Already Hardlinked</div>
                <div class="stat-sub stat-sub-highlight" *ngIf="isEpisodeRun() && selectedRunDetail.categorized.alreadyLinked.length">
                  {{ getBreakdownText(selectedRunDetail.categorized.alreadyLinked) }}
                </div>
                <div class="stat-sub">Existing link verified on disk</div>
              </div>
            </div>

            <!-- 4. On Secondary -->
            <div class="stat-card stat-card-already-exists">
              <div class="stat-icon stat-icon-already-exists">📁</div>
              <div class="stat-content">
                <div class="stat-number stat-num-already-exists">{{ selectedRunDetail.summary.alreadyExistsChildCount }}</div>
                <div class="stat-label">Already on Secondary</div>
                <div class="stat-sub stat-sub-highlight" *ngIf="isEpisodeRun() && selectedRunDetail.categorized.alreadyExistsChild.length">
                  {{ getBreakdownText(selectedRunDetail.categorized.alreadyExistsChild) }}
                </div>
                <div class="stat-sub">Secondary downloaded copy</div>
              </div>
            </div>

          </div>

          <!-- Slim Status & Errors Summary Bar -->
          <div class="dry-run-status-bar" [class.has-errors]="selectedRunDetail.summary.errorCount > 0">
            <div class="status-bar-item">
              <span>📊 Total Scanned: <strong>{{ selectedRunDetail.summary.totalScanned.toLocaleString() }}</strong></span>
              <span class="status-divider">•</span>
              <span *ngIf="selectedRunDetail.summary.errorCount === 0" class="text-muted">✅ 0 Inspection Errors</span>
              <span *ngIf="selectedRunDetail.summary.errorCount > 0" class="text-danger font-semibold">⚠️ {{ selectedRunDetail.summary.errorCount }} System / Inspection Errors</span>
            </div>
            <div class="status-bar-item text-xs text-muted" *ngIf="isEpisodeRun()">
              <span>{{ isEpisodeRun() ? 'Grouped by TV Series & Season' : 'Movie Library' }}</span>
            </div>
          </div>

          <!-- In-Modal Search Bar & View Toggle -->
          <div class="filter-bar flex-between flex-wrap gap-sm">
            <div class="filter-input-wrap">
              <span class="filter-search-icon">🔍</span>
              <input 
                type="text" 
                class="form-input filter-input" 
                placeholder="Search items by title or path in this run..." 
                [(ngModel)]="modalSearchQuery"
              />
            </div>

            <!-- Group by Show vs Flat List toggle (Shown for Sonarr / Episode Runs) -->
            <div class="view-mode-toggle" *ngIf="isEpisodeRun()">
              <button
                type="button"
                class="view-mode-btn"
                [class.active]="reportViewMode === 'grouped'"
                (click)="reportViewMode = 'grouped'"
              >
                📺 Group by Show
              </button>
              <button
                type="button"
                class="view-mode-btn"
                [class.active]="reportViewMode === 'flat'"
                (click)="reportViewMode = 'flat'"
              >
                📋 Flat List
              </button>
            </div>

            <button *ngIf="modalSearchQuery" class="btn btn-ghost btn-sm" (click)="modalSearchQuery = ''">
              Clear Filter
            </button>
          </div>

          <!-- Loading State Inside Modal -->
          <div *ngIf="isModalLoading" class="loading-center">
            <span class="spinner spinner-lg"></span>
          </div>

          <!-- Categorized Collapsible Details Sections -->
          <div class="dry-run-sections" *ngIf="!isModalLoading">
            
            <!-- SECTION 1: Hardlinked / Would Link Items -->
            <details class="report-section" [open]="filteredLinked.length > 0">
              <summary class="report-summary">
                <div class="summary-left">
                  <span class="section-icon">🔗</span>
                  <span class="section-title">
                    {{ selectedRunDetail.run.triggerType === 'dry_run' ? 'Ready to Hardlink' : 'Hardlinked Items' }}
                  </span>
                  <span class="badge badge-info">{{ filteredLinked.length }} {{ isEpisodeRun() ? 'Episodes' : 'Items' }}</span>
                  <span class="badge badge-secondary" *ngIf="isEpisodeRun() && filteredLinked.length">
                    {{ getShowsCount(filteredLinked) }} Shows ({{ getSeasonsCount(filteredLinked) }} Seasons)
                  </span>
                </div>
                <span class="summary-hint">Zero-space hardlinks created or simulated</span>
              </summary>
              <div class="section-content">
                <div *ngIf="filteredLinked.length === 0" class="section-empty">
                  No items in this category{{ modalSearchQuery ? ' matching your filter' : '' }}.
                </div>

                <!-- Grouped View -->
                <ng-container *ngIf="isEpisodeRun() && reportViewMode === 'grouped'">
                  <div *ngFor="let group of groupItemsByShow(filteredLinked)" class="show-group-card">
                    <div class="show-group-header" (click)="toggleShowExpanded('linked', group.showTitle)">
                      <div class="flex-align-center gap-sm flex-wrap">
                        <span class="show-group-title">{{ group.showTitle }}</span>
                        <span class="badge badge-sonarr">SERIES</span>
                        <span class="badge badge-info">{{ group.totalEpisodes }} {{ selectedRunDetail.run.triggerType === 'dry_run' ? 'Ready to Link' : 'Linked' }}</span>
                        <span class="badge badge-secondary">{{ group.seasons.length }} {{ group.seasons.length === 1 ? 'Season' : 'Seasons' }}</span>
                      </div>
                      <span class="dropdown-chevron">{{ isShowExpanded('linked', group.showTitle) ? '▲' : '▼' }}</span>
                    </div>

                    <div class="show-group-content" *ngIf="isShowExpanded('linked', group.showTitle)">
                      <div *ngFor="let season of group.seasons" class="season-group-block">
                        <div class="season-group-header">
                          <span>Season {{ season.seasonNumber }}</span>
                          <span class="badge badge-muted">{{ season.episodes.length }} Episodes</span>
                        </div>
                        <div class="season-episodes-list">
                          <div *ngFor="let item of season.episodes" class="item-row">
                            <div class="item-header">
                              <div class="item-title-group">
                                <span class="item-title-text">{{ item.mediaTitle }}</span>
                                <span *ngIf="item.languagesDetected && item.languagesDetected.length" class="badge badge-success">
                                  Audio: {{ item.languagesDetected.join(', ') | uppercase }}
                                </span>
                              </div>
                              <span class="badge badge-info">{{ selectedRunDetail.run.triggerType === 'dry_run' ? 'Will Hardlink' : 'Hardlinked' }}</span>
                            </div>
                            <div class="item-paths" *ngIf="item.sourcePath || item.destinationPath">
                              <div class="path-line" *ngIf="item.sourcePath">
                                <span class="path-tag">SOURCE:</span> <code>{{ item.sourcePath }}</code>
                              </div>
                              <div class="path-line" *ngIf="item.destinationPath">
                                <span class="path-tag">TARGET:</span> <code>{{ item.destinationPath }}</code>
                              </div>
                            </div>
                            <div class="item-reason" *ngIf="item.details && item.details !== item.mediaTitle">{{ item.details }}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </ng-container>

                <!-- Flat View -->
                <ng-container *ngIf="!isEpisodeRun() || reportViewMode === 'flat'">
                  <div *ngFor="let item of filteredLinked" class="item-row">
                    <div class="item-header">
                      <div class="item-title-group">
                        <span class="item-title-text">{{ item.mediaTitle }}</span>
                        <span class="badge" [ngClass]="item.mediaType === 'movie' ? 'badge-radarr' : 'badge-sonarr'">
                          {{ item.mediaType | uppercase }}
                        </span>
                        <span *ngIf="item.languagesDetected && item.languagesDetected.length" class="badge badge-success">
                          Audio: {{ item.languagesDetected.join(', ') | uppercase }}
                        </span>
                      </div>
                      <span class="badge badge-info">{{ selectedRunDetail.run.triggerType === 'dry_run' ? 'Will Hardlink' : 'Hardlinked' }}</span>
                    </div>
                    <div class="item-paths" *ngIf="item.sourcePath || item.destinationPath">
                      <div class="path-line" *ngIf="item.sourcePath">
                        <span class="path-tag">SOURCE:</span> <code>{{ item.sourcePath }}</code>
                      </div>
                      <div class="path-line" *ngIf="item.destinationPath">
                        <span class="path-tag">TARGET:</span> <code>{{ item.destinationPath }}</code>
                      </div>
                    </div>
                    <div class="item-reason" *ngIf="item.details && item.details !== item.mediaTitle">{{ item.details }}</div>
                  </div>
                </ng-container>
              </div>
            </details>

            <!-- SECTION 2: Searches Triggered / Needs Download -->
            <details class="report-section" [open]="filteredSearchTriggered.length > 0">
              <summary class="report-summary">
                <div class="summary-left">
                  <span class="section-icon">📥</span>
                  <span class="section-title">
                    {{ selectedRunDetail.run.triggerType === 'dry_run' ? 'Needs Download on Secondary' : 'Searches Triggered on Secondary' }}
                  </span>
                  <span class="badge badge-warning">{{ filteredSearchTriggered.length }} {{ isEpisodeRun() ? 'Episodes' : 'Items' }}</span>
                  <span class="badge badge-secondary" *ngIf="isEpisodeRun() && filteredSearchTriggered.length">
                    {{ getShowsCount(filteredSearchTriggered) }} Shows ({{ getSeasonsCount(filteredSearchTriggered) }} Seasons)
                  </span>
                </div>
                <span class="summary-hint">Missing target audio; secondary downloaded from indexers</span>
              </summary>
              <div class="section-content">
                <div *ngIf="filteredSearchTriggered.length === 0" class="section-empty">
                  No items in this category{{ modalSearchQuery ? ' matching your filter' : '' }}.
                </div>

                <!-- Grouped View -->
                <ng-container *ngIf="isEpisodeRun() && reportViewMode === 'grouped'">
                  <div *ngFor="let group of groupItemsByShow(filteredSearchTriggered)" class="show-group-card">
                    <div class="show-group-header" (click)="toggleShowExpanded('searched', group.showTitle)">
                      <div class="flex-align-center gap-sm flex-wrap">
                        <span class="show-group-title">{{ group.showTitle }}</span>
                        <span class="badge badge-sonarr">SERIES</span>
                        <span class="badge badge-warning">{{ group.totalEpisodes }} {{ selectedRunDetail.run.triggerType === 'dry_run' ? 'Needs Download' : 'Searched' }}</span>
                        <span class="badge badge-secondary">{{ group.seasons.length }} {{ group.seasons.length === 1 ? 'Season' : 'Seasons' }}</span>
                      </div>
                      <span class="dropdown-chevron">{{ isShowExpanded('searched', group.showTitle) ? '▲' : '▼' }}</span>
                    </div>

                    <div class="show-group-content" *ngIf="isShowExpanded('searched', group.showTitle)">
                      <div *ngFor="let season of group.seasons" class="season-group-block">
                        <div class="season-group-header">
                          <span>Season {{ season.seasonNumber }}</span>
                          <span class="badge badge-muted">{{ season.episodes.length }} Episodes</span>
                        </div>
                        <div class="season-episodes-list">
                          <div *ngFor="let item of season.episodes" class="item-row">
                            <div class="item-header">
                              <span class="item-title-text">{{ item.mediaTitle }}</span>
                              <span class="badge badge-warning">{{ selectedRunDetail.run.triggerType === 'dry_run' ? 'Needs Download' : 'Search Triggered' }}</span>
                            </div>
                            <div class="item-reason">{{ item.details }}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </ng-container>

                <!-- Flat View -->
                <ng-container *ngIf="!isEpisodeRun() || reportViewMode === 'flat'">
                  <div *ngFor="let item of filteredSearchTriggered" class="item-row">
                    <div class="item-header">
                      <div class="item-title-group">
                        <span class="item-title-text">{{ item.mediaTitle }}</span>
                        <span class="badge" [ngClass]="item.mediaType === 'movie' ? 'badge-radarr' : 'badge-sonarr'">
                          {{ item.mediaType | uppercase }}
                        </span>
                      </div>
                      <span class="badge badge-warning">{{ selectedRunDetail.run.triggerType === 'dry_run' ? 'Needs Download' : 'Search Triggered' }}</span>
                    </div>
                    <div class="item-reason">{{ item.details }}</div>
                  </div>
                </ng-container>
              </div>
            </details>

            <!-- SECTION 3: Already Hardlinked -->
            <details class="report-section" [open]="filteredAlreadyLinked.length > 0" *ngIf="filteredAlreadyLinked.length > 0">
              <summary class="report-summary">
                <div class="summary-left">
                  <span class="section-icon">✅</span>
                  <span class="section-title">Already Hardlinked</span>
                  <span class="badge badge-success">{{ filteredAlreadyLinked.length }} {{ isEpisodeRun() ? 'Episodes' : 'Items' }}</span>
                  <span class="badge badge-secondary" *ngIf="isEpisodeRun() && filteredAlreadyLinked.length">
                    {{ getShowsCount(filteredAlreadyLinked) }} Shows ({{ getSeasonsCount(filteredAlreadyLinked) }} Seasons)
                  </span>
                </div>
                <span class="summary-hint">Existing hardlink verified on disk</span>
              </summary>
              <div class="section-content">
                <!-- Grouped View -->
                <ng-container *ngIf="isEpisodeRun() && reportViewMode === 'grouped'">
                  <div *ngFor="let group of groupItemsByShow(filteredAlreadyLinked)" class="show-group-card">
                    <div class="show-group-header" (click)="toggleShowExpanded('alreadyLinked', group.showTitle)">
                      <div class="flex-align-center gap-sm flex-wrap">
                        <span class="show-group-title">{{ group.showTitle }}</span>
                        <span class="badge badge-sonarr">SERIES</span>
                        <span class="badge badge-success">{{ group.totalEpisodes }} Linked</span>
                        <span class="badge badge-secondary">{{ group.seasons.length }} {{ group.seasons.length === 1 ? 'Season' : 'Seasons' }}</span>
                      </div>
                      <span class="dropdown-chevron">{{ isShowExpanded('alreadyLinked', group.showTitle) ? '▲' : '▼' }}</span>
                    </div>

                    <div class="show-group-content" *ngIf="isShowExpanded('alreadyLinked', group.showTitle)">
                      <div *ngFor="let season of group.seasons" class="season-group-block">
                        <div class="season-group-header">
                          <span>Season {{ season.seasonNumber }}</span>
                          <span class="badge badge-muted">{{ season.episodes.length }} Episodes</span>
                        </div>
                        <div class="season-episodes-list">
                          <div *ngFor="let item of season.episodes" class="item-row">
                            <div class="item-header">
                              <span class="item-title-text">{{ item.mediaTitle }}</span>
                              <span class="badge badge-success">Already Linked</span>
                            </div>
                            <div class="item-paths" *ngIf="item.sourcePath || item.destinationPath">
                              <div class="path-line" *ngIf="item.sourcePath">
                                <span class="path-tag">SOURCE:</span> <code>{{ item.sourcePath }}</code>
                              </div>
                              <div class="path-line" *ngIf="item.destinationPath">
                                <span class="path-tag">TARGET:</span> <code>{{ item.destinationPath }}</code>
                              </div>
                            </div>
                            <div class="item-reason" *ngIf="item.details && item.details !== item.mediaTitle">{{ item.details }}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </ng-container>

                <!-- Flat View -->
                <ng-container *ngIf="!isEpisodeRun() || reportViewMode === 'flat'">
                  <div *ngFor="let item of filteredAlreadyLinked" class="item-row">
                    <div class="item-header">
                      <span class="item-title-text">{{ item.mediaTitle }}</span>
                      <span class="badge badge-success">Already Linked</span>
                    </div>
                    <div class="item-paths" *ngIf="item.sourcePath || item.destinationPath">
                      <div class="path-line" *ngIf="item.sourcePath">
                        <span class="path-tag">SOURCE:</span> <code>{{ item.sourcePath }}</code>
                      </div>
                      <div class="path-line" *ngIf="item.destinationPath">
                        <span class="path-tag">TARGET:</span> <code>{{ item.destinationPath }}</code>
                      </div>
                    </div>
                    <div class="item-reason" *ngIf="item.details && item.details !== item.mediaTitle">{{ item.details }}</div>
                  </div>
                </ng-container>
              </div>
            </details>

            <!-- SECTION 4: Already on Secondary -->
            <details class="report-section" [open]="filteredAlreadyExists.length > 0">
              <summary class="report-summary">
                <div class="summary-left">
                  <span class="section-icon">📁</span>
                  <span class="section-title">Already on Secondary</span>
                  <span class="badge badge-muted">{{ filteredAlreadyExists.length }} {{ isEpisodeRun() ? 'Episodes' : 'Items' }}</span>
                  <span class="badge badge-secondary" *ngIf="isEpisodeRun() && filteredAlreadyExists.length">
                    {{ getShowsCount(filteredAlreadyExists) }} Shows ({{ getSeasonsCount(filteredAlreadyExists) }} Seasons)
                  </span>
                </div>
                <span class="summary-hint">Secondary instance has its own separate downloaded file</span>
              </summary>
              <div class="section-content">
                <div *ngIf="filteredAlreadyExists.length === 0" class="section-empty">
                  No secondary duplicate files found{{ modalSearchQuery ? ' matching your filter' : '' }}.
                </div>

                <!-- Grouped View -->
                <ng-container *ngIf="isEpisodeRun() && reportViewMode === 'grouped'">
                  <div *ngFor="let group of groupItemsByShow(filteredAlreadyExists)" class="show-group-card">
                    <div class="show-group-header" (click)="toggleShowExpanded('existsChild', group.showTitle)">
                      <div class="flex-align-center gap-sm flex-wrap">
                        <span class="show-group-title">{{ group.showTitle }}</span>
                        <span class="badge badge-sonarr">SERIES</span>
                        <span class="badge badge-muted">{{ group.totalEpisodes }} On Secondary</span>
                        <span class="badge badge-secondary">{{ group.seasons.length }} {{ group.seasons.length === 1 ? 'Season' : 'Seasons' }}</span>
                      </div>
                      <span class="dropdown-chevron">{{ isShowExpanded('existsChild', group.showTitle) ? '▲' : '▼' }}</span>
                    </div>

                    <div class="show-group-content" *ngIf="isShowExpanded('existsChild', group.showTitle)">
                      <div *ngFor="let season of group.seasons" class="season-group-block">
                        <div class="season-group-header">
                          <span>Season {{ season.seasonNumber }}</span>
                          <span class="badge badge-muted">{{ season.episodes.length }} Episodes</span>
                        </div>
                        <div class="season-episodes-list">
                          <div *ngFor="let item of season.episodes" class="item-row">
                            <div class="item-header">
                              <span class="item-title-text">{{ item.mediaTitle }}</span>
                              <span class="badge badge-muted">Independent Copy</span>
                            </div>
                            <div class="item-reason">{{ item.details }}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </ng-container>

                <!-- Flat View -->
                <ng-container *ngIf="!isEpisodeRun() || reportViewMode === 'flat'">
                  <div *ngFor="let item of filteredAlreadyExists" class="item-row">
                    <div class="item-header">
                      <div class="item-title-group">
                        <span class="item-title-text">{{ item.mediaTitle }}</span>
                        <span class="badge" [ngClass]="item.mediaType === 'movie' ? 'badge-radarr' : 'badge-sonarr'">
                          {{ item.mediaType | uppercase }}
                        </span>
                      </div>
                      <span class="badge badge-muted">Independent Copy</span>
                    </div>
                    <div class="item-reason">{{ item.details }}</div>
                  </div>
                </ng-container>
              </div>
            </details>

            <!-- SECTION 5: Errors -->
            <details class="report-section" [open]="filteredErrors.length > 0">
              <summary class="report-summary">
                <div class="summary-left">
                  <span class="section-icon">⚠️</span>
                  <span class="section-title">Errors Encountered</span>
                  <span class="badge badge-danger">{{ filteredErrors.length }} {{ filteredErrors.length === 1 ? 'Error' : 'Errors' }}</span>
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
                      <span class="path-tag">FILE:</span> <code>{{ item.sourcePath }}</code>
                    </div>
                  </div>
                </div>
              </div>
            </details>

            <!-- SECTION 6: Raw Logs Stream for this Run -->
            <details class="report-section" [open]="selectedRunDetail.items.length > 0">
              <summary class="report-summary">
                <div class="summary-left">
                  <span class="section-icon">📜</span>
                  <span class="section-title">Raw Execution Logs</span>
                  <span class="badge badge-muted">{{ filteredLogs.length }} Entries</span>
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
                    <span class="badge badge-log-tag" [ngClass]="getActionBadgeClass(log.action)">
                      {{ getActionLabel(log.action) }}
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
  isModalLoading = false;
  selectedRunDetail: SyncRunDetail | null = null;
  modalSearchQuery = '';
  reportViewMode: 'grouped' | 'flat' = 'grouped';
  expandedShows = new Set<string>();

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
    this.isModalLoading = true;
    // Instantly initialize with available run summary so modal appears with zero delay
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

    this.api.getSyncRunDetail(run.id).subscribe({
      next: (detail: SyncRunDetail) => {
        this.selectedRunDetail = detail;
        this.isModalLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isModalLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  closeRunModal() {
    this.showRunModal = false;
    this.isModalLoading = false;
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

  get filteredAlreadyLinked(): SyncHistoryEntry[] {
    const list = this.selectedRunDetail?.categorized?.alreadyLinked || [];
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

  isEpisodeRun(): boolean {
    if (!this.selectedRunDetail) return false;
    return (
      this.selectedRunDetail.run.syncProfile?.mainInstance?.type === 'sonarr' ||
      this.selectedRunDetail.items.some(i => i.mediaType === 'episode')
    );
  }

  getBreakdownText(items?: SyncHistoryEntry[]): string {
    if (!items || items.length === 0) return '';
    const isEpisode = items.some(i => i.mediaType === 'episode') || this.isEpisodeRun();
    if (!isEpisode) {
      return `${items.length} ${items.length === 1 ? 'movie' : 'movies'}`;
    }

    const shows = new Set<string>();
    const seasons = new Set<string>();
    for (const item of items) {
      const show = item.mediaTitle.replace(/\s+S\d+E\d+.*$/i, '').trim() || item.mediaTitle;
      const seasonMatch = item.mediaTitle.match(/S(\d+)/i);
      const seasonNum = seasonMatch ? parseInt(seasonMatch[1], 10) : 1;
      shows.add(show);
      seasons.add(`${show}_S${seasonNum}`);
    }

    const epCount = items.length;
    const showCount = shows.size;
    const seasonCount = seasons.size;

    return `${epCount.toLocaleString()} ${epCount === 1 ? 'episode' : 'episodes'} across ${showCount} ${showCount === 1 ? 'show' : 'shows'} (${seasonCount} ${seasonCount === 1 ? 'season' : 'seasons'})`;
  }

  getShowsCount(items?: SyncHistoryEntry[]): number {
    if (!items || items.length === 0) return 0;
    const shows = new Set<string>();
    for (const item of items) {
      const show = item.mediaTitle.replace(/\s+S\d+E\d+.*$/i, '').trim() || item.mediaTitle;
      shows.add(show);
    }
    return shows.size;
  }

  getSeasonsCount(items?: SyncHistoryEntry[]): number {
    if (!items || items.length === 0) return 0;
    const seasons = new Set<string>();
    for (const item of items) {
      const show = item.mediaTitle.replace(/\s+S\d+E\d+.*$/i, '').trim() || item.mediaTitle;
      const seasonMatch = item.mediaTitle.match(/S(\d+)/i);
      const seasonNum = seasonMatch ? parseInt(seasonMatch[1], 10) : 1;
      seasons.add(`${show}_S${seasonNum}`);
    }
    return seasons.size;
  }

  groupItemsByShow(items?: SyncHistoryEntry[]): Array<{
    showTitle: string;
    externalId: string;
    totalEpisodes: number;
    seasons: Array<{
      seasonNumber: number;
      episodes: SyncHistoryEntry[];
    }>;
    sampleItem: SyncHistoryEntry;
  }> {
    if (!items || items.length === 0) return [];
    const map = new Map<string, {
      showTitle: string;
      externalId: string;
      seasonsMap: Map<number, SyncHistoryEntry[]>;
      sampleItem: SyncHistoryEntry;
    }>();

    for (const item of items) {
      const showTitle = item.mediaTitle.replace(/\s+S\d+E\d+.*$/i, '').trim() || item.mediaTitle;
      const key = `${showTitle}_${item.externalId || ''}`;

      if (!map.has(key)) {
        map.set(key, {
          showTitle,
          externalId: item.externalId,
          seasonsMap: new Map<number, SyncHistoryEntry[]>(),
          sampleItem: item,
        });
      }

      const group = map.get(key)!;
      const seasonMatch = item.mediaTitle.match(/S(\d+)/i);
      const seasonNum = seasonMatch ? parseInt(seasonMatch[1], 10) : 1;
      if (!group.seasonsMap.has(seasonNum)) {
        group.seasonsMap.set(seasonNum, []);
      }
      group.seasonsMap.get(seasonNum)!.push(item);
    }

    const result: Array<{
      showTitle: string;
      externalId: string;
      totalEpisodes: number;
      seasons: Array<{
        seasonNumber: number;
        episodes: SyncHistoryEntry[];
      }>;
      sampleItem: SyncHistoryEntry;
    }> = [];

    for (const g of map.values()) {
      const seasons = Array.from(g.seasonsMap.entries())
        .map(([seasonNumber, episodes]) => {
          episodes.sort((a, b) => {
            const epA = a.mediaTitle.match(/E(\d+)/i);
            const epB = b.mediaTitle.match(/E(\d+)/i);
            const numA = epA ? parseInt(epA[1], 10) : 0;
            const numB = epB ? parseInt(epB[1], 10) : 0;
            return numA - numB;
          });
          return { seasonNumber, episodes };
        })
        .sort((a, b) => a.seasonNumber - b.seasonNumber);

      const totalEpisodes = seasons.reduce((acc, s) => acc + s.episodes.length, 0);
      result.push({
        showTitle: g.showTitle,
        externalId: g.externalId,
        totalEpisodes,
        seasons,
        sampleItem: g.sampleItem,
      });
    }

    return result.sort((a, b) => a.showTitle.localeCompare(b.showTitle));
  }

  toggleShowExpanded(section: string, showKey: string) {
    const fullKey = `${section}_${showKey}`;
    if (this.expandedShows.has(fullKey)) {
      this.expandedShows.delete(fullKey);
    } else {
      this.expandedShows.add(fullKey);
    }
  }

  isShowExpanded(section: string, showKey: string): boolean {
    return this.expandedShows.has(`${section}_${showKey}`);
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

  getActionLabel(action: string): string {
    switch (action) {
      case 'linked': return '🔗 Hardlinked';
      case 'already_linked': return '🔗 Already Linked';
      case 'search_triggered': return '🔍 Search Triggered';
      case 'needs_download': return '📥 Needs Download';
      case 'already_exists_child': return '📁 Already on Child';
      case 'would_link': return '🔗 Would Link';
      case 'added': return '➕ Added to Child';
      case 'season_monitored': return '📺 Season Monitored';
      case 'skipped': return '⏭️ Skipped';
      case 'error': return '⚠️ Error';
      default: return action ? action.replace(/_/g, ' ').toUpperCase() : '—';
    }
  }

  getActionBadgeClass(action: string): string {
    switch (action) {
      case 'linked':
      case 'would_link':
      case 'added':
        return 'badge-success';
      case 'search_triggered':
      case 'needs_download':
        return 'badge-info';
      case 'season_monitored':
        return 'badge-warning';
      case 'error':
        return 'badge-danger';
      case 'already_linked':
      case 'already_exists_child':
      case 'skipped':
      default:
        return 'badge-muted';
    }
  }
}

