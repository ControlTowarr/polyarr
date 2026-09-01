import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  HostListener,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

export interface PathSuggestion {
  name: string;
  path: string;
}

interface DirectoryCacheEntry {
  entries: PathSuggestion[];
  fetchedAt: number;
  exists: boolean;
}

@Component({
  selector: 'app-path-browser',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="form-group unraid-path-picker">
      <label class="form-label" *ngIf="label">{{ label }}</label>
      
      <div class="path-input-container">
        <input
          #pathInput
          type="text"
          class="form-input path-input"
          [class.has-warning]="pathChecked && !pathExists && currentPath.trim() !== ''"
          [class.has-success]="pathChecked && pathExists && currentPath.trim() !== ''"
          [(ngModel)]="currentPath"
          (ngModelChange)="onInputChange($event)"
          (focus)="onInputFocus()"
          (keydown)="onKeyDown($event)"
          [placeholder]="placeholder"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
        />

        <!-- Autocomplete Suggestions Dropdown -->
        <div
          #dropdownList
          class="autocomplete-dropdown"
          *ngIf="showDropdown && isFocused && (parentPath !== null || suggestions.length > 0 || isLoading)"
        >
          <!-- Parent Directory Navigation ".." -->
          <div
            *ngIf="parentPath !== null"
            class="autocomplete-item autocomplete-parent"
            [class.active]="selectedIndex === -1"
            (mousedown)="onParentClick($event)"
            (mouseenter)="selectedIndex = -1"
          >
            <span class="item-icon">⤴️</span>
            <span class="item-name">
              <strong>..</strong> <span class="item-parent-hint">({{ parentPath }})</span>
            </span>
          </div>

          <!-- Loading Spinner under ".." -->
          <div class="autocomplete-loading" *ngIf="isLoading">
            <span class="spinner spinner-sm"></span>
            <span>Loading subdirectories...</span>
          </div>

          <!-- Subdirectories List -->
          <ng-container *ngIf="!isLoading">
            <div
              *ngFor="let item of suggestions; let i = index"
              class="autocomplete-item"
              [class.active]="i === selectedIndex"
              (mousedown)="onItemClick($event, item)"
              (mouseenter)="selectedIndex = i"
            >
              <span class="item-icon">📁</span>
              <span class="item-name">
                <strong class="match-prefix">{{ getMatchPrefix(item.name) }}</strong>{{ getMatchRemainder(item.name) }}<span class="item-slash">/</span>
              </span>
            </div>

            <!-- Empty state when no subdirectories exist -->
            <div class="autocomplete-empty" *ngIf="suggestions.length === 0 && !activePrefix && parentPath !== null">
              <span>(No subdirectories)</span>
            </div>
            <div class="autocomplete-empty" *ngIf="suggestions.length === 0 && activePrefix">
              <span>No subdirectories matching "{{ activePrefix }}"</span>
            </div>
          </ng-container>
        </div>
      </div>

      <!-- Live Server Path Status Badge -->
      <div class="path-status" *ngIf="pathChecked && currentPath.trim() !== ''">
        <span *ngIf="pathExists" class="status-badge status-success">
          ✓ Verified on Polyarr server
        </span>
        <span *ngIf="!pathExists" class="status-badge status-warning">
          ⚠️ Directory not found on Polyarr server (verify volume mount)
        </span>
      </div>

      <p class="form-hint" *ngIf="hint">{{ hint }}</p>
    </div>
  `,
  styles: [`
    .unraid-path-picker {
      position: relative;
      margin-bottom: var(--space-sm);
    }
    .path-input-container {
      position: relative;
    }
    .path-input {
      font-family: var(--font-mono, 'JetBrains Mono', 'Fira Code', monospace);
      font-size: 0.88rem;
      letter-spacing: 0.2px;
      width: 100%;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .path-input.has-success:focus {
      border-color: var(--color-success, #22c55e);
      box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
    }
    .path-input.has-warning:focus {
      border-color: var(--color-warning, #eab308);
      box-shadow: 0 0 0 2px rgba(234, 179, 8, 0.2);
    }
    .autocomplete-dropdown {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      max-height: 220px;
      overflow-y: auto;
      background: var(--bg-card, #1e202e);
      border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.1));
      border-radius: var(--radius-md, 8px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      z-index: 1000;
      padding: 4px;
    }
    .autocomplete-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 12px;
      border-radius: var(--radius-sm, 6px);
      cursor: pointer;
      font-family: var(--font-mono, monospace);
      font-size: 0.85rem;
      color: var(--text-primary, #f1f5f9);
      transition: background 0.1s ease;
    }
    .autocomplete-item:hover,
    .autocomplete-item.active {
      background: var(--accent-primary-alpha, rgba(62, 203, 240, 0.15));
      color: var(--accent-primary, #3ecbf0);
    }
    .autocomplete-parent {
      color: var(--text-muted, #94a3b8);
      border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
      margin-bottom: 2px;
      padding-bottom: 6px;
    }
    .autocomplete-parent.active,
    .autocomplete-parent:hover {
      color: var(--accent-primary, #3ecbf0);
    }
    .item-parent-hint {
      font-size: 0.75rem;
      opacity: 0.6;
      margin-left: 4px;
    }
    .autocomplete-loading {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      font-size: 0.8rem;
      color: var(--text-muted, #94a3b8);
      font-style: italic;
    }
    .autocomplete-empty {
      padding: 8px 12px;
      font-size: 0.8rem;
      color: var(--text-muted, #94a3b8);
      font-style: italic;
    }
    .item-icon {
      font-size: 0.95rem;
      opacity: 0.85;
      flex-shrink: 0;
    }
    .item-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .match-prefix {
      color: var(--accent-primary, #3ecbf0);
      font-weight: 700;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .item-slash {
      opacity: 0.5;
    }
    .path-status {
      margin-top: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .status-badge {
      font-size: 0.76rem;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 500;
    }
    .status-success {
      background: rgba(34, 197, 94, 0.12);
      color: #4ade80;
      border: 1px solid rgba(34, 197, 94, 0.25);
    }
    .status-warning {
      background: rgba(234, 179, 8, 0.12);
      color: #fde047;
      border: 1px solid rgba(234, 179, 8, 0.25);
    }
    .spinner-sm {
      width: 14px;
      height: 14px;
      border-width: 2px;
      display: inline-block;
    }
  `]
})
export class PathBrowserComponent implements OnInit, OnDestroy {
  @ViewChild('pathInput') pathInputElement?: ElementRef<HTMLInputElement>;
  @ViewChild('dropdownList') dropdownListElement?: ElementRef<HTMLDivElement>;

  @Input() currentPath = '';
  @Output() currentPathChange = new EventEmitter<string>();

  @Input() label = '';
  @Input() hint = '';
  @Input() placeholder = '/path/to/media';

  showDropdown = false;
  isLoading = false;
  suggestions: PathSuggestion[] = [];
  parentPath: string | null = null;
  selectedIndex = 0;
  activePrefix = '';
  pathExists = false;
  pathChecked = false;
  isFocused = false;

  // Shared in-memory directory level cache with 5s TTL
  private static levelCache = new Map<string, DirectoryCacheEntry>();
  private static CACHE_TTL_MS = 5000;

  private inputSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private api: ApiService,
    private elRef: ElementRef,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.inputSubject
      .pipe(
        debounceTime(30),
        distinctUntilChanged()
      )
      .subscribe(value => {
        this.processPath(value);
      });

    // Check initial path on mount if provided
    if (this.currentPath && this.currentPath.trim() !== '') {
      this.processPath(this.currentPath);
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onInputChange(value: string) {
    this.currentPathChange.emit(value);
    this.processPath(value);
  }

  onInputFocus() {
    this.isFocused = true;
    const pathToUse = this.currentPath && this.currentPath.trim() !== '' ? this.currentPath : '/';
    this.processPath(pathToUse);
  }

  /**
   * Decomposes any input string into parentDir and active prefix.
   */
  private parsePath(rawPath: string): { parentDir: string; prefix: string; fullPath: string } {
    let trimmed = (rawPath || '').trim();
    if (!trimmed) {
      return { parentDir: '/', prefix: '', fullPath: '/' };
    }
    if (!trimmed.startsWith('/')) {
      trimmed = `/${trimmed}`;
    }

    if (trimmed === '/' || trimmed.endsWith('/')) {
      const parentDir = trimmed === '/' ? '/' : trimmed.replace(/\/+$/, '');
      return { parentDir, prefix: '', fullPath: trimmed };
    }

    const lastSlashIndex = trimmed.lastIndexOf('/');
    const parentDir = lastSlashIndex === 0 ? '/' : trimmed.substring(0, lastSlashIndex);
    const prefix = trimmed.substring(lastSlashIndex + 1);
    return { parentDir, prefix, fullPath: trimmed };
  }

  /**
   * Calculates the parent directory to navigate up to with "..".
   * Returns null if at the filesystem root "/".
   */
  private computeParentPath(parentDir: string, prefix: string): string | null {
    if (parentDir === '/' && !prefix) {
      return null; // Root has no parent
    }
    if (prefix) {
      return parentDir === '/' ? '/' : `${parentDir}/`;
    }
    const idx = parentDir.lastIndexOf('/');
    if (idx === 0) {
      return '/';
    }
    return idx > 0 ? `${parentDir.substring(0, idx)}/` : '/';
  }

  /**
   * Processes the current path, applying instant 0ms client-side cache filtering
   * or fetching the level from the server without displaying stale suggestions.
   */
  private processPath(rawPath: string) {
    const trimmed = (rawPath || '').trim();
    if (!trimmed) {
      this.suggestions = [];
      this.parentPath = null;
      this.showDropdown = false;
      this.pathChecked = false;
      this.isLoading = false;
      this.cdr.detectChanges();
      return;
    }

    const { parentDir, prefix, fullPath } = this.parsePath(rawPath);
    this.activePrefix = prefix;
    this.parentPath = this.computeParentPath(parentDir, prefix);

    const cached = PathBrowserComponent.levelCache.get(parentDir);
    const now = Date.now();

    if (cached) {
      this.isLoading = false;
      // Instant client-side filter
      this.applyFilter(cached.entries, prefix, parentDir, fullPath);

      // Background stale-while-revalidate if older than 5s
      if (now - cached.fetchedAt > PathBrowserComponent.CACHE_TTL_MS) {
        this.fetchLevel(parentDir, false);
      }
    } else {
      // Clear suggestions and show loading
      this.suggestions = [];
      this.isLoading = true;
      this.showDropdown = this.isFocused && (this.parentPath !== null || true);
      this.selectedIndex = this.parentPath !== null ? -1 : 0;
      this.fetchLevel(parentDir, true);
    }
    this.cdr.detectChanges();
  }

  private applyFilter(allEntries: PathSuggestion[], prefix: string, parentDir: string, fullPath: string) {
    const prefixLower = prefix.toLowerCase();
    this.suggestions = prefix
      ? allEntries.filter(e => e.name.toLowerCase().startsWith(prefixLower))
      : [...allEntries];

    // Default selection: first suggestion if available, otherwise ".." (-1)
    this.selectedIndex = this.suggestions.length > 0 ? 0 : (this.parentPath !== null ? -1 : 0);
    this.showDropdown = this.isFocused && (this.parentPath !== null || this.suggestions.length > 0);

    // Check path existence
    const cleanFull = fullPath.replace(/\/+$/, '') || '/';
    if (cleanFull === '/') {
      this.pathExists = true;
    } else if (prefix === '') {
      const parentCached = PathBrowserComponent.levelCache.get(parentDir);
      this.pathExists = parentCached ? parentCached.exists : true;
    } else {
      this.pathExists = allEntries.some(e => e.name.toLowerCase() === prefixLower);
    }
    this.pathChecked = true;
    this.cdr.detectChanges();
  }

  private fetchLevel(parentDir: string, isInitial: boolean) {
    this.api.browseFilesystem(parentDir).subscribe({
      next: (res) => {
        this.isLoading = false;
        const entries: PathSuggestion[] = (res.directories || []).map(d => ({
          name: d.name,
          path: d.path,
        }));

        PathBrowserComponent.levelCache.set(parentDir, {
          entries,
          fetchedAt: Date.now(),
          exists: true,
        });

        // Ensure user is still at this parentDir before rendering
        const current = this.parsePath(this.currentPath);
        if (current.parentDir === parentDir) {
          this.applyFilter(entries, current.prefix, parentDir, current.fullPath);
        }
      },
      error: () => {
        this.isLoading = false;
        PathBrowserComponent.levelCache.set(parentDir, {
          entries: [],
          fetchedAt: Date.now(),
          exists: false,
        });

        const current = this.parsePath(this.currentPath);
        if (current.parentDir === parentDir) {
          this.suggestions = [];
          this.pathExists = false;
          this.pathChecked = true;
          this.showDropdown = this.isFocused && this.parentPath !== null;
          this.selectedIndex = this.parentPath !== null ? -1 : 0;
          this.cdr.detectChanges();
        }
      }
    });
  }

  onKeyDown(event: KeyboardEvent) {
    if (this.showDropdown && (this.suggestions.length > 0 || this.parentPath !== null)) {
      const minIndex = this.parentPath !== null ? -1 : 0;
      const maxIndex = this.suggestions.length - 1;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (this.selectedIndex < maxIndex) {
          this.selectedIndex++;
        } else {
          this.selectedIndex = minIndex;
        }
        this.scrollToSelected();
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (this.selectedIndex > minIndex) {
          this.selectedIndex--;
        } else {
          this.selectedIndex = maxIndex;
        }
        this.scrollToSelected();
        return;
      }

      if (event.key === 'Tab' || event.key === 'Enter') {
        event.preventDefault();
        if (this.selectedIndex === -1 && this.parentPath !== null) {
          this.applyParent();
        } else if (this.selectedIndex >= 0 && this.suggestions[this.selectedIndex]) {
          this.applySuggestion(this.suggestions[this.selectedIndex]);
        }
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        this.showDropdown = false;
        return;
      }
    } else {
      if (event.key === 'ArrowDown' && this.currentPath) {
        event.preventDefault();
        this.processPath(this.currentPath);
      }
    }
  }

  onParentClick(event: MouseEvent) {
    event.preventDefault(); // Prevent input blur
    this.applyParent();
  }

  applyParent() {
    if (this.parentPath !== null) {
      this.currentPath = this.parentPath;
      this.currentPathChange.emit(this.currentPath);
      if (this.pathInputElement) {
        this.pathInputElement.nativeElement.focus();
      }
      this.processPath(this.currentPath);
    }
  }

  onItemClick(event: MouseEvent, item: PathSuggestion) {
    event.preventDefault(); // Prevent input blur
    this.applySuggestion(item);
  }

  applySuggestion(item: PathSuggestion) {
    // Append trailing slash to advance up one directory level
    const newPath = item.path.endsWith('/') ? item.path : `${item.path}/`;
    this.currentPath = newPath;
    this.currentPathChange.emit(this.currentPath);

    // Keep focus in input
    if (this.pathInputElement) {
      this.pathInputElement.nativeElement.focus();
    }

    // Immediately process next level
    this.processPath(this.currentPath);
  }

  getMatchPrefix(name: string): string {
    if (!this.activePrefix) return '';
    if (name.toLowerCase().startsWith(this.activePrefix.toLowerCase())) {
      return name.substring(0, this.activePrefix.length);
    }
    return '';
  }

  getMatchRemainder(name: string): string {
    const prefix = this.getMatchPrefix(name);
    return name.substring(prefix.length);
  }

  private scrollToSelected() {
    if (!this.dropdownListElement) return;
    const listEl = this.dropdownListElement.nativeElement;
    const activeEl = listEl.querySelector('.autocomplete-item.active') as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.elRef.nativeElement.contains(event.target)) {
      this.showDropdown = false;
      this.isFocused = false;
    }
  }
}
