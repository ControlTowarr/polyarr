import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { SyncProfile, Instance } from '../../core/models';

@Component({
  selector: 'app-sync-profiles',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Sync Profiles</h1>
        <p class="page-subtitle">Configure synchronization rules between main and child *arr instances</p>
      </div>
      <button class="btn btn-primary" (click)="openAddProfile()" *ngIf="!showForm">
        + New Profile
      </button>
    </div>

    <!-- Create / Edit Form -->
    <div class="card" *ngIf="showForm" style="margin-bottom:var(--space-xl);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-md);">
        <h3 style="font-weight:600;font-size:1.1rem;">{{ editingProfileId ? 'Edit Sync Rule' : 'Configure Sync Rule' }}</h3>
        <button class="btn btn-ghost btn-sm" (click)="cancelForm()">✕</button>
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
        <label class="form-label">Linking Method</label>
        <select class="form-select" [(ngModel)]="currentProfile.linkType">
          <option value="hardlink">Hardlink (Recommended — zero additional disk space)</option>
          <option value="symlink">Symlink (Symbolic link)</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Delay Before Search (Hours)</label>
        <input class="form-input" type="number" [(ngModel)]="currentProfile.delayHours" min="0" max="720" />
      </div>

      <!-- Consistent Modern Switch Rows -->
      <div style="display:flex;flex-direction:column;gap:var(--space-sm);margin-top:var(--space-md);">
        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:var(--space-md);">
          <div>
            <div style="font-weight:600;font-size:0.9rem;">Enable Active Scanning & Syncing</div>
            <div style="font-size:0.78rem;color:var(--text-muted);">Include this profile in automated background syncs and scans</div>
          </div>
          <label class="switch">
            <input type="checkbox" [(ngModel)]="currentProfile.enabled">
            <span class="switch-slider"></span>
          </label>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:var(--space-md);">
          <div>
            <div style="font-weight:600;font-size:0.9rem;">Auto-Search Missing Audio</div>
            <div style="font-size:0.78rem;color:var(--text-muted);">Trigger search in child instance if target audio is missing after delay</div>
          </div>
          <label class="switch">
            <input type="checkbox" [(ngModel)]="currentProfile.searchIfMissing">
            <span class="switch-slider"></span>
          </label>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:var(--space-md);">
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

      <div style="display:flex;justify-content:flex-end;gap:var(--space-sm);margin-top:var(--space-xl);">
        <button class="btn btn-ghost" (click)="cancelForm()">Cancel</button>
        <button class="btn btn-primary" (click)="saveProfile()">
          {{ editingProfileId ? 'Update Profile' : 'Save Sync Profile' }}
        </button>
      </div>
    </div>

    <!-- Profiles List -->
    <div *ngIf="profiles.length === 0 && !showForm" class="empty-state">
      <div class="empty-state-icon">🔄</div>
      <h3 class="empty-state-title">No Sync Profiles Configured</h3>
      <p class="empty-state-text">Create a profile to link your main and child *arr instances.</p>
      <button class="btn btn-primary" (click)="openAddProfile()">Create First Profile</button>
    </div>

    <div class="instance-list" *ngIf="profiles.length > 0">
      <div class="instance-item" *ngFor="let profile of profiles">
        <div class="instance-item-info">
          <div class="instance-item-icon" style="background:rgba(167,139,250,0.2);color:#a78bfa;">
            🔄
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:var(--space-sm);flex-wrap:wrap;">
              <span style="font-weight:600;font-size:1.05rem;">
                {{ profile.mainInstance?.name || 'Main' }} ➔ {{ profile.childInstance?.name || 'Child' }}
              </span>
              <span class="badge" [ngClass]="profile.enabled ? 'badge-success' : 'badge-muted'">
                {{ profile.enabled ? '✓ Active' : '⏸ Paused' }}
              </span>
            </div>
            <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px;">
              Link Strategy: <span class="badge badge-info">{{ profile.linkType }}</span> &bull;
              Delay: {{ profile.delayHours }}h &bull;
              Search: {{ profile.searchIfMissing ? 'Enabled' : 'Disabled' }}
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
          <button class="btn btn-secondary btn-sm" (click)="triggerScan(profile.id)" [disabled]="!profile.enabled">
            Scan Now
          </button>
          <button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" (click)="deleteProfile(profile.id)">
            Delete
          </button>
        </div>
      </div>
    </div>
  `,
})
export class SyncProfilesComponent implements OnInit {
  profiles: SyncProfile[] = [];
  instances: Instance[] = [];
  showForm = false;
  editingProfileId: number | null = null;

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
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.api.getSyncProfiles().subscribe({
      next: (res) => {
        this.profiles = res || [];
        this.cdr.detectChanges();
      },
      error: () => {
        this.profiles = [];
        this.cdr.detectChanges();
      }
    });

    this.api.getInstances().subscribe({
      next: (res) => {
        this.instances = res || [];
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
    this.showForm = true;
    this.cdr.detectChanges();
  }

  editProfile(profile: SyncProfile) {
    this.editingProfileId = profile.id;
    this.currentProfile = { ...profile };
    this.showForm = true;
    this.cdr.detectChanges();
  }

  cancelForm() {
    this.showForm = false;
    this.editingProfileId = null;
    this.cdr.detectChanges();
  }

  saveProfile() {
    if (!this.currentProfile.mainInstanceId || !this.currentProfile.childInstanceId) {
      alert('Please select both Main and Child instances.');
      return;
    }

    if (this.editingProfileId) {
      this.api.updateSyncProfile(this.editingProfileId, this.currentProfile).subscribe({
        next: () => {
          this.cancelForm();
          this.loadAll();
        },
        error: (err) => {
          alert('Failed to update sync profile: ' + (err.error?.error || err.message));
        },
      });
    } else {
      this.api.createSyncProfile(this.currentProfile).subscribe({
        next: () => {
          this.cancelForm();
          this.loadAll();
        },
        error: (err) => {
          alert('Failed to create sync profile: ' + (err.error?.error || err.message));
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
        this.loadAll();
      },
      error: (err) => {
        profile.enabled = !updatedStatus;
        this.cdr.detectChanges();
        alert('Failed to update sync profile status: ' + (err.error?.error || err.message));
      }
    });
  }

  deleteProfile(id: number) {
    if (confirm('Delete this sync profile?')) {
      this.api.deleteSyncProfile(id).subscribe({
        next: () => {
          this.profiles = this.profiles.filter(p => p.id !== id);
          this.cdr.detectChanges();
          this.loadAll();
        },
        error: (err) => {
          alert('Failed to delete sync profile: ' + (err.error?.error || err.message));
        }
      });
    }
  }

  triggerScan(profileId: number) {
    this.api.triggerScan(profileId).subscribe({
      next: () => alert('Scan started successfully!'),
      error: () => alert('Failed to start scan'),
    });
  }
}
