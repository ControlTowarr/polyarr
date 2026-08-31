import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { SyncHistoryEntry } from '../../core/models';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Sync History Logs</h1>
        <p class="page-subtitle">Real-time audit log of hardlinks created, audio scans, searches triggered, and errors</p>
      </div>
      <button class="btn btn-secondary btn-sm" (click)="loadHistory()" [disabled]="isLoading">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
        </svg>
        {{ isLoading ? 'Refreshing...' : 'Refresh Logs' }}
      </button>
    </div>

    <!-- Filter Pills -->
    <div style="display:flex;gap:var(--space-sm);flex-wrap:wrap;margin-bottom:var(--space-lg);">
      <button
        class="filter-pill"
        [class.active]="selectedAction === ''"
        (click)="filterByAction('')"
      >
        All Actions ({{ totalCount }})
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
      <div *ngIf="isLoading" style="display:flex;justify-content:center;padding:var(--space-xl);">
        <span class="spinner" style="width:32px;height:32px;"></span>
      </div>

      <div *ngIf="!isLoading && history.length === 0" class="empty-state" style="padding:var(--space-xl);">
        <div style="font-size:2rem;margin-bottom:var(--space-sm);">📋</div>
        <p class="empty-state-text">No sync history logs recorded yet.</p>
        <p style="font-size:0.8rem;color:var(--text-muted);">
          Logs are automatically recorded when library scans run or webhooks receive download events.
        </p>
      </div>

      <div style="overflow-x:auto;" *ngIf="!isLoading && history.length > 0">
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
              <td style="font-size:0.8rem;color:var(--text-muted);white-space:nowrap;">{{ formatDate(item.createdAt) }}</td>
              <td style="font-weight:600;">{{ item.mediaTitle }}</td>
              <td>
                <span class="badge" [ngClass]="item.mediaType === 'movie' ? 'badge-radarr' : 'badge-sonarr'">
                  {{ item.mediaType | uppercase }}
                </span>
              </td>
              <td>
                <span class="badge" [ngClass]="{
                  'badge-success': item.action === 'linked' || item.action === 'added',
                  'badge-info': item.action === 'search_triggered',
                  'badge-warning': item.action === 'season_monitored',
                  'badge-danger': item.action === 'error'
                }">
                  {{ item.action }}
                </span>
              </td>
              <td style="font-size:0.85rem;color:var(--text-secondary);max-width:400px;word-break:break-word;">
                {{ item.details }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class HistoryComponent implements OnInit {
  history: SyncHistoryEntry[] = [];
  isLoading = true;
  totalCount = 0;
  selectedAction = '';

  constructor(
    private api: ApiService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadHistory();
  }

  filterByAction(action: string) {
    this.selectedAction = action;
    this.loadHistory();
  }

  loadHistory() {
    this.isLoading = true;
    this.cdr.markForCheck();

    this.api.getHistory({
      limit: 100,
      action: this.selectedAction || undefined,
    }).subscribe({
      next: (res: any) => {
        this.history = res?.data || res?.items || (Array.isArray(res) ? res : []);
        this.totalCount = res?.total ?? this.history.length;
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

  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  }
}
