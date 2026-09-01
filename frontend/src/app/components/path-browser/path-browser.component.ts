import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

interface DirectoryEntry {
  name: string;
  path: string;
}

@Component({
  selector: 'app-path-browser',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="form-group path-browser">
      <label class="form-label" *ngIf="label">{{ label }}</label>
      <div class="path-browser-input-wrap">
        <input
          class="form-input"
          [(ngModel)]="currentPath"
          (ngModelChange)="onInputChange($event)"
          (focus)="onFocus()"
          [placeholder]="placeholder"
          autocomplete="off"
          spellcheck="false"
        />
        <button
          type="button"
          class="btn btn-ghost btn-sm path-browser-browse-btn"
          (click)="toggleDropdown()"
          title="Browse directories"
        >📁</button>
      </div>

      <!-- Dropdown -->
      <div class="path-browser-dropdown" *ngIf="showDropdown && !isLoading && (directories.length > 0 || parentPath !== null)">
        <div
          class="path-browser-item path-browser-parent"
          *ngIf="parentPath !== null"
          (click)="navigateTo(parentPath!)"
        >
          ↑ ..
        </div>
        <div
          class="path-browser-item"
          *ngFor="let dir of directories"
          (click)="selectDirectory(dir)"
        >
          <span class="path-browser-icon">📂</span>
          {{ dir.name }}
        </div>
        <div class="path-browser-empty" *ngIf="directories.length === 0 && parentPath !== null">
          No subdirectories
        </div>
      </div>

      <!-- Loading -->
      <div class="path-browser-dropdown" *ngIf="showDropdown && isLoading">
        <div class="path-browser-item path-browser-loading">
          <span class="spinner"></span> Loading...
        </div>
      </div>

      <!-- Error -->
      <div class="path-browser-dropdown" *ngIf="showDropdown && errorMessage && !isLoading">
        <div class="path-browser-item path-browser-error">
          {{ errorMessage }}
        </div>
      </div>

      <p class="form-hint" *ngIf="hint">{{ hint }}</p>
    </div>
  `,
  styles: [`
    .path-browser {
      position: relative;
    }
    .path-browser-input-wrap {
      display: flex;
      gap: 4px;
      align-items: stretch;
    }
    .path-browser-input-wrap .form-input {
      flex: 1;
      font-family: var(--font-mono, monospace);
      font-size: 0.85rem;
    }
    .path-browser-browse-btn {
      flex-shrink: 0;
      padding: 6px 10px;
      font-size: 1rem;
    }
    .path-browser-dropdown {
      position: absolute;
      z-index: 100;
      left: 0;
      right: 0;
      max-height: 240px;
      overflow-y: auto;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      margin-top: 4px;
    }
    .path-browser-item {
      padding: 8px 12px;
      cursor: pointer;
      font-size: 0.85rem;
      font-family: var(--font-mono, monospace);
      display: flex;
      align-items: center;
      gap: 8px;
      transition: background 0.1s;
    }
    .path-browser-item:hover {
      background: var(--bg-card-hover);
    }
    .path-browser-parent {
      color: var(--text-muted);
      font-weight: 500;
    }
    .path-browser-icon {
      flex-shrink: 0;
    }
    .path-browser-loading {
      color: var(--text-muted);
      cursor: default;
    }
    .path-browser-loading:hover {
      background: transparent;
    }
    .path-browser-error {
      color: var(--text-danger, #f87171);
      cursor: default;
      font-family: var(--font-sans, sans-serif);
    }
    .path-browser-error:hover {
      background: transparent;
    }
    .path-browser-empty {
      padding: 8px 12px;
      font-size: 0.8rem;
      color: var(--text-muted);
      font-style: italic;
    }
  `],
})
export class PathBrowserComponent implements OnInit, OnDestroy {
  @Input() currentPath = '';
  @Output() currentPathChange = new EventEmitter<string>();

  @Input() label = '';
  @Input() hint = '';
  @Input() placeholder = '/path/to/media';

  showDropdown = false;
  isLoading = false;
  errorMessage = '';
  directories: DirectoryEntry[] = [];
  parentPath: string | null = null;

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(private api: ApiService, private elRef: ElementRef) {}

  ngOnInit() {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(path => {
        if (!path || path.trim() === '') {
          return of(null);
        }
        this.isLoading = true;
        this.errorMessage = '';
        return this.api.browseFilesystem(path).pipe(
          catchError(err => {
            this.errorMessage = err.error?.error || 'Failed to browse directory';
            this.isLoading = false;
            this.directories = [];
            this.parentPath = null;
            return of(null);
          })
        );
      })
    ).subscribe(result => {
      this.isLoading = false;
      if (result) {
        this.directories = result.directories || [];
        this.parentPath = result.parent;
        this.currentPath = result.currentPath;
        this.currentPathChange.emit(this.currentPath);
        this.errorMessage = '';
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onInputChange(value: string) {
    this.currentPathChange.emit(value);
    if (this.showDropdown) {
      this.searchSubject.next(value);
    }
  }

  onFocus() {
    // Don't auto-open dropdown on focus — wait for explicit browse click
  }

  toggleDropdown() {
    this.showDropdown = !this.showDropdown;
    if (this.showDropdown) {
      this.browse(this.currentPath || '/');
    }
  }

  selectDirectory(dir: DirectoryEntry) {
    this.currentPath = dir.path;
    this.currentPathChange.emit(this.currentPath);
    this.browse(dir.path);
  }

  navigateTo(path: string) {
    this.currentPath = path;
    this.currentPathChange.emit(this.currentPath);
    this.browse(path);
  }

  private browse(path: string) {
    this.searchSubject.next(path);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.elRef.nativeElement.contains(event.target)) {
      this.showDropdown = false;
    }
  }
}
