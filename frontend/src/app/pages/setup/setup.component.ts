import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { Instance, SyncProfile } from '../../core/models';
import { InstanceFormComponent } from '../../components/instance-form/instance-form.component';
import { PathBrowserComponent } from '../../components/path-browser/path-browser.component';

interface SetupStep {
  id: string;
  label: string;
  description: string;
  required: boolean;
}

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, InstanceFormComponent, PathBrowserComponent],
  template: `
    <div class="setup-container">
      <!-- Header -->
      <div style="text-align:center;margin-bottom:var(--space-2xl);">
        <div style="margin-bottom:var(--space-md);display:inline-block;">
          <img src="logo.png" alt="Polyarr Logo" style="width:72px;height:72px;border-radius:18px;object-fit:cover;box-shadow:0 0 24px rgba(62,203,240,0.35);" />
        </div>
        <h1 class="page-title" style="font-size:2.2rem;">Welcome to Polyarr</h1>
        <p class="page-subtitle" style="max-width:520px;margin:auto;">
          Connect your Radarr & Sonarr instances to automate multi-language audio synchronization, hardlinking, and monitoring.
        </p>
      </div>

      <!-- Progress dots -->
      <div class="setup-progress">
        <div
          *ngFor="let step of steps; let i = index"
          class="setup-progress-dot"
          [class.active]="currentStep === i"
          [class.completed]="currentStep > i"
        ></div>
      </div>

      <!-- Step 1: Main Radarr / Sonarr Instances -->
      <div class="setup-step" *ngIf="currentStep === 0">
        <div class="setup-step-header">
          <div class="setup-step-number">1</div>
          <div>
            <div class="setup-step-title">Connect Main Instance (Source of Truth)</div>
            <p style="font-size:0.85rem;color:var(--text-secondary);">
              This is your primary library (e.g. English). Polyarr monitors this server for new downloads.
            </p>
          </div>
        </div>

        <div *ngIf="mainInstances.length > 0" style="margin-bottom:var(--space-md);">
          <div *ngFor="let inst of mainInstances" class="instance-item" style="margin-bottom:var(--space-sm);">
            <div class="instance-item-info">
              <div class="instance-item-icon" [style.background]="getIconBg(inst.type)">
                {{ inst.type === 'radarr' ? 'R' : 'S' }}
              </div>
              <div>
                <div style="font-weight:600;">{{ inst.name }}</div>
                <div style="font-size:0.8rem;color:var(--text-muted);">{{ inst.url }}</div>
              </div>
            </div>
            <span class="badge badge-success">✓ Main Connected</span>
          </div>
        </div>

        <app-instance-form
          [fixedIsMain]="true"
          [showCancel]="false"
          (saved)="onInstanceSaved($event)"
        ></app-instance-form>

        <div style="display:flex;justify-content:flex-end;margin-top:var(--space-md);">
          <button
            class="btn btn-primary"
            (click)="nextStep()"
            [disabled]="mainInstances.length === 0"
          >
            Continue to Child Instances →
          </button>
        </div>
      </div>

      <!-- Step 2: Child Instances -->
      <div class="setup-step" *ngIf="currentStep === 1">
        <div class="setup-step-header">
          <div class="setup-step-number">2</div>
          <div>
            <div class="setup-step-title">Connect Child Instances</div>
            <p style="font-size:0.85rem;color:var(--text-secondary);">
              Add secondary language instances (e.g. Radarr French / Sonarr Anime) that will link from the main library.
            </p>
          </div>
        </div>

        <div *ngIf="childInstances.length > 0" style="margin-bottom:var(--space-md);">
          <div *ngFor="let inst of childInstances" class="instance-item" style="margin-bottom:var(--space-sm);">
            <div class="instance-item-info">
              <div class="instance-item-icon" [style.background]="getIconBg(inst.type)">
                {{ inst.type === 'radarr' ? 'R' : 'S' }}
              </div>
              <div>
                <div style="font-weight:600;">{{ inst.name }} ({{ (inst.language || 'en') | uppercase }})</div>
                <div style="font-size:0.8rem;color:var(--text-muted);">{{ inst.url }}</div>
              </div>
            </div>
            <span class="badge badge-success">✓ Added</span>
          </div>
        </div>

        <app-instance-form
          [fixedIsMain]="false"
          [showCancel]="false"
          (saved)="onInstanceSaved($event)"
        ></app-instance-form>

        <div style="display:flex;justify-content:space-between;margin-top:var(--space-md);">
          <button class="btn btn-ghost" (click)="prevStep()">← Back</button>
          <button
            class="btn btn-primary"
            (click)="nextStep()"
            [disabled]="childInstances.length === 0"
          >
            Configure Sync Strategy →
          </button>
        </div>
      </div>

      <!-- Step 3: Configure Sync Profile -->
      <div class="setup-step" *ngIf="currentStep === 2">
        <div class="setup-step-header">
          <div class="setup-step-number">3</div>
          <div>
            <div class="setup-step-title">Configure Sync Strategy</div>
            <p style="font-size:0.85rem;color:var(--text-secondary);">
              Choose how media files link between instances and configure automation preferences.
            </p>
          </div>
        </div>

        <div class="card">
          <!-- Detected Sync Pair Summary -->
          @if (mainInstances.length === 1 && childInstances.length === 1) {
            <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:var(--space-md);display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-lg);">
              <div>
                <div style="font-weight:600;font-size:1rem;">
                  {{ mainInstances[0].name }} ➔ {{ childInstances[0].name }}
                </div>
                <div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">
                  Main Library ({{ (mainInstances[0].language || 'en') | uppercase }}) ➔ Child Library ({{ (childInstances[0].language || 'en') | uppercase }})
                </div>
              </div>
              <span class="badge badge-info">Auto-Linked</span>
            </div>
          } @else {
            <div class="form-group">
              <label class="form-label">Main Instance (Source)</label>
              <select class="form-select" [(ngModel)]="newProfile.mainInstanceId">
                <option *ngFor="let inst of mainInstances" [value]="inst.id">{{ inst.name }} ({{ inst.type | titlecase }})</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Child Instance (Target)</label>
              <select class="form-select" [(ngModel)]="newProfile.childInstanceId">
                <option *ngFor="let inst of childInstances" [value]="inst.id">{{ inst.name }} ({{ (inst.language || 'en') | uppercase }})</option>
              </select>
            </div>
          }

          <div class="form-group">
            <label class="form-label">Linking Method</label>
            <select class="form-select" [(ngModel)]="newProfile.linkType">
              <option value="hardlink">Hardlink (Instant, 0 extra disk space, same disk/pool)</option>
              <option value="symlink">Symlink (Cross-filesystem compatible)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Delay Before Child Search (Hours)</label>
            <input class="form-input" type="number" [(ngModel)]="newProfile.delayHours" min="0" max="720" />
            <p class="form-hint">
              Hours to wait before triggering a fallback search on the child instance. Gives the parent instance time to download and import its multi-audio file first. If multi-audio is detected, it is hardlinked immediately with zero delay.
            </p>
          </div>

          <!-- Modern Switch Controls -->
          <!-- Consistent Modern Switch Controls -->
          <div style="display:flex;flex-direction:column;gap:var(--space-sm);margin-top:var(--space-md);">
            <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:var(--space-md);">
              <div>
                <div style="font-weight:600;font-size:0.9rem;">Enable Active Scanning & Syncing</div>
                <div style="font-size:0.78rem;color:var(--text-muted);">Include this profile in automated background syncs, library scans, and webhook imports</div>
              </div>
              <label class="switch">
                <input type="checkbox" [(ngModel)]="newProfile.enabled">
                <span class="switch-slider"></span>
              </label>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:var(--space-md);">
              <div>
                <div style="font-weight:600;font-size:0.9rem;">Auto-Search Missing Audio</div>
                <div style="font-size:0.78rem;color:var(--text-muted);">Automatically search indexers for secondary audio if missing on main. When off, missing audio items are ignored (no-op) and only matching files are linked.</div>
              </div>
              <label class="switch">
                <input type="checkbox" [(ngModel)]="newProfile.searchIfMissing">
                <span class="switch-slider"></span>
              </label>
            </div>

            <div *ngIf="isSonarrProfile()" style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:var(--space-md);">
              <div>
                <div style="font-weight:600;font-size:0.9rem;">Sync Monitored Seasons</div>
                <div style="font-size:0.78rem;color:var(--text-muted);">Keep season monitor status synchronized across Sonarr instances (Sonarr only)</div>
              </div>
              <label class="switch">
                <input type="checkbox" [(ngModel)]="newProfile.syncMonitoredSeasons">
                <span class="switch-slider"></span>
              </label>
            </div>
          </div>

          <!-- Optional Advanced Path Overrides -->
          <div style="margin-top:var(--space-md);background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:var(--space-md);">
            <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;" (click)="showPathOverrides = !showPathOverrides">
              <span style="font-size:0.88rem;font-weight:600;color:var(--text-secondary);">
                ⚙️ Path Overrides (Optional)
              </span>
              <span style="font-size:0.8rem;color:var(--accent-primary);">{{ showPathOverrides ? '▲ Hide' : '▼ Expand' }}</span>
            </div>
            
            <div *ngIf="showPathOverrides" style="margin-top:var(--space-md);display:flex;flex-direction:column;gap:var(--space-md);">
              <app-path-browser
                label="Source Media Path Override (Main)"
                [currentPath]="newProfile.mainPath || ''"
                (currentPathChange)="newProfile.mainPath = $event"
                placeholder="Leave blank to use instance default"
                hint="Only customize if this sync profile requires a custom source root folder."
              ></app-path-browser>

              <app-path-browser
                label="Target Media Path Override (Child)"
                [currentPath]="newProfile.childPath || ''"
                (currentPathChange)="newProfile.childPath = $event"
                placeholder="Leave blank to use instance default"
                hint="Only customize if this sync profile requires a custom target root folder."
              ></app-path-browser>
            </div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;margin-top:var(--space-xl);">
          <button class="btn btn-ghost" (click)="prevStep()">← Back</button>
          <button class="btn btn-primary" (click)="finishSetup()" id="finish-setup-btn">
            Finish Setup & Launch Dashboard 🚀
          </button>
        </div>
      </div>
    </div>
  `,
})
export class SetupComponent implements OnInit {
  steps: SetupStep[] = [
    { id: 'main', label: 'Main Instance', description: 'Primary *arr server', required: true },
    { id: 'child', label: 'Child Instances', description: 'Secondary language instances', required: true },
    { id: 'profile', label: 'Sync Strategy', description: 'Linking and delay preferences', required: true },
  ];

  currentStep = 0;
  instances: Instance[] = [];
  showPathOverrides = false;

  newProfile: Partial<SyncProfile> = {
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
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadInstances();
  }

  loadInstances() {
    this.api.getInstances().subscribe({
      next: (instances) => {
        this.instances = instances || [];
        if (this.mainInstances.length > 0 && !this.newProfile.mainInstanceId) {
          this.newProfile.mainInstanceId = this.mainInstances[0].id;
        }
        if (this.childInstances.length > 0 && !this.newProfile.childInstanceId) {
          this.newProfile.childInstanceId = this.childInstances[0].id;
        }
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
    const main = this.instances.find(i => i.id === Number(this.newProfile.mainInstanceId));
    return main?.type === 'sonarr';
  }

  onInstanceSaved(data: Partial<Instance>) {
    this.api.createInstance(data).subscribe({
      next: () => {
        this.loadInstances();
      },
    });
  }

  nextStep() {
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
      this.cdr.detectChanges();
    }
  }

  prevStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.cdr.detectChanges();
    }
  }

  finishSetup() {
    if (this.newProfile.mainInstanceId && this.newProfile.childInstanceId) {
      const payload = {
        ...this.newProfile,
        syncMonitoredSeasons: this.isSonarrProfile() ? (this.newProfile.syncMonitoredSeasons ?? false) : false
      };
      this.api.createSyncProfile(payload).subscribe({
        next: (profile) => {
          this.completeSetupAndRedirect(profile.id);
        },
        error: () => {
          this.completeSetupAndRedirect();
        },
      });
    } else {
      this.completeSetupAndRedirect();
    }
  }

  private completeSetupAndRedirect(profileId?: number) {
    this.api.updateSettings({ setup_completed: true }).subscribe({
      next: () => {
        if (profileId) {
          this.api.triggerScan(profileId).subscribe();
        }
        this.router.navigate(['/dashboard']);
      },
    });
  }

  getIconBg(type: string): string {
    return type === 'radarr' ? 'rgba(255,165,0,0.2)' : 'rgba(62,203,240,0.2)';
  }
}
