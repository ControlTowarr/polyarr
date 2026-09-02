import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ChangeDetectorRef,
  ElementRef,
  ViewChild,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { MediaItem, MediaStats, SyncProfile } from '../../core/models';
import { MediaCardComponent } from '../../components/media-card/media-card.component';
import { FilterBarComponent, FilterState } from '../../components/filter-bar/filter-bar.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, MediaCardComponent, FilterBarComponent],
  template: `
    <div class="top-header">
      <div>
        <h1 class="page-title">Media Library Dashboard</h1>
        <p class="page-subtitle">
          {{ totalItems }} main library items &bull; {{ stats?.syncedCount || 0 }} synced &bull; {{ stats?.mainOnlyCount || 0 }} main only
        </p>
      </div>

      <div style="display:flex;align-items:center;gap:var(--space-md);">
        <div class="sync-indicator">
          <span class="sync-dot" [class.syncing]="isScanning"></span>
          {{ isScanning ? 'Discovering Media...' : 'Ready' }}
        </div>
        <button class="btn btn-secondary btn-sm" (click)="triggerLibraryDiscovery()" [disabled]="isScanning" id="scan-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
          {{ isScanning ? 'Discovering...' : 'Scan Libraries' }}
        </button>
      </div>
    </div>

    <!-- Filter Bar -->
    <app-filter-bar
      [filters]="filters"
      (filtersChange)="onFiltersChange($event)"
    ></app-filter-bar>

    <!-- Initial Loading State -->
    <div *ngIf="isLoading" style="display:flex;justify-content:center;padding:var(--space-2xl);">
      <span class="spinner" style="width:40px;height:40px;border-width:3px;"></span>
    </div>

    <!-- Empty State -->
    <div *ngIf="!isLoading && mediaItems.length === 0" class="empty-state">
      <div class="empty-state-icon">🎬</div>
      <h3 class="empty-state-title">No Media Discovered Yet</h3>
      <p class="empty-state-text">
        <ng-container *ngIf="hasFilters; else noFilters">
          No media items match your search or filter criteria. Try clearing some filters.
        </ng-container>
        <ng-template #noFilters>
          Click <strong>"Scan Libraries"</strong> to safely discover and catalog all movies and series from your connected Radarr & Sonarr instances.
        </ng-template>
      </p>
      <button *ngIf="!hasFilters" class="btn btn-primary" (click)="triggerLibraryDiscovery()" [disabled]="isScanning">
        Scan Libraries Now (Read-Only)
      </button>
    </div>

    <!-- Media Cards Grid -->
    <div class="media-grid" *ngIf="!isLoading && mediaItems.length > 0">
      <app-media-card
        *ngFor="let media of mediaItems; trackBy: trackById"
        [media]="media"
        (cardClick)="onMediaClick($event)"
      ></app-media-card>
    </div>

    <!-- Bottom Infinite Scroll Loading Indicator -->
    <div *ngIf="!isLoading && isLoadingMore" style="display:flex;justify-content:center;align-items:center;gap:var(--space-sm);padding:var(--space-xl);color:var(--text-muted);font-size:0.9rem;">
      <span class="spinner" style="width:24px;height:24px;border-width:2px;"></span>
      <span>Loading more titles ({{ mediaItems.length }} / {{ totalItems }})...</span>
    </div>

    <!-- Infinite Scroll Sentinel Target -->
    <div #scrollSentinel style="height:20px;margin-top:var(--space-md);visibility:hidden;"></div>
  `,
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('scrollSentinel') scrollSentinel?: ElementRef<HTMLElement>;

  mediaItems: MediaItem[] = [];
  stats: MediaStats | null = null;
  profiles: SyncProfile[] = [];
  totalItems = 0;
  isLoading = true;
  isLoadingMore = false;
  isScanning = false;
  page = 1;
  limit = 24;
  lastScrollY = 0;

  filters: FilterState = {
    search: '',
    mediaType: '',
    syncStatus: '',
    language: '',
  };

  private observer: IntersectionObserver | null = null;
  private scrollDebounceTimer: any = null;

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadStats();
    this.loadProfiles();

    // Check for cached state to restore scroll position and loaded list
    if (this.api.cachedDashboardState && this.api.cachedDashboardState.mediaItems.length > 0) {
      const cached = this.api.cachedDashboardState;
      this.mediaItems = [...cached.mediaItems];
      this.totalItems = cached.totalItems;
      this.page = cached.page;
      this.limit = cached.limit;
      this.filters = { ...cached.filters };
      this.lastScrollY = cached.scrollY;
      if (cached.stats) this.stats = cached.stats;
      this.isLoading = false;
      this.cdr.detectChanges();

      // Restore scroll position with retry animation loop
      this.restoreScrollPosition(cached.scrollY);
      setTimeout(() => this.setupIntersectionObserver(), 100);
    } else {
      this.loadMedia();
    }
  }

  ngAfterViewInit() {
    if (!this.isLoading) {
      this.setupIntersectionObserver();
    }
  }

  ngOnDestroy() {
    this.saveCurrentState();
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.scrollDebounceTimer) {
      clearTimeout(this.scrollDebounceTimer);
    }
  }

  @HostListener('window:scroll')
  onWindowScroll() {
    const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    if (scrollY > 0) {
      this.lastScrollY = scrollY;
      if (this.api.cachedDashboardState) {
        this.api.cachedDashboardState.scrollY = scrollY;
      }
    }

    // Debounced infinite scroll check near bottom
    if (this.scrollDebounceTimer) return;
    this.scrollDebounceTimer = setTimeout(() => {
      this.scrollDebounceTimer = null;
      if (this.isLoading || this.isLoadingMore || this.mediaItems.length >= this.totalItems) return;

      const currentY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
      const scrollPos = window.innerHeight + currentY;
      const threshold = document.documentElement.scrollHeight - 500;
      if (scrollPos >= threshold) {
        this.loadMore();
      }
    }, 100);
  }

  private setupIntersectionObserver() {
    if (this.observer) {
      this.observer.disconnect();
    }
    if (!this.scrollSentinel?.nativeElement) return;

    this.observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first && first.isIntersecting) {
          if (!this.isLoading && !this.isLoadingMore && this.mediaItems.length < this.totalItems) {
            this.loadMore();
          }
        }
      },
      { rootMargin: '500px 0px', threshold: 0.01 }
    );

    this.observer.observe(this.scrollSentinel.nativeElement);
  }

  private restoreScrollPosition(targetY: number) {
    if (targetY <= 0) return;
    let attempts = 0;
    const maxAttempts = 25;

    const performScroll = () => {
      attempts++;
      window.scrollTo({ top: targetY, behavior: 'instant' });
      const currentY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;

      // If document height hasn't fully laid out, keep retrying
      if (Math.abs(currentY - targetY) > 20 && attempts < maxAttempts) {
        requestAnimationFrame(performScroll);
      }
    };

    setTimeout(() => {
      requestAnimationFrame(performScroll);
    }, 30);
  }

  private saveCurrentState() {
    const liveScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    const scrollY = liveScrollY > 0 ? liveScrollY : (this.lastScrollY > 0 ? this.lastScrollY : 0);
    this.api.cachedDashboardState = {
      mediaItems: this.mediaItems,
      totalItems: this.totalItems,
      page: this.page,
      limit: this.limit,
      filters: { ...this.filters },
      stats: this.stats,
      scrollY
    };
  }

  get hasFilters(): boolean {
    return !!(this.filters.search || this.filters.mediaType || this.filters.syncStatus || this.filters.language);
  }

  trackById(index: number, item: MediaItem): number {
    return item.id;
  }

  loadProfiles() {
    this.api.getSyncProfiles().subscribe({
      next: (profiles) => {
        this.profiles = profiles || [];
        this.cdr.detectChanges();
      },
    });
  }

  loadStats() {
    this.api.getMediaStats().subscribe({
      next: (stats) => {
        this.stats = stats;
        this.cdr.detectChanges();
      },
      error: () => {
        this.stats = { totalItems: 0, syncedCount: 0, mainOnlyCount: 0, linkedCount: 0, downloadedCount: 0, pendingCount: 0, errorCount: 0 };
        this.cdr.detectChanges();
      },
    });
  }

  loadMedia() {
    this.isLoading = true;
    this.cdr.markForCheck();
    this.page = 1;
    this.api.getMediaItems({
      page: this.page,
      limit: this.limit,
      search: this.filters.search,
      mediaType: this.filters.mediaType,
      syncStatus: this.filters.syncStatus,
      language: this.filters.language,
    }).subscribe({
      next: (res) => {
        this.mediaItems = res?.data || [];
        this.totalItems = res?.total || 0;
        this.isLoading = false;
        this.cdr.detectChanges();
        this.saveCurrentState();
        setTimeout(() => this.setupIntersectionObserver(), 50);
      },
      error: () => {
        this.mediaItems = [];
        this.totalItems = 0;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  loadMore() {
    if (this.isLoadingMore || this.mediaItems.length >= this.totalItems) return;
    this.isLoadingMore = true;
    this.page++;

    this.api.getMediaItems({
      page: this.page,
      limit: this.limit,
      search: this.filters.search,
      mediaType: this.filters.mediaType,
      syncStatus: this.filters.syncStatus,
      language: this.filters.language,
    }).subscribe({
      next: (res) => {
        if (res?.data && res.data.length > 0) {
          const existingIds = new Set(this.mediaItems.map(m => m.id));
          const newItems = res.data.filter(m => !existingIds.has(m.id));
          this.mediaItems = [...this.mediaItems, ...newItems];
        }
        this.isLoadingMore = false;
        this.cdr.detectChanges();
        this.saveCurrentState();
      },
      error: () => {
        this.isLoadingMore = false;
        this.cdr.detectChanges();
      },
    });
  }

  onFiltersChange(newFilters: FilterState) {
    this.filters = newFilters;
    this.lastScrollY = 0;
    this.api.clearDashboardCache();
    this.loadMedia();
  }

  onMediaClick(media: MediaItem) {
    this.saveCurrentState();
    this.router.navigate(['/media', media.id]);
  }

  /**
   * Safe read-only discovery of all connected Radarr/Sonarr instances.
   */
  triggerLibraryDiscovery() {
    this.isScanning = true;
    this.cdr.detectChanges();

    this.api.triggerLibraryScan().subscribe({
      next: (result: any) => {
        this.isScanning = false;
        this.lastScrollY = 0;
        this.api.clearDashboardCache();
        this.loadStats();
        this.loadMedia();
        this.cdr.detectChanges();
        this.toast.success(`Library discovery completed: ${result.total || 0} media items found across instances.`);
      },
      error: (err) => {
        this.isScanning = false;
        this.cdr.detectChanges();
        this.toast.error('Library scan encountered an error: ' + (err.error?.error || err.message));
      },
    });
  }
}
