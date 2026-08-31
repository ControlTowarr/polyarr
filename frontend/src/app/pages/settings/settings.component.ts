import { Component, OnInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { Instance, SyncProfile, Settings, DryRunReport, DryRunItem } from '../../core/models';
import { InstanceFormComponent } from '../../components/instance-form/instance-form.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, InstanceFormComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Settings & Configuration</h1>
        <p class="page-subtitle">Manage your connected *arr instances, sync profile rules, and sync intervals</p>
      </div>
    </div>

    <!-- Connected Instances Card -->
    <div class="card" style="margin-bottom:var(--space-xl);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-lg);">
        <h3 style="font-weight:600;font-size:1.1rem;">Connected Instances ({{ instances.length }})</h3>
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
      <div *ngIf="isLoading" style="display:flex;justify-content:center;padding:var(--space-lg);">
        <span class="spinner" style="width:32px;height:32px;"></span>
      </div>

      <!-- Empty State -->
      <div *ngIf="!isLoading && instances.length === 0 && !showAddForm" class="empty-state" style="padding:var(--space-lg);">
        <p class="empty-state-text">No instances configured yet.</p>
        <button class="btn btn-primary" (click)="openAddInstance()">Add Your First Instance</button>
      </div>

      <!-- Instance List -->
      <div class="instance-list" *ngIf="!isLoading && instances.length > 0 && !showAddForm">
        <div class="instance-item" *ngFor="let inst of instances">
          <div class="instance-item-info">
            <div
              class="instance-item-icon"
              [style.background]="getIconBg(inst.type)"
              [style.color]="getIconColor(inst.type)"
            >
              {{ inst.type === 'radarr' ? 'R' : 'S' }}
            </div>
            <div>
              <div style="display:flex;align-items:center;gap:var(--space-sm);flex-wrap:wrap;">
                <span style="font-weight:600;font-size:1rem;">{{ inst.name }}</span>
                <span *ngIf="inst.isMain" class="badge badge-success">Source of Truth</span>
                <span class="badge badge-muted">{{ (inst.language || 'en') | uppercase }}</span>
              </div>
              <div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">{{ inst.url }}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);" *ngIf="inst.rootFolderPath">Root: {{ inst.rootFolderPath }}</div>
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
            <button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" (click)="deleteInstance(inst)">
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Sync Profiles Card -->
    <div class="card" style="margin-bottom:var(--space-xl);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-lg);">
        <h3 style="font-weight:600;font-size:1.1rem;">Sync Profiles ({{ profiles.length }})</h3>
        <button class="btn btn-primary btn-sm" (click)="openAddProfile()" *ngIf="!showProfileForm">
          + Add Sync Profile
        </button>
      </div>

      <!-- Add / Edit Profile Form -->
      <div *ngIf="showProfileForm" style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:var(--space-lg);margin-bottom:var(--space-lg);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-md);">
          <h4 style="font-weight:600;">{{ editingProfileId ? 'Edit Sync Rule' : 'Create New Sync Rule' }}</h4>
          <button class="btn btn-ghost btn-sm" (click)="cancelProfileForm()">✕</button>
        </div>
        
        <div class="form-group">
          <label class="form-label">Source (Main Instance)</label>
          <select class="form-select" [(ngModel)]="currentProfile.mainInstanceId">
            <option *ngFor="let inst of mainInstances" [value]="inst.id">{{ inst.name }} ({{ inst.type | titlecase }})</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Target (Child Instance)</label>
          <select class="form-select" [(ngModel)]="currentProfile.childInstanceId">
            <option *ngFor="let inst of childInstances" [value]="inst.id">{{ inst.name }} ({{ (inst.language || 'en') | uppercase }})</option>
          </select>
        </div>

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
          <p style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">
            Wait this many hours before searching the child instance if target audio is missing.
          </p>
        </div>

        <!-- Consistent Modern Switch Controls -->
        <div style="display:flex;flex-direction:column;gap:var(--space-sm);margin-top:var(--space-md);">
          <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:var(--space-md);">
            <div>
              <div style="font-weight:600;font-size:0.9rem;">Enable Active Scanning & Syncing</div>
              <div style="font-size:0.78rem;color:var(--text-muted);">Include this profile in automated background syncs, library scans, and webhook imports</div>
            </div>
            <label class="switch">
              <input type="checkbox" [(ngModel)]="currentProfile.enabled">
              <span class="switch-slider"></span>
            </label>
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:var(--space-md);">
            <div>
              <div style="font-weight:600;font-size:0.9rem;">Auto-Search Missing Audio</div>
              <div style="font-size:0.78rem;color:var(--text-muted);">Automatically search indexers for secondary audio if missing on main. When off, missing audio items are ignored (no-op) and only matching files are linked.</div>
            </div>
            <label class="switch">
              <input type="checkbox" [(ngModel)]="currentProfile.searchIfMissing">
              <span class="switch-slider"></span>
            </label>
          </div>

          <div *ngIf="isSonarrProfile()" style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:var(--space-md);">
            <div>
              <div style="font-weight:600;font-size:0.9rem;">Sync Monitored Seasons</div>
              <div style="font-size:0.78rem;color:var(--text-muted);">Keep season monitor status synchronized across Sonarr instances (Sonarr only)</div>
            </div>
            <label class="switch">
              <input type="checkbox" [(ngModel)]="currentProfile.syncMonitoredSeasons">
              <span class="switch-slider"></span>
            </label>
          </div>
        </div>

        <div style="display:flex;gap:var(--space-sm);justify-content:flex-end;margin-top:var(--space-lg);">
          <button class="btn btn-ghost" (click)="cancelProfileForm()">Cancel</button>
          <button class="btn btn-primary" (click)="saveProfile()">
            {{ editingProfileId ? 'Update Profile' : 'Create Profile' }}
          </button>
        </div>
      </div>

      <!-- Profile List -->
      <div *ngIf="!isLoading && profiles.length === 0 && !showProfileForm" class="empty-state" style="padding:var(--space-md);">
        <p class="empty-state-text">No sync profiles configured. Create one to link main and child instances.</p>
      </div>

      <div class="instance-list" *ngIf="!isLoading && profiles.length > 0">
        <div class="instance-item" *ngFor="let profile of profiles">
          <div class="instance-item-info">
            <div class="instance-item-icon" style="background:rgba(167,139,250,0.2);color:#a78bfa;">
              🔄
            </div>
            <div>
              <div style="display:flex;align-items:center;gap:var(--space-sm);flex-wrap:wrap;">
                <span style="font-weight:600;font-size:1rem;">
                  {{ profile.mainInstance?.name || 'Main' }} ➔ {{ profile.childInstance?.name || 'Child' }}
                </span>
                <span class="badge" [ngClass]="profile.enabled ? 'badge-success' : 'badge-muted'">
                  {{ profile.enabled ? '✓ Active' : '⏸ Paused' }}
                </span>
              </div>
              <div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">
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
              class="btn btn-secondary btn-sm" 
              style="display:inline-flex;align-items:center;gap:6px;border-color:rgba(62, 203, 240, 0.4);color:var(--accent-primary);"
              (click)="runDryRun(profile)"
              [disabled]="runningDryRunId === profile.id"
              title="Simulate sync without making any changes"
            >
              <span *ngIf="runningDryRunId === profile.id" class="spinner" style="width:12px;height:12px;border-width:2px;"></span>
              <span *ngIf="runningDryRunId !== profile.id">🧪</span>
              {{ runningDryRunId === profile.id ? 'Simulating...' : 'Dry Run' }}
            </button>

            <button class="btn btn-ghost btn-sm" (click)="editProfile(profile)">
              Edit
            </button>
            <button class="btn btn-secondary btn-sm" (click)="runSync(profile.id)" [disabled]="!profile.enabled || isSyncing(profile.id)">
              {{ isSyncing(profile.id) ? 'Syncing...' : 'Run Sync' }}
            </button>
            <button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" (click)="deleteProfile(profile.id)">
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Global App Settings Card -->
    <div class="card">
      <h3 style="font-weight:600;font-size:1.1rem;margin-bottom:var(--space-lg);">Global Settings</h3>

      <div class="form-group">
        <label class="form-label">Background Sync Interval (minutes)</label>
        <input class="form-input" type="number" [(ngModel)]="settings.syncIntervalMinutes" min="5" max="1440" style="max-width:200px;" />
      </div>

      <div class="form-group">
        <label class="form-label">Default Delay Before Child Search (hours)</label>
        <input class="form-input" type="number" [(ngModel)]="settings.defaultDelayHours" min="0" max="720" style="max-width:200px;" />
      </div>

      <div class="form-group">
        <label class="form-label">Default Linking Method</label>
        <select class="form-select" [(ngModel)]="settings.defaultLinkType" style="max-width:200px;">
          <option value="hardlink">Hardlink</option>
          <option value="symlink">Symlink</option>
        </select>
      </div>

      <button class="btn btn-primary btn-sm" (click)="saveSettings()" style="margin-top:var(--space-md);">
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
            <div style="display:flex;align-items:center;gap:var(--space-sm);flex-wrap:wrap;">
              <span style="font-size:1.4rem;">🧪</span>
              <h2 style="font-size:1.35rem;font-weight:700;background:var(--accent-gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">
                Dry Run Sync Analysis Report
              </h2>
              <span class="badge badge-info">{{ dryRunReport.linkType | uppercase }}</span>
              <span class="badge badge-success">Target: {{ dryRunReport.targetLanguage | uppercase }}</span>
            </div>
            <p style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px;">
              Simulation for <strong style="color:var(--text-primary);">{{ dryRunReport.profileName }}</strong> &bull; 
              Generated at {{ dryRunReport.generatedAt | date:'mediumTime' }} &bull; 
              <span style="color:var(--color-success);">0 file system or library changes made</span>
            </p>
          </div>

          <div style="display:flex;align-items:center;gap:var(--space-sm);">
            <button 
              class="btn btn-secondary btn-sm" 
              (click)="reRunCurrentDryRun()" 
              [disabled]="runningDryRunId === dryRunReport.profileId"
            >
              <span *ngIf="runningDryRunId === dryRunReport.profileId" class="spinner" style="width:12px;height:12px;border-width:2px;"></span>
              🔄 Re-run
            </button>
            <button class="btn btn-ghost btn-sm" style="font-size:1.2rem;padding:4px 10px;" (click)="closeDryRunModal()">
              ✕
            </button>
          </div>
        </div>

        <!-- Modal Body Scrollable -->
        <div class="dry-run-body">
          
          <!-- Summary Metrics Cards Grid -->
          <div class="dry-run-stats-grid">
            
            <!-- 1. Ready to Hardlink -->
            <div class="stat-card" style="border-left: 4px solid var(--accent-primary);">
              <div class="stat-icon" style="background:var(--accent-primary-muted);color:var(--accent-primary);">🔗</div>
              <div class="stat-content">
                <div class="stat-number" style="color:var(--accent-primary);">{{ dryRunReport.summary.wouldLinkCount }}</div>
                <div class="stat-label">Ready to Hardlink</div>
                <div class="stat-sub">Has target audio; instant / 0 space</div>
              </div>
            </div>

            <!-- 2. Needs Download on Secondary -->
            <div class="stat-card" style="border-left: 4px solid var(--color-warning);">
              <div class="stat-icon" style="background:var(--color-warning-muted);color:var(--color-warning);">📥</div>
              <div class="stat-content">
                <div class="stat-number" style="color:var(--color-warning);">{{ dryRunReport.summary.needsDownloadCount }}</div>
                <div class="stat-label">Needs Download</div>
                <div class="stat-sub">Lacks target audio; secondary downloads</div>
              </div>
            </div>

            <!-- 3. Already Hardlinked -->
            <div class="stat-card" style="border-left: 4px solid #818cf8;">
              <div class="stat-icon" style="background:rgba(129, 140, 248, 0.15);color:#818cf8;">✅</div>
              <div class="stat-content">
                <div class="stat-number" style="color:#818cf8;">{{ dryRunReport.summary.alreadyLinkedCount }}</div>
                <div class="stat-label">Already Hardlinked</div>
                <div class="stat-sub">Link verified on disk</div>
              </div>
            </div>

            <!-- 4. Already on Secondary (Own File) -->
            <div class="stat-card" style="border-left: 4px solid var(--accent-secondary);">
              <div class="stat-icon" style="background:rgba(167, 139, 250, 0.15);color:var(--accent-secondary);">📁</div>
              <div class="stat-content">
                <div class="stat-number" style="color:var(--accent-secondary);">{{ dryRunReport.summary.alreadyExistsChildCount }}</div>
                <div class="stat-label">Already on Secondary</div>
                <div class="stat-sub">Secondary has its own copy</div>
              </div>
            </div>

            <!-- 5. Real Errors Only -->
            <div class="stat-card" [style.border-left]="dryRunReport.summary.errorCount > 0 ? '4px solid var(--color-danger)' : '4px solid var(--border-subtle)'">
              <div class="stat-icon" [style.background]="dryRunReport.summary.errorCount > 0 ? 'var(--color-danger-muted)' : 'var(--bg-input)'" [style.color]="dryRunReport.summary.errorCount > 0 ? 'var(--color-danger)' : 'var(--text-muted)'">⚠️</div>
              <div class="stat-content">
                <div class="stat-number" [style.color]="dryRunReport.summary.errorCount > 0 ? 'var(--color-danger)' : 'var(--text-muted)'">
                  {{ dryRunReport.summary.errorCount }}
                </div>
                <div class="stat-label">Errors</div>
                <div class="stat-sub">Total scanned: {{ dryRunReport.summary.totalScanned }}</div>
              </div>
            </div>
          </div>

          <!-- Report Search Filter Bar -->
          <div style="display:flex;align-items:center;gap:var(--space-md);margin-bottom:var(--space-lg);margin-top:var(--space-md);">
            <div style="position:relative;flex:1;">
              <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:0.9rem;">🔍</span>
              <input 
                class="form-input" 
                style="padding-left:36px;width:100%;" 
                type="text" 
                [(ngModel)]="searchQuery" 
                placeholder="Filter results in this report by title, path, or reason..."
              />
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
                  <span class="badge badge-info">{{ filterList(dryRunReport.wouldLink).length }} items</span>
                </div>
                <span class="summary-hint">Main file contains {{ dryRunReport.targetLanguage | uppercase }} audio; will be hardlinked (zero extra space)</span>
              </summary>
              
              <div class="section-content">
                <div *ngIf="filterList(dryRunReport.wouldLink).length === 0" class="section-empty">
                  No items in this category{{ searchQuery ? ' matching your filter' : '' }}.
                </div>

                <div *ngFor="let item of filterList(dryRunReport.wouldLink)" class="item-row">
                  <div class="item-header">
                    <div style="display:flex;align-items:center;gap:var(--space-sm);flex-wrap:wrap;">
                      <span style="font-weight:600;font-size:0.95rem;color:var(--text-primary);">
                        {{ item.title }} <span *ngIf="item.year" style="color:var(--text-secondary);font-weight:400;">({{ item.year }})</span>
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
              </div>
            </details>

            <!-- SECTION 2: NEEDS SECONDARY DOWNLOAD -->
            <details class="report-section" [open]="filterList(dryRunReport.needsDownload).length > 0">
              <summary class="report-summary">
                <div class="summary-left">
                  <span class="section-icon">📥</span>
                  <span class="section-title">Items to Download Separately on Secondary (Missing Target Audio)</span>
                  <span class="badge badge-warning">{{ filterList(dryRunReport.needsDownload).length }} items</span>
                </div>
                <span class="summary-hint">Main file lacks {{ dryRunReport.targetLanguage | uppercase }} audio; secondary *arr will download its own copy</span>
              </summary>
              
              <div class="section-content">
                <div *ngIf="filterList(dryRunReport.needsDownload).length === 0" class="section-empty">
                  No items in this category{{ searchQuery ? ' matching your filter' : '' }}.
                </div>

                <div *ngFor="let item of filterList(dryRunReport.needsDownload)" class="item-row">
                  <div class="item-header">
                    <div style="display:flex;align-items:center;gap:var(--space-sm);flex-wrap:wrap;">
                      <span style="font-weight:600;font-size:0.95rem;color:var(--text-primary);">
                        {{ item.title }} <span *ngIf="item.year" style="color:var(--text-secondary);font-weight:400;">({{ item.year }})</span>
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
              </div>
            </details>

            <!-- SECTION 3: ALREADY LINKED ON DISK -->
            <details class="report-section">
              <summary class="report-summary">
                <div class="summary-left">
                  <span class="section-icon">✅</span>
                  <span class="section-title">Already Hardlinked on Disk (No Action Needed)</span>
                  <span class="badge badge-muted">{{ filterList(dryRunReport.alreadyLinked).length }} items</span>
                </div>
                <span class="summary-hint">Hardlink or symlink is already verified and intact at destination</span>
              </summary>
              
              <div class="section-content">
                <div *ngIf="filterList(dryRunReport.alreadyLinked).length === 0" class="section-empty">
                  No items in this category{{ searchQuery ? ' matching your filter' : '' }}.
                </div>

                <div *ngFor="let item of filterList(dryRunReport.alreadyLinked)" class="item-row">
                  <div class="item-header">
                    <span style="font-weight:600;font-size:0.95rem;color:var(--text-primary);">
                      {{ item.title }} <span *ngIf="item.year" style="color:var(--text-secondary);font-weight:400;">({{ item.year }})</span>
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
              </div>
            </details>

            <!-- SECTION 4: ALREADY ON SECONDARY (OWN FILE) -->
            <details class="report-section">
              <summary class="report-summary">
                <div class="summary-left">
                  <span class="section-icon">📁</span>
                  <span class="section-title">Already Downloaded by Secondary (No Link Needed)</span>
                  <span class="badge badge-muted">{{ filterList(dryRunReport.alreadyExistsChild).length }} items</span>
                </div>
                <span class="summary-hint">Secondary instance already possesses its own file; will not be overwritten</span>
              </summary>
              
              <div class="section-content">
                <div *ngIf="filterList(dryRunReport.alreadyExistsChild).length === 0" class="section-empty">
                  No items in this category{{ searchQuery ? ' matching your filter' : '' }}.
                </div>

                <div *ngFor="let item of filterList(dryRunReport.alreadyExistsChild)" class="item-row">
                  <div class="item-header">
                    <span style="font-weight:600;font-size:0.95rem;color:var(--text-primary);">
                      {{ item.title }} <span *ngIf="item.year" style="color:var(--text-secondary);font-weight:400;">({{ item.year }})</span>
                    </span>
                    <span class="badge badge-muted">Independent Copy</span>
                  </div>
                  <div class="item-reason">{{ item.reason }}</div>
                </div>
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

                <div *ngFor="let item of filterList(dryRunReport.errors)" class="item-row" style="border-left: 3px solid var(--color-danger);">
                  <div class="item-header">
                    <span style="font-weight:600;font-size:0.95rem;color:var(--text-primary);">
                      {{ item.title }} <span *ngIf="item.year" style="color:var(--text-secondary);font-weight:400;">({{ item.year }})</span>
                    </span>
                    <span class="badge badge-danger">Error</span>
                  </div>
                  <div class="item-reason" style="color:var(--color-danger);">{{ item.reason }}</div>
                </div>
              </div>
            </details>

          </div>

        </div>

        <!-- Modal Footer -->
        <div class="dry-run-footer">
          <div style="font-size:0.85rem;color:var(--text-muted);">
            💡 This was a simulation. To perform actual linking, click <strong>"Run Sync"</strong> on the profile.
          </div>
          <button class="btn btn-primary" (click)="closeDryRunModal()">
            Done / Close
          </button>
        </div>

      </div>
    </div>
  `,
  styles: [`
    /* Dry Run Overlay & Modal */
    .dry-run-overlay {
      position: fixed;
      inset: 0;
      background: var(--bg-modal-overlay);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-md);
      animation: fadeIn 0.2s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .dry-run-modal {
      width: 95vw;
      max-width: 1100px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      background: var(--bg-card);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-lg);
      overflow: hidden;
      padding: 0;
    }

    .dry-run-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-lg) var(--space-xl);
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg-surface);
    }

    .dry-run-body {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-xl);
    }

    .dry-run-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-md) var(--space-xl);
      border-top: 1px solid var(--border-subtle);
      background: var(--bg-surface);
    }

    /* Stat Cards Grid */
    .dry-run-stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: var(--space-md);
      margin-bottom: var(--space-lg);
    }

    .stat-card {
      display: flex;
      align-items: flex-start;
      gap: var(--space-md);
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: var(--space-md);
      transition: transform var(--transition-fast);
    }
    .stat-card:hover {
      transform: translateY(-2px);
    }

    .stat-icon {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      flex-shrink: 0;
    }

    .stat-content {
      min-width: 0;
    }

    .stat-number {
      font-size: 1.6rem;
      font-weight: 700;
      line-height: 1.1;
    }

    .stat-label {
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--text-primary);
      margin-top: 2px;
    }

    .stat-sub {
      font-size: 0.72rem;
      color: var(--text-muted);
      margin-top: 2px;
      line-height: 1.3;
    }

    /* Collapsible Details Sections */
    .dry-run-sections {
      display: flex;
      flex-direction: column;
      gap: var(--space-md);
    }

    .report-section {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      overflow: hidden;
      transition: border-color var(--transition-fast);
    }
    .report-section[open] {
      border-color: var(--border-default);
    }

    .report-summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-md) var(--space-lg);
      cursor: pointer;
      user-select: none;
      background: var(--bg-surface);
      list-style: none;
      transition: background var(--transition-fast);
    }
    .report-summary::-webkit-details-marker {
      display: none;
    }
    .report-summary:hover {
      background: var(--bg-card-hover);
    }

    .summary-left {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
    }

    .section-icon {
      font-size: 1.2rem;
    }

    .section-title {
      font-weight: 600;
      font-size: 0.95rem;
      color: var(--text-primary);
    }

    .summary-hint {
      font-size: 0.78rem;
      color: var(--text-muted);
    }

    @media (max-width: 768px) {
      .summary-hint {
        display: none;
      }
    }

    .section-content {
      padding: var(--space-md) var(--space-lg);
      border-top: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      gap: var(--space-sm);
      max-height: 380px;
      overflow-y: auto;
    }

    .section-empty {
      font-size: 0.85rem;
      color: var(--text-muted);
      font-style: italic;
      padding: var(--space-md) 0;
      text-align: center;
    }

    /* Item Row Card */
    .item-row {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: var(--space-md);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .item-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-sm);
    }

    .item-paths {
      display: flex;
      flex-direction: column;
      gap: 3px;
      font-size: 0.78rem;
      background: var(--bg-input);
      padding: 6px 10px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-subtle);
      overflow-x: auto;
    }

    .path-line {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--text-secondary);
    }

    .path-tag {
      font-size: 0.68rem;
      font-weight: 700;
      color: var(--accent-primary);
      flex-shrink: 0;
    }

    .path-line code {
      font-family: monospace;
      color: var(--text-primary);
      word-break: break-all;
    }

    .item-reason {
      font-size: 0.8rem;
      color: var(--text-secondary);
    }
  `]
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
    this.currentProfile = {
      mainInstanceId: this.mainInstances[0]?.id,
      childInstanceId: this.childInstances[0]?.id,
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

  runSync(profileId: number) {
    this.syncingProfileIds.add(profileId);
    this.cdr.detectChanges();
    this.api.syncProfile(profileId).subscribe({
      next: (res: any) => {
        this.syncingProfileIds.delete(profileId);
        this.cdr.detectChanges();
        this.toast.success(`Sync complete: ${res.linked || 0} hardlinked, ${res.searchTriggered || 0} searches triggered.`);
        this.loadAll();
      },
      error: (err) => {
        this.syncingProfileIds.delete(profileId);
        this.cdr.detectChanges();
        this.toast.error(`Sync failed: ${err.error?.error || err.message}`);
      },
    });
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
      (i.sourcePath && i.sourcePath.toLowerCase().includes(q)) ||
      (i.destinationPath && i.destinationPath.toLowerCase().includes(q)) ||
      (i.reason && i.reason.toLowerCase().includes(q))
    );
  }

  getIconBg(type: string): string {
    return type === 'radarr' ? 'rgba(255,165,0,0.2)' : 'rgba(62,203,240,0.2)';
  }

  getIconColor(type: string): string {
    return type === 'radarr' ? '#ffa500' : '#3ecbf0';
  }
}
