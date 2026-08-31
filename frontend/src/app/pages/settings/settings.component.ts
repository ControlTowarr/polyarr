import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { Instance, SyncProfile, Settings } from '../../core/models';
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
              <div style="font-size:0.78rem;color:var(--text-muted);">Include this profile in automated background syncs and scans</div>
            </div>
            <label class="switch">
              <input type="checkbox" [(ngModel)]="currentProfile.enabled">
              <span class="switch-slider"></span>
            </label>
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:var(--space-md);">
            <div>
              <div style="font-weight:600;font-size:0.9rem;">Auto-Search Missing Audio</div>
              <div style="font-size:0.78rem;color:var(--text-muted);">Trigger search in child instance if target audio is missing after delay</div>
            </div>
            <label class="switch">
              <input type="checkbox" [(ngModel)]="currentProfile.searchIfMissing">
              <span class="switch-slider"></span>
            </label>
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:var(--space-md);">
            <div>
              <div style="font-weight:600;font-size:0.9rem;">Sync Monitored Seasons</div>
              <div style="font-size:0.78rem;color:var(--text-muted);">Keep season monitor status synchronized across Sonarr instances</div>
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
  `,
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

    if (this.editingProfileId) {
      this.api.updateSyncProfile(this.editingProfileId, this.currentProfile).subscribe({
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
      this.api.createSyncProfile(this.currentProfile).subscribe({
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

  getIconBg(type: string): string {
    return type === 'radarr' ? 'rgba(255,165,0,0.2)' : 'rgba(62,203,240,0.2)';
  }

  getIconColor(type: string): string {
    return type === 'radarr' ? '#ffa500' : '#3ecbf0';
  }
}
