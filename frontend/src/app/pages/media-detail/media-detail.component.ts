import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { ApiService } from '../../core/services/api.service';
import { MediaItemDetail } from '../../core/models';

@Component({
  selector: 'app-media-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div *ngIf="isLoading" style="display:flex;justify-content:center;padding:var(--space-2xl);">
      <span class="spinner" style="width:40px;height:40px;border-width:3px;"></span>
    </div>

    <div *ngIf="!isLoading && media" class="detail-container">
      <div style="margin-bottom:var(--space-md);">
        <button (click)="goBack()" class="btn btn-ghost btn-sm" style="cursor:pointer;">← Back to Dashboard</button>
      </div>

      <!-- Hero Section -->
      <div class="detail-hero">
        <img
          *ngIf="media.posterUrl"
          [src]="media.posterUrl"
          [alt]="media.title"
          class="detail-poster"
          (error)="media.posterUrl = ''"
        />
        <div *ngIf="!media.posterUrl" class="detail-poster" style="aspect-ratio:2/3;background:var(--bg-card);display:flex;align-items:center;justify-content:center;font-size:3rem;">
          {{ media.mediaType === 'movie' ? '🎬' : '📺' }}
        </div>

        <div class="detail-info">
          <div style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:var(--space-xs);">
            <span class="badge" [ngClass]="media.mediaType === 'movie' ? 'badge-radarr' : 'badge-sonarr'">
              {{ media.mediaType === 'movie' ? 'Movie' : 'Series' }}
            </span>
            <span style="color:var(--text-muted);font-size:0.9rem;">{{ media.year }}</span>
          </div>

          <h1 class="detail-title">{{ media.title }}</h1>
          <p class="detail-overview">{{ media.overview || 'No overview available for this title.' }}</p>
        </div>
      </div>

      <!-- Cross-Instance Status Table -->
      <div class="detail-section">
        <h3 class="detail-section-title">Instance Status</h3>
        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Instance</th>
                <th>Language</th>
                <th>Status</th>
                <th>Sync Method</th>
                <th>Audio Tracks</th>
                <th>File Path</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let inst of media.instances">
                <td style="font-weight:600;">{{ inst.instance?.name || 'Instance #' + inst.instanceId }}</td>
                <td><span class="badge badge-muted">{{ (inst.instance?.language || 'en') | uppercase }}</span></td>
                <td>
                  <span class="badge" [ngClass]="{
                    'badge-success': inst.status === 'available',
                    'badge-warning': inst.status === 'monitored',
                    'badge-danger': inst.status === 'missing'
                  }">{{ inst.status }}</span>
                </td>
                <td>
                  <span *ngIf="inst.syncMethod === 'linked'" class="badge badge-success">🔗 Hardlink/Symlink</span>
                  <span *ngIf="inst.syncMethod === 'downloaded'" class="badge badge-warning">⬇️ Downloaded</span>
                  <span *ngIf="!inst.syncMethod || inst.syncMethod === 'not_synced'" class="badge badge-muted">Unsynced</span>
                </td>
                <td>
                  <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    <span *ngFor="let lang of inst.audioLanguages" class="badge badge-info" style="font-size:0.7rem;">
                      {{ lang | uppercase }}
                    </span>
                    <span *ngIf="!inst.audioLanguages || inst.audioLanguages.length === 0" style="color:var(--text-muted);font-size:0.8rem;">
                      None
                    </span>
                  </div>
                </td>
                <td style="font-size:0.8rem;color:var(--text-muted);max-width:300px;overflow:hidden;text-overflow:ellipsis;" [title]="inst.filePath || ''">
                  {{ inst.filePath || '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Sync History Section -->
      <div class="detail-section" *ngIf="media.syncHistory && media.syncHistory.length > 0">
        <h3 class="detail-section-title">Sync History</h3>
        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Details</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let hist of media.syncHistory">
                <td>
                  <span class="badge" [ngClass]="getActionBadgeClass(hist.action)">
                    {{ getActionLabel(hist.action) }}
                  </span>
                </td>
                <td style="font-size:0.85rem;color:var(--text-secondary);">{{ hist.details }}</td>
                <td style="font-size:0.8rem;color:var(--text-muted);">{{ formatDate(hist.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class MediaDetailComponent implements OnInit {
  media: MediaItemDetail | null = null;
  isLoading = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private api: ApiService,
    private cdr: ChangeDetectorRef,
    private titleService: Title
  ) {}

  ngOnInit() {
    window.scrollTo({ top: 0, behavior: 'instant' });
    this.route.params.subscribe(params => {
      const id = +params['id'];
      if (id) {
        this.isLoading = true;
        this.cdr.markForCheck();
        this.api.getMediaItem(id).subscribe({
          next: (media) => {
            this.media = media;
            this.isLoading = false;
            if (media?.title) {
              const yearPart = media.year ? ` (${media.year})` : '';
              this.titleService.setTitle(`${media.title}${yearPart} - Polyarr`);
            }
            this.cdr.detectChanges();
          },
          error: () => {
            this.media = null;
            this.isLoading = false;
            this.cdr.detectChanges();
          },
        });
      }
    });
  }

  goBack() {
    if (window.history.length > 1) {
      this.location.back();
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
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
