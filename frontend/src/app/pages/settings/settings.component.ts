import { Component, OnInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { Instance, SyncProfile, Settings, DryRunReport, DryRunItem } from '../../core/models';
import { InstanceFormComponent } from '../../components/instance-form/instance-form.component';
import { PathBrowserComponent } from '../../components/path-browser/path-browser.component';
import { InstanceSelectComponent } from '../../components/instance-select/instance-select.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, InstanceFormComponent, PathBrowserComponent, InstanceSelectComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Settings & Configuration</h1>
        <p class="page-subtitle">Manage your connected *arr instances, sync profile rules, and sync intervals</p>
      </div>
    </div>

    <!-- Connected Instances Card -->
    <div class="card mb-xl">
      <div class="flex-between mb-lg">
        <h3 class="text-semibold text-lg">Connected Instances ({{ instances.length }})</h3>
        <button class="btn btn-primary btn-sm" (click)="openAddInstance()" *ngIf="!showAddForm" id="add-instance-btn">
          + Add Instance
        </button>
      </div>

      <!-- Add / Edit Form -->
      <app-instance-form
        *ngIf="showAddForm"
        [instance]="editingInstance"
        [showCancel]="true"
        (saved)="onInstanceSaved($event)"
        (cancel)="cancelInstanceForm()"
      ></app-instance-form>

      <!-- Loading State -->
      <div *ngIf="isLoading" class="loading-center">
        <span class="spinner spinner-lg"></span>
      </div>

      <!-- Empty State -->
      <div *ngIf="!isLoading && instances.length === 0 && !showAddForm" class="empty-state empty-state-compact">
        <p class="empty-state-text">No instances configured yet.</p>
        <button class="btn btn-primary" (click)="openAddInstance()">Add Your First Instance</button>
      </div>

      <!-- Instance List -->
      <div class="instance-list" *ngIf="!isLoading && instances.length > 0 && !showAddForm">
        <div class="instance-item" *ngFor="let inst of instances">
          <div class="instance-item-info">
            <div class="instance-item-icon-transparent">
              <img [src]="inst.type === 'radarr' ? 'radarr.svg' : 'sonarr.svg'" [alt]="inst.type" class="instance-logo-md" />
            </div>
            <div>
              <div class="flex-align-center gap-sm flex-wrap">
                <span class="text-semibold text-base">{{ inst.name }}</span>
                <span *ngIf="inst.isMain" class="badge badge-success">Source of Truth</span>
                <span class="badge badge-muted">{{ (inst.language || 'en') | uppercase }}</span>
              </div>
              <div class="text-xs text-muted mt-xs">{{ inst.url }}</div>
              <div class="text-xs text-muted" *ngIf="inst.rootFolderPath">Root: {{ inst.rootFolderPath }}</div>
              <div class="text-xs text-accent" *ngIf="inst.localPath && inst.localPath !== inst.rootFolderPath">Polyarr Mount: {{ inst.localPath }}</div>
            </div>
          </div>

          <div class="instance-item-actions">
            <button class="btn btn-primary btn-sm" (click)="scanInstance(inst)" [disabled]="isScanning(inst.id)">
              {{ isScanning(inst.id) ? 'Scanning...' : 'Scan' }}
            </button>
            <button class="btn btn-ghost btn-sm" (click)="testInstance(inst)" [disabled]="isTesting(inst.id)">
              {{ isTesting(inst.id) ? 'Testing...' : 'Test' }}
            </button>
            <button class="btn btn-ghost btn-sm" (click)="editInstance(inst)">
              Edit
            </button>
            <button class="btn btn-ghost btn-sm text-danger" (click)="deleteInstance(inst)">
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Sync Profiles Card -->
    <div class="card mb-xl">
      <div class="flex-between mb-lg">
        <h3 class="text-semibold text-lg">Sync Profiles ({{ profiles.length }})</h3>
        <button class="btn btn-primary btn-sm" (click)="openAddProfile()" *ngIf="!showProfileForm">
          + Add Sync Profile
        </button>
      </div>

      <!-- Add / Edit Profile Form -->
      <div *ngIf="showProfileForm" class="settings-subpanel p-lg mb-lg">
        <div class="flex-between mb-md">
          <h4 class="text-semibold">{{ editingProfileId ? 'Edit Sync Rule' : 'Create New Sync Rule' }}</h4>
          <button class="btn btn-ghost btn-sm" (click)="cancelProfileForm()">✕</button>
        </div>
        
        <app-instance-select
          label="Source (Main Instance)"
          [instances]="mainInstances"
          [selectedId]="currentProfile.mainInstanceId"
          (selectedIdChange)="onMainInstanceChange($event)"
          placeholder="Select main source instance..."
          emptyMessage="No main instances configured"
        ></app-instance-select>

        <app-instance-select
          label="Target (Child Instance)"
          [instances]="filteredChildInstances"
          [selectedId]="currentProfile.childInstanceId"
          (selectedIdChange)="currentProfile.childInstanceId = $event"
          placeholder="Select child target instance..."
          [emptyMessage]="'No matching ' + (isSonarrProfile() ? 'Sonarr' : 'Radarr') + ' child instances found'"
        ></app-instance-select>

        <div class="form-group">
          <label class="form-label">Link Strategy</label>
          <select class="form-select" [(ngModel)]="currentProfile.linkType">
            <option value="hardlink">Hardlink (Default — zero extra disk space)</option>
            <option value="symlink">Symlink (Symbolic link)</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Delay Before Child Search (Hours)</label>
          <input class="form-input" type="number" [(ngModel)]="currentProfile.delayHours" min="0" max="720" />
          <p class="form-hint">
            Hours to wait before triggering a fallback search on the child instance. Gives the parent instance time to download and import its multi-audio file first. If multi-audio is detected, it is hardlinked immediately with zero delay.
          </p>
        </div>

        <!-- Consistent Modern Switch Controls -->
        <div class="flex-col gap-sm mt-md">
          <div class="switch-setting-row">
            <div>
              <div class="switch-setting-label">Enable Active Scanning & Syncing</div>
              <div class="switch-setting-desc">Include this profile in automated background syncs, library scans, and webhook imports</div>
            </div>
            <label class="switch">
              <input type="checkbox" [(ngModel)]="currentProfile.enabled">
              <span class="switch-slider"></span>
            </label>
          </div>

          <div class="switch-setting-row">
            <div>
              <div class="switch-setting-label">Auto-Search Missing Audio</div>
              <div class="switch-setting-desc">Automatically search indexers for secondary audio if missing on main. When off, missing audio items are ignored (no-op) and only matching files are linked.</div>
            </div>
            <label class="switch">
              <input type="checkbox" [(ngModel)]="currentProfile.searchIfMissing">
              <span class="switch-slider"></span>
            </label>
          </div>

          <div *ngIf="isSonarrProfile()" class="switch-setting-row">
            <div>
              <div class="switch-setting-label">Sync Monitored Seasons</div>
              <div class="switch-setting-desc">Keep season monitor status synchronized across Sonarr instances (Sonarr only)</div>
            </div>
            <label class="switch">
              <input type="checkbox" [(ngModel)]="currentProfile.syncMonitoredSeasons">
              <span class="switch-slider"></span>
            </label>
          </div>
        </div>

        <!-- Optional Advanced Path Overrides -->
        <div class="settings-subpanel">
          <div class="flex-between cursor-pointer" (click)="showProfilePathOverrides = !showProfilePathOverrides">
            <span class="text-sm text-semibold text-secondary">
              ⚙️ Path Overrides (Optional)
            </span>
            <span class="text-xs text-accent">{{ showProfilePathOverrides ? '▲ Hide' : '▼ Expand' }}</span>
          </div>
          
          <div *ngIf="showProfilePathOverrides" class="flex-col gap-md mt-md">
            <app-path-browser
              label="Source Media Path Override (Main)"
              [currentPath]="currentProfile.mainPath || ''"
              (currentPathChange)="currentProfile.mainPath = $event"
              placeholder="Leave blank to use instance default"
              hint="Only customize if this sync profile requires a custom source root folder."
            ></app-path-browser>

            <app-path-browser
              label="Target Media Path Override (Child)"
              [currentPath]="currentProfile.childPath || ''"
              (currentPathChange)="currentProfile.childPath = $event"
              placeholder="Leave blank to use instance default"
              hint="Only customize if this sync profile requires a custom target root folder."
            ></app-path-browser>
          </div>
        </div>

        <div class="flex-end gap-sm mt-lg">
          <button class="btn btn-ghost" (click)="cancelProfileForm()">Cancel</button>
          <button class="btn btn-primary" (click)="saveProfile()">
            {{ editingProfileId ? 'Update Profile' : 'Create Profile' }}
          </button>
        </div>
      </div>

      <!-- Profile List -->
      <div *ngIf="!isLoading && profiles.length === 0 && !showProfileForm" class="empty-state empty-state-compact">
        <p class="empty-state-text">No sync profiles configured. Create one to link main and child instances.</p>
      </div>

      <div class="instance-list" *ngIf="!isLoading && profiles.length > 0">
        <div class="instance-item" *ngFor="let profile of profiles">
          <div class="instance-item-info">
            <div class="instance-item-icon instance-item-icon-sync">
              🔄
            </div>
            <div>
              <div class="profile-title-row">
                <span class="profile-title-text">
                  {{ profile.mainInstance?.name || 'Main' }} ➔ {{ profile.childInstance?.name || 'Child' }}
                </span>
                <span class="badge" [ngClass]="profile.enabled ? 'badge-success' : 'badge-muted'">
                  {{ profile.enabled ? '✓ Active' : '⏸ Paused' }}
                </span>
              </div>
              <div class="profile-meta-text">
                Strategy: {{ (profile.linkType || 'hardlink') | titlecase }} &bull; Delay: {{ profile.delayHours }}h &bull; Search: {{ profile.searchIfMissing ? 'Enabled' : 'Disabled' }}
              </div>
            </div>
          </div>

          <div class="instance-item-actions">
            <!-- Quick Enable/Disable Switch -->
            <label class="switch" title="Toggle active sync / scan">
              <input type="checkbox" [checked]="profile.enabled" (change)="toggleProfileEnabled(profile)">
              <span class="switch-slider"></span>
            </label>

            <!-- Dry Run Button -->
            <button 
              class="btn btn-secondary btn-sm btn-action-dryrun" 
              (click)="runDryRun(profile)"
              [disabled]="runningDryRunId === profile.id"
              title="Simulate sync without making any changes"
            >
              <span *ngIf="runningDryRunId === profile.id" class="spinner btn-spinner"></span>
              <span *ngIf="runningDryRunId !== profile.id">🧪</span>
              {{ runningDryRunId === profile.id ? 'Simulating...' : 'Dry Run' }}
            </button>

            <!-- Run Sync Button -->
            <button 
              class="btn btn-secondary btn-sm btn-action-sync" 
              (click)="onRunSyncClick(profile)" 
              [disabled]="isSyncing(profile.id)"
              title="Execute manual sync now"
            >
              <span *ngIf="isSyncing(profile.id)" class="spinner btn-spinner"></span>
              <span *ngIf="!isSyncing(profile.id)">⚡</span>
              {{ isSyncing(profile.id) ? 'Syncing...' : 'Run Sync' }}
            </button>

            <button class="btn btn-ghost btn-sm" (click)="editProfile(profile)">
              Edit
            </button>
            <button class="btn btn-ghost btn-sm btn-action-delete" (click)="deleteProfile(profile.id)">
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Global App Settings Card -->
    <div class="card">
      <h3 class="card-section-title">Global Settings</h3>

      <div class="form-group">
        <label class="form-label">Background Sync Interval (minutes)</label>
        <input class="form-input input-narrow" type="number" [(ngModel)]="settings.syncIntervalMinutes" min="5" max="1440" />
      </div>

      <div class="form-group">
        <label class="form-label">Default Delay Before Child Search (Hours)</label>
        <input class="form-input input-narrow" type="number" [(ngModel)]="settings.defaultDelayHours" min="0" max="720" />
        <p class="form-hint">
          Default wait time (in hours) before child instances initiate fallback indexer searches. Multi-audio hardlinks are always created immediately.
        </p>
      </div>

      <div class="form-group">
        <label class="form-label">Default Linking Method</label>
        <select class="form-select input-narrow" [(ngModel)]="settings.defaultLinkType">
          <option value="hardlink">Hardlink</option>
          <option value="symlink">Symlink</option>
        </select>
      </div>

      <button class="btn btn-primary btn-sm btn-save-settings" (click)="saveSettings()">
        Save Settings
      </button>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════
         FULL-SCREEN / LARGE DRY RUN REPORT MODAL
         ═══════════════════════════════════════════════════════════════ -->
    <div *ngIf="showDryRunModal && dryRunReport" class="dry-run-overlay" (click)="onBackdropClick($event)">
      <div class="dry-run-modal card" (click)="$event.stopPropagation()">
        
        <!-- Modal Header -->
        <div class="dry-run-header">
          <div>
            <div class="dry-run-header-title">
              <span class="dry-run-header-icon">🧪</span>
              <h2 class="dry-run-header-h2">
                Dry Run Sync Analysis Report
              </h2>
              <span class="badge badge-info">{{ dryRunReport.linkType | uppercase }}</span>
              <span class="badge badge-success">Target: {{ dryRunReport.targetLanguage | uppercase }}</span>
            </div>
            <p class="dry-run-header-sub">
              Simulation for <strong class="text-primary-emphasis">{{ dryRunReport.profileName }}</strong> &bull; 
              Generated at {{ dryRunReport.generatedAt | date:'mediumTime' }} &bull; 
              <span class="text-success-info">0 file system or library changes made</span>
            </p>
          </div>

          <div class="dry-run-header-actions">
            <button 
              class="btn btn-secondary btn-sm" 
              (click)="reRunCurrentDryRun()" 
              [disabled]="runningDryRunId === dryRunReport.profileId"
            >
              <span *ngIf="runningDryRunId === dryRunReport.profileId" class="spinner btn-spinner"></span>
              🔄 Re-run
            </button>
            <button class="btn btn-ghost btn-sm btn-close-modal" (click)="closeDryRunModal()">
              ✕
            </button>
          </div>
        </div>

        <!-- Modal Body Scrollable -->
        <div class="dry-run-body">
          
          <!-- Summary Metrics Cards Grid (4 Media Categories) -->
          <div class="dry-run-stats-grid">
            
            <!-- 1. Ready to Hardlink -->
            <div class="stat-card stat-card-would-link">
              <div class="stat-icon stat-icon-would-link">🔗</div>
              <div class="stat-content">
                <div class="stat-number stat-num-would-link">{{ dryRunReport.summary.wouldLinkCount }}</div>
                <div class="stat-label">Ready to Hardlink</div>
                <div class="stat-sub stat-sub-highlight" *ngIf="isEpisodeReport() && dryRunReport.wouldLink.length">{{ getBreakdownText(dryRunReport.wouldLink) }}</div>
                <div class="stat-sub">Has target audio; instant / 0 space</div>
              </div>
            </div>

            <!-- 2. Needs Download on Secondary -->
            <div class="stat-card stat-card-needs-download">
              <div class="stat-icon stat-icon-needs-download">📥</div>
              <div class="stat-content">
                <div class="stat-number stat-num-needs-download">{{ dryRunReport.summary.needsDownloadCount }}</div>
                <div class="stat-label">Needs Download</div>
                <div class="stat-sub stat-sub-highlight" *ngIf="isEpisodeReport() && dryRunReport.needsDownload.length">{{ getBreakdownText(dryRunReport.needsDownload) }}</div>
                <div class="stat-sub">Lacks target audio; secondary downloads</div>
              </div>
            </div>

            <!-- 3. Already Hardlinked -->
            <div class="stat-card stat-card-already-linked">
              <div class="stat-icon stat-icon-already-linked">✅</div>
              <div class="stat-content">
                <div class="stat-number stat-num-already-linked">{{ dryRunReport.summary.alreadyLinkedCount }}</div>
                <div class="stat-label">Already Hardlinked</div>
                <div class="stat-sub stat-sub-highlight" *ngIf="isEpisodeReport() && dryRunReport.alreadyLinked.length">{{ getBreakdownText(dryRunReport.alreadyLinked) }}</div>
                <div class="stat-sub">Link verified on disk</div>
              </div>
            </div>

            <!-- 4. Already on Secondary (Own File) -->
            <div class="stat-card stat-card-already-exists">
              <div class="stat-icon stat-icon-already-exists">📁</div>
              <div class="stat-content">
                <div class="stat-number stat-num-already-exists">{{ dryRunReport.summary.alreadyExistsChildCount }}</div>
                <div class="stat-label">Already on Secondary</div>
                <div class="stat-sub stat-sub-highlight" *ngIf="isEpisodeReport() && dryRunReport.alreadyExistsChild.length">{{ getBreakdownText(dryRunReport.alreadyExistsChild) }}</div>
                <div class="stat-sub">Secondary has its own copy</div>
              </div>
            </div>
          </div>

          <!-- Slim Status & Errors Summary Bar -->
          <div class="dry-run-status-bar" [class.has-errors]="dryRunReport.summary.errorCount > 0">
            <div class="status-bar-item">
              <span>📊 Total Scanned: <strong>{{ dryRunReport.summary.totalScanned.toLocaleString() }}</strong></span>
              <span class="status-divider">•</span>
              <span *ngIf="dryRunReport.summary.errorCount === 0" class="text-muted">✅ 0 Inspection Errors</span>
              <span *ngIf="dryRunReport.summary.errorCount > 0" class="text-danger font-semibold">⚠️ {{ dryRunReport.summary.errorCount }} System / Inspection Errors</span>
            </div>
            <div class="status-bar-item text-xs text-muted" *ngIf="isEpisodeReport()">
              <span>{{ isEpisodeReport() ? 'Grouped by TV Series & Season' : 'Movie Library' }}</span>
            </div>
          </div>

          <!-- Report Search Filter Bar & View Toggle -->
          <div class="filter-bar flex-between flex-wrap gap-sm">
            <div class="filter-input-wrap">
              <span class="filter-search-icon">🔍</span>
              <input 
                class="form-input filter-input" 
                type="text" 
                [(ngModel)]="searchQuery" 
                placeholder="Filter results in this report by title, path, or reason..."
              />
            </div>
            
            <div class="view-mode-toggle" *ngIf="isEpisodeReport()">
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

            <button *ngIf="searchQuery" class="btn btn-ghost btn-sm" (click)="searchQuery = ''">
              Clear Filter
            </button>
          </div>

          <!-- ═══════════════════════════════════════════════════════════
               COLLAPSIBLE DETAILS LISTS
               ═══════════════════════════════════════════════════════════ -->
          <div class="dry-run-sections">
            
            <!-- SECTION 1: READY TO HARDLINK -->
            <details class="report-section" [open]="filterList(dryRunReport.wouldLink).length > 0">
              <summary class="report-summary">
                <div class="summary-left">
                  <span class="section-icon">🔗</span>
                  <span class="section-title">Items Ready to Hardlink (Has Target Audio)</span>
                  <span class="badge badge-info">{{ filterList(dryRunReport.wouldLink).length }} {{ isEpisodeReport() ? 'Episodes' : 'Items' }}</span>
                  <span class="badge badge-secondary" *ngIf="isEpisodeReport() && filterList(dryRunReport.wouldLink).length">
                    {{ getShowsCount(filterList(dryRunReport.wouldLink)) }} Shows ({{ getSeasonsCount(filterList(dryRunReport.wouldLink)) }} Seasons)
                  </span>
                </div>
                <span class="summary-hint">Main file contains {{ dryRunReport.targetLanguage | uppercase }} audio; will be hardlinked (zero extra space)</span>
              </summary>
              
              <div class="section-content">
                <div *ngIf="filterList(dryRunReport.wouldLink).length === 0" class="section-empty">
                  No items in this category{{ searchQuery ? ' matching your filter' : '' }}.
                </div>

                <!-- Grouped View -->
                <ng-container *ngIf="isEpisodeReport() && reportViewMode === 'grouped'">
                  <div *ngFor="let group of groupItemsByShow(filterList(dryRunReport.wouldLink))" class="show-group-card">
                    <div class="show-group-header" (click)="toggleShowExpanded('wouldLink', group.showTitle)">
                      <div class="flex-align-center gap-sm flex-wrap">
                        <span class="show-group-title">{{ group.showTitle }}</span>
                        <span *ngIf="group.year" class="item-year-text">({{ group.year }})</span>
                        <span class="badge badge-sonarr">SERIES</span>
                        <span class="badge badge-info">{{ group.totalEpisodes }} Ready to Link</span>
                        <span class="badge badge-secondary">{{ group.seasons.length }} {{ group.seasons.length === 1 ? 'Season' : 'Seasons' }}</span>
                      </div>
                      <span class="dropdown-chevron">{{ isShowExpanded('wouldLink', group.showTitle) ? '▲' : '▼' }}</span>
                    </div>

                    <div class="show-group-content" *ngIf="isShowExpanded('wouldLink', group.showTitle)">
                      <div *ngFor="let season of group.seasons" class="season-group-block">
                        <div class="season-group-header">
                          <span>Season {{ season.seasonNumber }}</span>
                          <span class="badge badge-muted">{{ season.episodes.length }} Episodes</span>
                        </div>
                        <div class="season-episodes-list">
                          <div *ngFor="let item of season.episodes" class="item-row">
                            <div class="item-header">
                              <div class="item-title-group">
                                <span class="item-title-text">{{ item.title }}</span>
                                <span *ngIf="item.languagesDetected && item.languagesDetected.length" class="badge badge-success">
                                  Audio: {{ item.languagesDetected.join(', ') | uppercase }}
                                </span>
                              </div>
                              <span class="badge badge-info">Will Hardlink</span>
                            </div>
                            <div class="item-paths" *ngIf="item.sourcePath">
                              <div class="path-line">
                                <span class="path-tag">SOURCE:</span> <code>{{ item.sourcePath }}</code>
                              </div>
                              <div class="path-line" *ngIf="item.destinationPath">
                                <span class="path-tag">TARGET:</span> <code>{{ item.destinationPath }}</code>
                              </div>
                            </div>
                            <div class="item-reason">{{ item.reason }}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </ng-container>

                <!-- Flat View -->
                <ng-container *ngIf="!isEpisodeReport() || reportViewMode === 'flat'">
                  <div *ngFor="let item of filterList(dryRunReport.wouldLink)" class="item-row">
                    <div class="item-header">
                      <div class="item-title-group">
                        <span class="item-title-text">
                          {{ item.title }} <span *ngIf="item.year" class="item-year-text">({{ item.year }})</span>
                        </span>
                        <span class="badge" [ngClass]="item.mediaType === 'movie' ? 'badge-radarr' : 'badge-sonarr'">
                          {{ item.mediaType | uppercase }}
                        </span>
                        <span *ngIf="item.languagesDetected && item.languagesDetected.length" class="badge badge-success">
                          Audio: {{ item.languagesDetected.join(', ') | uppercase }}
                        </span>
                      </div>
                      <span class="badge badge-info">Will Hardlink</span>
                    </div>

                    <div class="item-paths" *ngIf="item.sourcePath">
                      <div class="path-line">
                        <span class="path-tag">SOURCE:</span> <code>{{ item.sourcePath }}</code>
                      </div>
                      <div class="path-line" *ngIf="item.destinationPath">
                        <span class="path-tag">TARGET:</span> <code>{{ item.destinationPath }}</code>
                      </div>
                    </div>

                    <div class="item-reason">{{ item.reason }}</div>
                  </div>
                </ng-container>
              </div>
            </details>

            <!-- SECTION 2: NEEDS SECONDARY DOWNLOAD -->
            <details class="report-section" [open]="filterList(dryRunReport.needsDownload).length > 0">
              <summary class="report-summary">
                <div class="summary-left">
                  <span class="section-icon">📥</span>
                  <span class="section-title">Items to Download Separately on Secondary (Missing Target Audio)</span>
                  <span class="badge badge-warning">{{ filterList(dryRunReport.needsDownload).length }} {{ isEpisodeReport() ? 'Episodes' : 'Items' }}</span>
                  <span class="badge badge-secondary" *ngIf="isEpisodeReport() && filterList(dryRunReport.needsDownload).length">
                    {{ getShowsCount(filterList(dryRunReport.needsDownload)) }} Shows ({{ getSeasonsCount(filterList(dryRunReport.needsDownload)) }} Seasons)
                  </span>
                </div>
                <span class="summary-hint">Main file lacks {{ dryRunReport.targetLanguage | uppercase }} audio; secondary *arr will download its own copy</span>
              </summary>
              
              <div class="section-content">
                <div *ngIf="filterList(dryRunReport.needsDownload).length === 0" class="section-empty">
                  No items in this category{{ searchQuery ? ' matching your filter' : '' }}.
                </div>

                <!-- Grouped View -->
                <ng-container *ngIf="isEpisodeReport() && reportViewMode === 'grouped'">
                  <div *ngFor="let group of groupItemsByShow(filterList(dryRunReport.needsDownload))" class="show-group-card">
                    <div class="show-group-header" (click)="toggleShowExpanded('needsDownload', group.showTitle)">
                      <div class="flex-align-center gap-sm flex-wrap">
                        <span class="show-group-title">{{ group.showTitle }}</span>
                        <span *ngIf="group.year" class="item-year-text">({{ group.year }})</span>
                        <span class="badge badge-sonarr">SERIES</span>
                        <span class="badge badge-warning">{{ group.totalEpisodes }} Missing</span>
                        <span class="badge badge-secondary">{{ group.seasons.length }} {{ group.seasons.length === 1 ? 'Season' : 'Seasons' }}</span>
                      </div>
                      <span class="dropdown-chevron">{{ isShowExpanded('needsDownload', group.showTitle) ? '▲' : '▼' }}</span>
                    </div>

                    <div class="show-group-content" *ngIf="isShowExpanded('needsDownload', group.showTitle)">
                      <div *ngFor="let season of group.seasons" class="season-group-block">
                        <div class="season-group-header">
                          <span>Season {{ season.seasonNumber }}</span>
                          <span class="badge badge-muted">{{ season.episodes.length }} Episodes</span>
                        </div>
                        <div class="season-episodes-list">
                          <div *ngFor="let item of season.episodes" class="item-row">
                            <div class="item-header">
                              <div class="item-title-group">
                                <span class="item-title-text">{{ item.title }}</span>
                                <span *ngIf="item.languagesDetected && item.languagesDetected.length" class="badge badge-success">
                                  Audio: {{ item.languagesDetected.join(', ') | uppercase }}
                                </span>
                              </div>
                              <span 
                                class="badge" 
                                [ngClass]="item.searchEnabled ? 'badge-warning' : 'badge-muted'"
                              >
                                {{ item.searchEnabled ? '🔍 Auto-Search On' : '⏸ Monitored (Auto-Search Off)' }}
                              </span>
                            </div>
                            <div class="item-paths" *ngIf="item.sourcePath">
                              <div class="path-line">
                                <span class="path-tag">SOURCE:</span> <code>{{ item.sourcePath }}</code>
                              </div>
                            </div>
                            <div class="item-reason">{{ item.reason }}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </ng-container>

                <!-- Flat View -->
                <ng-container *ngIf="!isEpisodeReport() || reportViewMode === 'flat'">
                  <div *ngFor="let item of filterList(dryRunReport.needsDownload)" class="item-row">
                    <div class="item-header">
                      <div class="item-title-group">
                        <span class="item-title-text">
                          {{ item.title }} <span *ngIf="item.year" class="item-year-text">({{ item.year }})</span>
                        </span>
                        <span class="badge" [ngClass]="item.mediaType === 'movie' ? 'badge-radarr' : 'badge-sonarr'">
                          {{ item.mediaType | uppercase }}
                        </span>
                      </div>
                      <span 
                        class="badge" 
                        [ngClass]="item.searchEnabled ? 'badge-warning' : 'badge-muted'"
                      >
                        {{ item.searchEnabled ? '🔍 Auto-Search On' : '⏸ Monitored (Auto-Search Off)' }}
                      </span>
                    </div>

                    <div class="item-reason">{{ item.reason }}</div>
                  </div>
                </ng-container>
              </div>
            </details>

            <!-- SECTION 3: ALREADY LINKED ON DISK -->
            <details class="report-section">
              <summary class="report-summary">
                <div class="summary-left">
                  <span class="section-icon">✅</span>
                  <span class="section-title">Already Hardlinked on Disk (No Action Needed)</span>
                  <span class="badge badge-muted">{{ filterList(dryRunReport.alreadyLinked).length }} {{ isEpisodeReport() ? 'Episodes' : 'Items' }}</span>
                  <span class="badge badge-secondary" *ngIf="isEpisodeReport() && filterList(dryRunReport.alreadyLinked).length">
                    {{ getShowsCount(filterList(dryRunReport.alreadyLinked)) }} Shows ({{ getSeasonsCount(filterList(dryRunReport.alreadyLinked)) }} Seasons)
                  </span>
                </div>
                <span class="summary-hint">Hardlink or symlink is already verified and intact at destination</span>
              </summary>
              
              <div class="section-content">
                <div *ngIf="filterList(dryRunReport.alreadyLinked).length === 0" class="section-empty">
                  No items in this category{{ searchQuery ? ' matching your filter' : '' }}.
                </div>

                <!-- Grouped View -->
                <ng-container *ngIf="isEpisodeReport() && reportViewMode === 'grouped'">
                  <div *ngFor="let group of groupItemsByShow(filterList(dryRunReport.alreadyLinked))" class="show-group-card">
                    <div class="show-group-header" (click)="toggleShowExpanded('alreadyLinked', group.showTitle)">
                      <div class="flex-align-center gap-sm flex-wrap">
                        <span class="show-group-title">{{ group.showTitle }}</span>
                        <span *ngIf="group.year" class="item-year-text">({{ group.year }})</span>
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
                              <span class="item-title-text">{{ item.title }}</span>
                              <span class="badge badge-success">Already Linked</span>
                            </div>
                            <div class="item-paths" *ngIf="item.destinationPath">
                              <div class="path-line">
                                <span class="path-tag">LINK PATH:</span> <code>{{ item.destinationPath }}</code>
                              </div>
                            </div>
                            <div class="item-reason">{{ item.reason }}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </ng-container>

                <!-- Flat View -->
                <ng-container *ngIf="!isEpisodeReport() || reportViewMode === 'flat'">
                  <div *ngFor="let item of filterList(dryRunReport.alreadyLinked)" class="item-row">
                    <div class="item-header">
                      <span class="item-title-text">
                        {{ item.title }} <span *ngIf="item.year" class="item-year-text">({{ item.year }})</span>
                      </span>
                      <span class="badge badge-success">Already Linked</span>
                    </div>
                    <div class="item-paths" *ngIf="item.destinationPath">
                      <div class="path-line">
                        <span class="path-tag">LINK PATH:</span> <code>{{ item.destinationPath }}</code>
                      </div>
                    </div>
                    <div class="item-reason">{{ item.reason }}</div>
                  </div>
                </ng-container>
              </div>
            </details>

            <!-- SECTION 4: ALREADY ON SECONDARY (OWN FILE) -->
            <details class="report-section">
              <summary class="report-summary">
                <div class="summary-left">
                  <span class="section-icon">📁</span>
                  <span class="section-title">Already Downloaded by Secondary (No Link Needed)</span>
                  <span class="badge badge-muted">{{ filterList(dryRunReport.alreadyExistsChild).length }} {{ isEpisodeReport() ? 'Episodes' : 'Items' }}</span>
                  <span class="badge badge-secondary" *ngIf="isEpisodeReport() && filterList(dryRunReport.alreadyExistsChild).length">
                    {{ getShowsCount(filterList(dryRunReport.alreadyExistsChild)) }} Shows ({{ getSeasonsCount(filterList(dryRunReport.alreadyExistsChild)) }} Seasons)
                  </span>
                </div>
                <span class="summary-hint">Secondary instance already possesses its own file; will not be overwritten</span>
              </summary>
              
              <div class="section-content">
                <div *ngIf="filterList(dryRunReport.alreadyExistsChild).length === 0" class="section-empty">
                  No items in this category{{ searchQuery ? ' matching your filter' : '' }}.
                </div>

                <!-- Grouped View -->
                <ng-container *ngIf="isEpisodeReport() && reportViewMode === 'grouped'">
                  <div *ngFor="let group of groupItemsByShow(filterList(dryRunReport.alreadyExistsChild))" class="show-group-card">
                    <div class="show-group-header" (click)="toggleShowExpanded('alreadyExistsChild', group.showTitle)">
                      <div class="flex-align-center gap-sm flex-wrap">
                        <span class="show-group-title">{{ group.showTitle }}</span>
                        <span *ngIf="group.year" class="item-year-text">({{ group.year }})</span>
                        <span class="badge badge-sonarr">SERIES</span>
                        <span class="badge badge-muted">{{ group.totalEpisodes }} Own Copy</span>
                        <span class="badge badge-secondary">{{ group.seasons.length }} {{ group.seasons.length === 1 ? 'Season' : 'Seasons' }}</span>
                      </div>
                      <span class="dropdown-chevron">{{ isShowExpanded('alreadyExistsChild', group.showTitle) ? '▲' : '▼' }}</span>
                    </div>

                    <div class="show-group-content" *ngIf="isShowExpanded('alreadyExistsChild', group.showTitle)">
                      <div *ngFor="let season of group.seasons" class="season-group-block">
                        <div class="season-group-header">
                          <span>Season {{ season.seasonNumber }}</span>
                          <span class="badge badge-muted">{{ season.episodes.length }} Episodes</span>
                        </div>
                        <div class="season-episodes-list">
                          <div *ngFor="let item of season.episodes" class="item-row">
                            <div class="item-header">
                              <span class="item-title-text">{{ item.title }}</span>
                              <span class="badge badge-muted">Independent Copy</span>
                            </div>
                            <div class="item-reason">{{ item.reason }}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </ng-container>

                <!-- Flat View -->
                <ng-container *ngIf="!isEpisodeReport() || reportViewMode === 'flat'">
                  <div *ngFor="let item of filterList(dryRunReport.alreadyExistsChild)" class="item-row">
                    <div class="item-header">
                      <span class="item-title-text">
                        {{ item.title }} <span *ngIf="item.year" class="item-year-text">({{ item.year }})</span>
                      </span>
                      <span class="badge badge-muted">Independent Copy</span>
                    </div>
                    <div class="item-reason">{{ item.reason }}</div>
                  </div>
                </ng-container>
              </div>
            </details>

            <!-- SECTION 5: REAL ERRORS ONLY -->
            <details class="report-section" [open]="dryRunReport.errors.length > 0">
              <summary class="report-summary">
                <div class="summary-left">
                  <span class="section-icon">⚠️</span>
                  <span class="section-title">System & Inspection Errors</span>
                  <span class="badge" [ngClass]="dryRunReport.errors.length > 0 ? 'badge-danger' : 'badge-muted'">
                    {{ filterList(dryRunReport.errors).length }} items
                  </span>
                </div>
                <span class="summary-hint">Actual API failures or disk inspection exceptions (0 in normal conditions)</span>
              </summary>
              
              <div class="section-content">
                <div *ngIf="filterList(dryRunReport.errors).length === 0" class="section-empty">
                  No errors encountered during simulation.
                </div>

                <div *ngFor="let item of filterList(dryRunReport.errors)" class="item-row item-row-error">
                  <div class="item-header">
                    <span class="item-title-text">
                      {{ item.title }} <span *ngIf="item.year" class="item-year-text">({{ item.year }})</span>
                    </span>
                    <span class="badge badge-danger">Error</span>
                  </div>
                  <div class="item-reason item-reason-error">{{ item.reason }}</div>
                </div>
              </div>
            </details>

          </div>

        </div>

        <!-- Modal Footer -->
        <div class="dry-run-footer">
          <div class="dry-run-footer-hint">
            💡 This was a simulation. To perform actual linking, click <strong>"Run Sync"</strong> on the profile.
          </div>
          <button class="btn btn-primary" (click)="closeDryRunModal()">
            Done / Close
          </button>
        </div>

      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════
         PAUSED SYNC CONFIRMATION MODAL
         ═══════════════════════════════════════════════════════════════ -->
    <div *ngIf="showSyncConfirmModal && pendingSyncProfile" class="dry-run-overlay" (click)="closeSyncConfirmModal()">
      <div class="card confirm-modal-card" (click)="$event.stopPropagation()">
        <div class="confirm-modal-header">
          <div class="confirm-modal-icon-badge">
            ⚡
          </div>
          <div>
            <h3 class="confirm-modal-title">Run Manual Sync?</h3>
            <div class="confirm-modal-subtitle">Paused Sync Profile</div>
          </div>
        </div>

        <p class="confirm-modal-text">
          The sync profile <strong class="text-primary-emphasis">{{ pendingSyncProfile.mainInstance?.name || 'Main' }} ➔ {{ pendingSyncProfile.childInstance?.name || 'Child' }}</strong> is currently <span class="badge badge-muted">⏸ Paused</span> for automated background syncing and webhooks.
        </p>
        <p class="confirm-modal-notice">
          ℹ️ Running a manual sync will process your media immediately according to your profile rules without unpausing background automations.
        </p>

        <div class="confirm-modal-actions">
          <button class="btn btn-ghost btn-sm" (click)="closeSyncConfirmModal()">
            Cancel
          </button>
          <button class="btn btn-primary btn-sm btn-confirm-sync" (click)="confirmManualSync()">
            ⚡ Run Sync Now
          </button>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class SettingsComponent implements OnInit {
  instances: Instance[] = [];
  profiles: SyncProfile[] = [];
  settings: Partial<Settings> = {
    syncIntervalMinutes: 30,
    defaultDelayHours: 48,
    defaultLinkType: 'hardlink',
  };

  isLoading = true;
  showAddForm = false;
  editingInstance: Instance | null = null;
  showProfileForm = false;
  showProfilePathOverrides = false;
  editingProfileId: number | null = null;

  // Concurrent tracking sets
  scanningInstanceIds = new Set<number>();
  testingInstanceIds = new Set<number>();
  syncingProfileIds = new Set<number>();

  // Dry Run state
  runningDryRunId: number | null = null;
  dryRunReport: DryRunReport | null = null;
  showDryRunModal = false;
  searchQuery = '';
  reportViewMode: 'grouped' | 'flat' = 'grouped';
  expandedShows = new Set<string>();

  // Paused profile sync confirmation state
  showSyncConfirmModal = false;
  pendingSyncProfile: SyncProfile | null = null;

  currentProfile: Partial<SyncProfile> = {
    enabled: true,
    linkType: 'hardlink',
    delayHours: 48,
    searchIfMissing: true,
    syncMonitoredSeasons: true,
    mainPath: '',
    childPath: '',
  };

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.showSyncConfirmModal) {
      this.closeSyncConfirmModal();
      return;
    }
    if (this.showDryRunModal) {
      this.closeDryRunModal();
    }
  }

  ngOnInit() {
    this.loadAll();
  }

  isScanning(id: number): boolean {
    return this.scanningInstanceIds.has(id);
  }

  isTesting(id: number): boolean {
    return this.testingInstanceIds.has(id);
  }

  isSyncing(id: number): boolean {
    return this.syncingProfileIds.has(id);
  }

  loadAll() {
    this.isLoading = true;
    this.cdr.markForCheck();

    forkJoin({
      instances: this.api.getInstances(),
      profiles: this.api.getSyncProfiles(),
      settings: this.api.getSettings(),
    }).subscribe({
      next: (res) => {
        this.instances = res.instances || [];
        this.profiles = res.profiles || [];
        this.settings = res.settings || this.settings;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  get mainInstances(): Instance[] {
    return this.instances.filter(i => i.isMain);
  }

  get childInstances(): Instance[] {
    return this.instances.filter(i => !i.isMain);
  }

  get filteredChildInstances(): Instance[] {
    const selectedMain = this.instances.find(i => i.id === Number(this.currentProfile.mainInstanceId));
    if (!selectedMain) return this.childInstances;
    return this.childInstances.filter(c => c.type === selectedMain.type);
  }

  onMainInstanceChange(mainId: number) {
    this.currentProfile.mainInstanceId = mainId;
    const selectedMain = this.instances.find(i => i.id === Number(mainId));
    if (selectedMain) {
      const validChildren = this.childInstances.filter(c => c.type === selectedMain.type);
      const currentChildValid = validChildren.some(c => c.id === Number(this.currentProfile.childInstanceId));
      if (!currentChildValid) {
        this.currentProfile.childInstanceId = validChildren[0]?.id;
      }
    }
    this.cdr.detectChanges();
  }

  isSonarrProfile(): boolean {
    const main = this.instances.find(i => i.id === Number(this.currentProfile.mainInstanceId));
    return main?.type === 'sonarr';
  }

  openAddInstance() {
    this.editingInstance = null;
    this.showAddForm = true;
    this.cdr.detectChanges();
  }

  onInstanceSaved(data: Partial<Instance>) {
    if (this.editingInstance && this.editingInstance.id) {
      this.api.updateInstance(this.editingInstance.id, data).subscribe({
        next: (saved) => {
          this.cancelInstanceForm();
          this.toast.success(`Instance "${saved.name || data.name}" updated successfully`);
          this.loadAll();
        },
        error: (err) => {
          this.toast.error(`Failed to update instance: ${err.error?.error || err.message}`);
        }
      });
    } else {
      this.api.createInstance(data).subscribe({
        next: (created) => {
          this.cancelInstanceForm();
          this.toast.success(`Instance "${created.name || data.name}" added successfully`);
          this.loadAll();
        },
        error: (err) => {
          this.toast.error(`Failed to create instance: ${err.error?.error || err.message}`);
        }
      });
    }
  }

  editInstance(inst: Instance) {
    this.editingInstance = inst;
    this.showAddForm = true;
    this.cdr.detectChanges();
  }

  cancelInstanceForm() {
    this.showAddForm = false;
    this.editingInstance = null;
    this.cdr.detectChanges();
  }

  deleteInstance(inst: Instance) {
    if (confirm(`Delete "${inst.name}"? This cannot be undone.`)) {
      this.api.deleteInstance(inst.id).subscribe({
        next: () => {
          this.toast.info(`Instance "${inst.name}" deleted`);
          this.loadAll();
        },
        error: (err) => {
          this.toast.error(`Failed to delete instance: ${err.error?.error || err.message}`);
        }
      });
    }
  }

  testInstance(inst: Instance) {
    this.testingInstanceIds.add(inst.id);
    this.cdr.detectChanges();
    this.api.testInstance(inst.id).subscribe({
      next: (res: any) => {
        this.testingInstanceIds.delete(inst.id);
        this.cdr.detectChanges();
        this.toast.success(`Connection to "${inst.name}" succeeded (v${res.version || 'OK'})`);
      },
      error: (err) => {
        this.testingInstanceIds.delete(inst.id);
        this.cdr.detectChanges();
        this.toast.error(`Connection to "${inst.name}" failed: ${err.error?.error || err.message}`);
      },
    });
  }

  scanInstance(inst: Instance) {
    this.scanningInstanceIds.add(inst.id);
    this.cdr.detectChanges();
    this.api.scanInstance(inst.id).subscribe({
      next: (res: any) => {
        this.scanningInstanceIds.delete(inst.id);
        this.cdr.detectChanges();
        this.toast.success(`Discovered ${res.total || 0} media items from "${inst.name}"`);
      },
      error: (err) => {
        this.scanningInstanceIds.delete(inst.id);
        this.cdr.detectChanges();
        this.toast.error(`Scan for "${inst.name}" failed: ${err.error?.error || err.message}`);
      }
    });
  }

  openAddProfile() {
    this.editingProfileId = null;
    this.showProfilePathOverrides = false;
    const initialMain = this.mainInstances[0];
    const initialChildren = initialMain 
      ? this.childInstances.filter(c => c.type === initialMain.type)
      : this.childInstances;

    this.currentProfile = {
      mainInstanceId: initialMain?.id,
      childInstanceId: initialChildren[0]?.id,
      enabled: true,
      linkType: 'hardlink',
      delayHours: 48,
      searchIfMissing: true,
      syncMonitoredSeasons: true,
      mainPath: '',
      childPath: '',
    };
    this.showProfileForm = true;
    this.cdr.detectChanges();
  }

  editProfile(profile: SyncProfile) {
    this.editingProfileId = profile.id;
    this.currentProfile = { ...profile };
    this.showProfilePathOverrides = !!(profile.mainPath?.trim() || profile.childPath?.trim());
    this.showProfileForm = true;
    this.cdr.detectChanges();
  }

  cancelProfileForm() {
    this.showProfileForm = false;
    this.editingProfileId = null;
    this.cdr.detectChanges();
  }

  saveProfile() {
    if (!this.currentProfile.mainInstanceId || !this.currentProfile.childInstanceId) {
      this.toast.warning('Please select both Main and Child instances.');
      return;
    }

    const payload = {
      ...this.currentProfile,
      syncMonitoredSeasons: this.isSonarrProfile() ? (this.currentProfile.syncMonitoredSeasons ?? false) : false
    };

    if (this.editingProfileId) {
      this.api.updateSyncProfile(this.editingProfileId, payload).subscribe({
        next: () => {
          this.cancelProfileForm();
          this.toast.success('Sync profile updated successfully');
          this.loadAll();
        },
        error: (err) => {
          this.toast.error(`Failed to update sync profile: ${err.error?.error || err.message}`);
        },
      });
    } else {
      this.api.createSyncProfile(payload).subscribe({
        next: () => {
          this.cancelProfileForm();
          this.toast.success('Sync profile created successfully');
          this.loadAll();
        },
        error: (err) => {
          this.toast.error(`Failed to create sync profile: ${err.error?.error || err.message}`);
        },
      });
    }
  }

  toggleProfileEnabled(profile: SyncProfile) {
    const updatedStatus = !profile.enabled;
    profile.enabled = updatedStatus;
    this.cdr.detectChanges();

    this.api.updateSyncProfile(profile.id, { enabled: updatedStatus }).subscribe({
      next: () => {
        this.toast.info(`Sync profile ${updatedStatus ? 'enabled (Active)' : 'disabled (Paused)'}`);
        this.loadAll();
      },
      error: (err) => {
        profile.enabled = !updatedStatus;
        this.cdr.detectChanges();
        this.toast.error(`Failed to update status: ${err.error?.error || err.message}`);
      }
    });
  }

  deleteProfile(id: number) {
    if (confirm('Delete this sync profile?')) {
      this.api.deleteSyncProfile(id).subscribe({
        next: () => {
          this.profiles = this.profiles.filter(p => p.id !== id);
          this.toast.info('Sync profile deleted');
          this.cdr.detectChanges();
          this.loadAll();
        },
        error: (err) => {
          this.toast.error(`Failed to delete sync profile: ${err.error?.error || err.message}`);
        }
      });
    }
  }

  onRunSyncClick(profile: SyncProfile) {
    if (this.isSyncing(profile.id)) return;
    if (profile.enabled) {
      this.executeSync(profile);
    } else {
      this.pendingSyncProfile = profile;
      this.showSyncConfirmModal = true;
      this.cdr.detectChanges();
    }
  }

  closeSyncConfirmModal() {
    this.showSyncConfirmModal = false;
    this.pendingSyncProfile = null;
    this.cdr.detectChanges();
  }

  confirmManualSync() {
    if (!this.pendingSyncProfile) return;
    const profile = this.pendingSyncProfile;
    this.closeSyncConfirmModal();
    this.executeSync(profile);
  }

  executeSync(profile: SyncProfile) {
    this.syncingProfileIds.add(profile.id);
    this.toast.info(`Running sync for "${profile.mainInstance?.name || 'Main'} ➔ ${profile.childInstance?.name || 'Child'}"...`);
    this.cdr.detectChanges();
    this.api.syncProfile(profile.id).subscribe({
      next: (res: any) => {
        this.syncingProfileIds.delete(profile.id);
        this.cdr.detectChanges();
        if (!res || res.total === 0) {
          this.toast.info(`Sync complete for "${profile.mainInstance?.name || 'Main'}": No media files found to sync.`);
        } else if (res.linked > 0 || res.searchTriggered > 0) {
          this.toast.success(`Sync complete: ${res.linked} newly linked, ${res.searchTriggered} search(es) triggered (${res.alreadyLinked || 0} already in sync).`);
        } else {
          this.toast.success(`Sync complete: All ${res.total} media item(s) are already in sync (${res.alreadyLinked || 0} verified linked, ${res.skipped || 0} skipped).`);
        }
        this.loadAll();
      },
      error: (err) => {
        this.syncingProfileIds.delete(profile.id);
        this.cdr.detectChanges();
        this.toast.error(`Sync failed: ${err.error?.error || err.message}`);
      },
    });
  }

  runSync(profile: SyncProfile) {
    this.onRunSyncClick(profile);
  }

  saveSettings() {
    this.api.updateSettings(this.settings).subscribe({
      next: () => {
        this.toast.success('Global settings saved successfully');
      },
      error: (err) => {
        this.toast.error(`Failed to save settings: ${err.error?.error || err.message}`);
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // DRY RUN ACTIONS
  // ═══════════════════════════════════════════════════════════════

  runDryRun(profile: SyncProfile) {
    this.runningDryRunId = profile.id;
    this.searchQuery = '';
    this.cdr.detectChanges();

    this.api.dryRunProfile(profile.id).subscribe({
      next: (report) => {
        this.runningDryRunId = null;
        this.dryRunReport = report;
        this.showDryRunModal = true;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.runningDryRunId = null;
        this.cdr.detectChanges();
        this.toast.error(`Dry run failed: ${err.error?.error || err.message}`);
      }
    });
  }

  reRunCurrentDryRun() {
    if (!this.dryRunReport) return;
    const profile = this.profiles.find(p => p.id === this.dryRunReport!.profileId);
    if (profile) {
      this.runDryRun(profile);
    }
  }

  closeDryRunModal() {
    this.showDryRunModal = false;
    this.searchQuery = '';
    this.cdr.detectChanges();
  }

  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('dry-run-overlay')) {
      this.closeDryRunModal();
    }
  }

  filterList(items?: DryRunItem[]): DryRunItem[] {
    if (!items) return [];
    if (!this.searchQuery.trim()) return items;
    const q = this.searchQuery.toLowerCase().trim();
    return items.filter(i =>
      i.title.toLowerCase().includes(q) ||
      (i.seriesTitle && i.seriesTitle.toLowerCase().includes(q)) ||
      (i.sourcePath && i.sourcePath.toLowerCase().includes(q)) ||
      (i.destinationPath && i.destinationPath.toLowerCase().includes(q)) ||
      (i.reason && i.reason.toLowerCase().includes(q))
    );
  }

  isEpisodeReport(): boolean {
    if (!this.dryRunReport) return false;
    return (
      this.dryRunReport.wouldLink.some(i => i.mediaType === 'episode') ||
      this.dryRunReport.needsDownload.some(i => i.mediaType === 'episode') ||
      this.dryRunReport.alreadyLinked.some(i => i.mediaType === 'episode') ||
      this.dryRunReport.alreadyExistsChild.some(i => i.mediaType === 'episode')
    );
  }

  getBreakdownText(items?: DryRunItem[]): string {
    if (!items || items.length === 0) return '';
    const isEpisode = items.some(i => i.mediaType === 'episode');
    if (!isEpisode) {
      return `${items.length} ${items.length === 1 ? 'movie' : 'movies'}`;
    }

    const shows = new Set<string>();
    const seasons = new Set<string>();
    for (const item of items) {
      const show = item.seriesTitle || item.title.replace(/\s+S\d+E\d+.*$/i, '').trim();
      shows.add(show);
      seasons.add(`${show}_S${item.seasonNumber ?? 1}`);
    }

    const epCount = items.length;
    const showCount = shows.size;
    const seasonCount = seasons.size;

    return `${epCount.toLocaleString()} ${epCount === 1 ? 'episode' : 'episodes'} across ${showCount} ${showCount === 1 ? 'show' : 'shows'} (${seasonCount} ${seasonCount === 1 ? 'season' : 'seasons'})`;
  }

  getShowsCount(items?: DryRunItem[]): number {
    if (!items || items.length === 0) return 0;
    const shows = new Set<string>();
    for (const item of items) {
      const show = item.seriesTitle || item.title.replace(/\s+S\d+E\d+.*$/i, '').trim();
      shows.add(show);
    }
    return shows.size;
  }

  getSeasonsCount(items?: DryRunItem[]): number {
    if (!items || items.length === 0) return 0;
    const seasons = new Set<string>();
    for (const item of items) {
      const show = item.seriesTitle || item.title.replace(/\s+S\d+E\d+.*$/i, '').trim();
      seasons.add(`${show}_S${item.seasonNumber ?? 1}`);
    }
    return seasons.size;
  }

  groupItemsByShow(items?: DryRunItem[]): Array<{
    showTitle: string;
    year?: number;
    externalId: string;
    totalEpisodes: number;
    seasons: Array<{
      seasonNumber: number;
      episodes: DryRunItem[];
    }>;
    sampleItem: DryRunItem;
  }> {
    if (!items || items.length === 0) return [];
    const map = new Map<string, {
      showTitle: string;
      year?: number;
      externalId: string;
      seasonsMap: Map<number, DryRunItem[]>;
      sampleItem: DryRunItem;
    }>();

    for (const item of items) {
      const seriesTitle = item.seriesTitle || item.title.replace(/\s+S\d+E\d+.*$/i, '').trim() || item.title;
      const key = `${seriesTitle}_${item.year || ''}_${item.externalId || ''}`;

      if (!map.has(key)) {
        map.set(key, {
          showTitle: seriesTitle,
          year: item.year,
          externalId: item.externalId,
          seasonsMap: new Map<number, DryRunItem[]>(),
          sampleItem: item,
        });
      }

      const group = map.get(key)!;
      const seasonNum = item.seasonNumber !== undefined ? item.seasonNumber : 1;
      if (!group.seasonsMap.has(seasonNum)) {
        group.seasonsMap.set(seasonNum, []);
      }
      group.seasonsMap.get(seasonNum)!.push(item);
    }

    const result: Array<{
      showTitle: string;
      year?: number;
      externalId: string;
      totalEpisodes: number;
      seasons: Array<{
        seasonNumber: number;
        episodes: DryRunItem[];
      }>;
      sampleItem: DryRunItem;
    }> = [];

    for (const g of map.values()) {
      const seasons = Array.from(g.seasonsMap.entries())
        .map(([seasonNumber, episodes]) => ({
          seasonNumber,
          episodes: episodes.sort((a, b) => (a.episodeNumber || 0) - (b.episodeNumber || 0)),
        }))
        .sort((a, b) => a.seasonNumber - b.seasonNumber);

      const totalEpisodes = seasons.reduce((acc, s) => acc + s.episodes.length, 0);
      result.push({
        showTitle: g.showTitle,
        year: g.year,
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

  getIconBg(type: string): string {
    return type === 'radarr' ? 'rgba(255,165,0,0.2)' : 'rgba(62,203,240,0.2)';
  }

  getIconColor(type: string): string {
    return type === 'radarr' ? '#ffa500' : '#3ecbf0';
  }
}
