import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface FilterState {
  search: string;
  mediaType: string;
  syncStatus: string;
  language: string;
}

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="filter-bar">
      <!-- Search Input -->
      <div class="search-box">
        <svg class="search-box-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          class="form-input"
          [(ngModel)]="filters.search"
          (input)="onFilterChange()"
          placeholder="Search main library by title..."
        />
      </div>

      <!-- Type Filter Chips -->
      <div class="flex-align-center gap-xs">
        <button
          class="filter-chip"
          [class.active]="filters.mediaType === ''"
          (click)="setType('')"
        >All</button>
        <button
          class="filter-chip"
          [class.active]="filters.mediaType === 'movie'"
          (click)="setType('movie')"
        >Movies 🎬</button>
        <button
          class="filter-chip"
          [class.active]="filters.mediaType === 'series'"
          (click)="setType('series')"
        >Series 📺</button>
      </div>

      <!-- Sync / Availability Status Dropdown -->
      <select class="form-select max-w-sm" [(ngModel)]="filters.syncStatus" (change)="onFilterChange()">
        <option value="">All Main Library</option>
        <option value="main_only">Main Only (Not in Child)</option>
        <option value="synced">Synced (In Child)</option>
      </select>

      <!-- Language Dropdown -->
      <select class="form-select max-w-xs" [(ngModel)]="filters.language" (change)="onFilterChange()">
        <option value="">All Audio Tracks</option>
        <option value="en">English 🇬🇧</option>
        <option value="fr">French 🇫🇷</option>
        <option value="de">German 🇩🇪</option>
        <option value="es">Spanish 🇪🇸</option>
        <option value="it">Italian 🇮🇹</option>
        <option value="ja">Japanese 🇯🇵</option>
      </select>
    </div>
  `,
})
export class FilterBarComponent {
  @Input() filters: FilterState = {
    search: '',
    mediaType: '',
    syncStatus: '',
    language: '',
  };

  @Output() filtersChange = new EventEmitter<FilterState>();

  setType(type: string) {
    this.filters.mediaType = type;
    this.onFilterChange();
  }

  onFilterChange() {
    this.filtersChange.emit({ ...this.filters });
  }
}
