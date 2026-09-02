import { Component, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Instance, RootFolder, QualityProfile } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { PathBrowserComponent } from '../path-browser/path-browser.component';

export function normalizeUrl(url: string): string {
  let normalized = (url || '').trim();
  if (!normalized) return '';
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `http://${normalized}`;
  }
  normalized = normalized.replace(/\/+$/, '');
  normalized = normalized.replace(/\/api(\/v\d+)?$/i, '');
  return normalized;
}

@Component({
  selector: 'app-instance-form',
  standalone: true,
  imports: [CommonModule, FormsModule, PathBrowserComponent],
  template: `
    <div class="card mb-md">
      <div class="flex-between mb-md">
        <div class="flex-align-center gap-sm">
          <img [src]="formData.type === 'radarr' ? 'radarr.svg' : 'sonarr.svg'" [alt]="typeLabel" class="instance-logo-sm" />
          <h4 class="text-semibold m-0">{{ isEditing ? 'Edit' : 'Add' }} {{ typeLabel }} Instance</h4>
        </div>
        <button class="btn btn-ghost btn-sm" (click)="cancel.emit()" *ngIf="showCancel">✕</button>
      </div>

      <!-- Type selector — only shown when fixedType is not set -->
      <div class="form-group" *ngIf="!fixedType">
        <label class="form-label" for="instance-type">Type</label>
        <select class="form-select" [(ngModel)]="formData.type" id="instance-type" [disabled]="isEditing">
          <option value="radarr">Radarr (Movies)</option>
          <option value="sonarr">Sonarr (Series)</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="instance-name">Name</label>
        <input class="form-input" [(ngModel)]="formData.name" id="instance-name" [placeholder]="namePlaceholder" />
      </div>

      <div class="form-group">
        <label class="form-label" for="instance-url">Host / URL</label>
        <input
          class="form-input"
          [(ngModel)]="formData.url"
          (blur)="onUrlBlur()"
          id="instance-url"
          [placeholder]="urlPlaceholder"
        />
        <p class="text-xs text-muted mt-xs">
          e.g. <code>192.168.1.100:7878</code> or <code>http://radarr.local:7878</code>
        </p>
      </div>

      <div class="form-group">
        <label class="form-label" for="instance-apikey">API Key</label>
        <div class="password-toggle-wrapper">
          <input
            class="form-input password-toggle-input"
            [type]="hideApiKey ? 'password' : 'text'"
            [(ngModel)]="formData.apiKey"
            id="instance-apikey"
            placeholder="Found in Settings → General → Security"
          />
          <button
            type="button"
            class="btn btn-ghost btn-sm password-toggle-btn"
            (click)="hideApiKey = !hideApiKey"
          >
            {{ hideApiKey ? '👁️' : '🔒' }}
          </button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="instance-language">Primary Audio Language</label>
        <select class="form-select" [(ngModel)]="formData.language" id="instance-language">
          <option value="en">English 🇬🇧</option>
          <option value="fr">French 🇫🇷</option>
          <option value="de">German 🇩🇪</option>
          <option value="es">Spanish 🇪🇸</option>
          <option value="it">Italian 🇮🇹</option>
          <option value="ja">Japanese 🇯🇵</option>
        </select>
      </div>

      <!-- Source of Truth checkbox: only visible when not explicitly fixed -->
      <div *ngIf="fixedIsMain === undefined" class="mb-md">
        <div class="flex-align-center gap-sm">
          <input type="checkbox" id="isMainCheck" [(ngModel)]="formData.isMain" class="cursor-pointer" />
          <label for="isMainCheck" class="cursor-pointer text-medium">
            Source of Truth Instance (Main library)
          </label>
        </div>
        <p class="form-hint mt-xs">
          Designates this as your primary library (e.g. English). Polyarr monitors this server for new downloads to sync, hardlink, and coordinate with secondary child instances.
        </p>
      </div>

      <!-- Live Test Result Banner -->
      <div *ngIf="testResult" class="connection-test" [ngClass]="testResult.success ? 'success' : 'failure'">
        <span *ngIf="testResult.success">✓ Connected successfully</span>
        <span *ngIf="testResult.success && testResult.version"> — v{{ testResult.version }}</span>
        <span *ngIf="testResult.success && testResult.instanceName"> ({{ testResult.instanceName }})</span>
        <span *ngIf="!testResult.success">✕ Failed: {{ testResult.error }}</span>
      </div>

      <div *ngIf="isTesting" class="connection-test testing">
        <span class="spinner"></span> Testing connection & discovering server settings...
      </div>

      <!-- Server Settings (Root Folder & Quality Profile) -->
      <div *ngIf="isEditing || testResult?.success || rootFolders.length > 0 || qualityProfiles.length > 0 || formData.rootFolderPath" class="settings-subpanel">
        <div class="settings-subpanel-title">
          ⚙️ Server Settings
        </div>

        <div class="form-group" [ngClass]="formData.isMain ? 'mb-0' : 'mb-sm'">
          <label class="form-label">Root Media Folder</label>
          @if (rootFolders.length > 0) {
            <select class="form-select" [(ngModel)]="formData.rootFolderPath">
              @for (folder of rootFolders; track folder.id) {
                <option [value]="folder.path">{{ folder.path }}</option>
              }
              <option *ngIf="formData.rootFolderPath && !hasRootFolder(formData.rootFolderPath)" [value]="formData.rootFolderPath">{{ formData.rootFolderPath }}</option>
            </select>
          } @else {
            <input class="form-input" [(ngModel)]="formData.rootFolderPath" placeholder="e.g. /data/media/movies" />
          }
          <p class="form-hint">
            The media root directory configured in this *Arr instance where files are located.
          </p>
        </div>

        <div class="form-group mb-0" *ngIf="!formData.isMain">
          <label class="form-label">Quality Profile</label>
          @if (qualityProfiles.length > 0) {
            <select class="form-select" [(ngModel)]="formData.qualityProfileId">
              @for (profile of qualityProfiles; track profile.id) {
                <option [value]="profile.id">{{ profile.name }}</option>
              }
              <option *ngIf="formData.qualityProfileId && !hasQualityProfile(formData.qualityProfileId)" [value]="formData.qualityProfileId">Profile #{{ formData.qualityProfileId }}</option>
            </select>
          } @else {
            <input class="form-input" type="number" [(ngModel)]="formData.qualityProfileId" placeholder="1" />
          }
          <p class="form-hint">
            The quality profile assigned when Polyarr adds new movies or series to this child instance (e.g. for hardlinking or indexer searches).
          </p>
        </div>
      </div>

      <!-- Polyarr Local Path -->
      <div *ngIf="isEditing || testResult?.success || formData.rootFolderPath || formData.localPath || rootFolders.length > 0" class="settings-subpanel">
        <div class="settings-subpanel-title">
          📂 Polyarr's Local Path
        </div>
        <app-path-browser
          [currentPath]="formData.localPath || ''"
          (currentPathChange)="formData.localPath = $event"
          placeholder="/path/to/media"
          hint="The directory on Polyarr's server where this instance's media is accessible. Usually matches the Root Folder above. Change only if Polyarr mounts the media at a different path."
        ></app-path-browser>
      </div>

      <!-- Actions -->
      <div class="flex-end gap-sm mt-lg">
        <button class="btn btn-ghost" (click)="cancel.emit()" *ngIf="showCancel" type="button">
          Cancel
        </button>
        <button class="btn btn-secondary" (click)="testConnection()" [disabled]="isTesting || !hasMinFields" id="test-connection-btn" type="button">
          Test Connection
        </button>
        <button class="btn btn-primary" (click)="save()" [disabled]="!isValid" id="save-instance-btn" type="button">
          {{ isEditing ? 'Update' : 'Add' }} Instance
        </button>
      </div>
    </div>
  `,
})
export class InstanceFormComponent {
  @Input() isEditing = false;
  @Input() showCancel = true;

  @Input() set fixedIsMain(val: boolean | undefined) {
    this._fixedIsMain = val;
    if (val !== undefined) {
      this.formData.isMain = val;
    }
  }
  get fixedIsMain(): boolean | undefined {
    return this._fixedIsMain;
  }
  private _fixedIsMain: boolean | undefined;

  @Input() set fixedType(val: 'radarr' | 'sonarr' | undefined) {
    this._fixedType = val;
    if (val) {
      this.formData.type = val;
    }
  }
  get fixedType(): 'radarr' | 'sonarr' | undefined {
    return this._fixedType;
  }
  private _fixedType: 'radarr' | 'sonarr' | undefined;

  @Input() set instance(val: Instance | null) {
    if (val) {
      this.formData = { ...val };
      if (!this.formData.localPath && this.formData.rootFolderPath) {
        this.formData.localPath = this.formData.rootFolderPath;
      }
      this.isEditing = true;
      this.fetchMetadata();
    }
  }

  hasRootFolder(path: string): boolean {
    return this.rootFolders.some(f => f.path === path);
  }

  hasQualityProfile(id: number | undefined): boolean {
    if (id === undefined) return false;
    return this.qualityProfiles.some(p => p.id === id);
  }

  @Output() saved = new EventEmitter<Partial<Instance>>();
  @Output() cancel = new EventEmitter<void>();

  formData: Partial<Instance> = {
    type: 'radarr',
    name: '',
    url: '',
    apiKey: '',
    language: 'en',
    rootFolderPath: '',
    localPath: '',
    qualityProfileId: 1,
    isMain: false,
  };

  testResult: { success: boolean; version?: string; instanceName?: string; error?: string } | null = null;
  isTesting = false;
  hideApiKey = true;
  rootFolders: RootFolder[] = [];
  qualityProfiles: QualityProfile[] = [];

  constructor(
    private api: ApiService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService
  ) {}

  get isValid(): boolean {
    return !!(this.formData.type && this.formData.name && this.formData.url && this.formData.apiKey);
  }

  get hasMinFields(): boolean {
    return !!(this.formData.type && this.formData.url && this.formData.apiKey);
  }

  get typeLabel(): string {
    return this.formData.type === 'radarr' ? 'Radarr' : 'Sonarr';
  }

  get namePlaceholder(): string {
    return this.formData.type === 'radarr' ? 'e.g. Radarr Main / Radarr 4K' : 'e.g. Sonarr Main / Sonarr Anime';
  }

  get urlPlaceholder(): string {
    return this.formData.type === 'radarr' ? '192.168.1.100:7878' : '192.168.1.100:8989';
  }

  onUrlBlur() {
    if (this.formData.url) {
      this.formData.url = normalizeUrl(this.formData.url);
    }
  }

  testConnection() {
    if (!this.hasMinFields) return;
    this.onUrlBlur();
    this.isTesting = true;
    this.testResult = null;
    this.cdr.detectChanges();

    this.api.testDirectConnection({
      type: this.formData.type || 'radarr',
      url: this.formData.url || '',
      apiKey: this.formData.apiKey || '',
    }).subscribe({
      next: (res: any) => {
        this.isTesting = false;
        this.testResult = res;
        if (res.url) {
          this.formData.url = res.url;
        }
        if (res.success) {
          this.toast.success(`Connected to ${this.typeLabel} successfully${res.version ? ' (v' + res.version + ')' : ''}`);
          this.fetchMetadata();
        } else {
          this.toast.error(`Connection failed: ${res.error || 'Unknown error'}`);
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isTesting = false;
        const errMsg = err.error?.error || err.message || 'Connection failed';
        this.testResult = { success: false, error: errMsg };
        this.toast.error(`Connection failed: ${errMsg}`);
        this.cdr.detectChanges();
      },
    });
  }

  fetchMetadata() {
    const { type, url, apiKey } = this.formData;
    if (!type || !url || !apiKey) return;

    this.api.fetchDirectRootFolders({ type, url, apiKey }).subscribe({
      next: (folders) => {
        this.rootFolders = folders || [];
        if (this.rootFolders.length > 0 && !this.formData.rootFolderPath) {
          this.formData.rootFolderPath = this.rootFolders[0].path;
        }
        // Pre-populate localPath from rootFolderPath if not already set
        if (this.rootFolders.length > 0 && !this.formData.localPath) {
          this.formData.localPath = this.formData.rootFolderPath;
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.cdr.detectChanges();
      },
    });

    this.api.fetchDirectQualityProfiles({ type, url, apiKey }).subscribe({
      next: (profiles) => {
        this.qualityProfiles = profiles || [];
        if (this.qualityProfiles.length > 0 && !this.formData.qualityProfileId) {
          this.formData.qualityProfileId = this.qualityProfiles[0].id;
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.cdr.detectChanges();
      },
    });
  }

  save() {
    this.onUrlBlur();
    if (!this.isValid) return;
    this.saved.emit({ ...this.formData });
  }
}
