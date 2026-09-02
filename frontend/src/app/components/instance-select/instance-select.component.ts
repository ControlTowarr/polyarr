import { Component, Input, Output, EventEmitter, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Instance } from '../../core/models';

@Component({
  selector: 'app-instance-select',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="form-group">
      <label class="form-label" *ngIf="label">{{ label }}</label>
      
      <div class="instance-select-wrapper" [class.open]="isOpen">
        <!-- Trigger button -->
        <button
          type="button"
          class="form-select instance-select-trigger"
          (click)="toggle()"
          [disabled]="disabled"
        >
          <ng-container *ngIf="selectedInstance; else placeholderTpl">
            <div class="flex-align-center gap-sm flex-1">
              <img
                [src]="selectedInstance.type === 'radarr' ? 'radarr.svg' : 'sonarr.svg'"
                [alt]="selectedInstance.type"
                class="instance-logo-sm"
              />
              <span class="text-semibold text-sm">{{ selectedInstance.name }}</span>
              <span class="badge badge-muted text-xs">{{ (selectedInstance.language || 'en') | uppercase }}</span>
              <span class="text-xs text-muted ml-auto mr-sm">{{ selectedInstance.url }}</span>
            </div>
          </ng-container>

          <ng-template #placeholderTpl>
            <span class="text-muted text-sm">{{ placeholder }}</span>
          </ng-template>

          <span class="dropdown-chevron">{{ isOpen ? '▲' : '▼' }}</span>
        </button>

        <!-- Dropdown Menu -->
        <div class="instance-select-menu" *ngIf="isOpen">
          <div
            *ngFor="let inst of instances"
            class="instance-select-option"
            [class.selected]="inst.id === selectedId"
            (click)="selectInstance(inst)"
          >
            <img
              [src]="inst.type === 'radarr' ? 'radarr.svg' : 'sonarr.svg'"
              [alt]="inst.type"
              class="instance-logo-sm"
            />
            <div class="flex-col">
              <span class="text-semibold text-sm">{{ inst.name }}</span>
              <span class="text-xs text-muted">{{ inst.url }}</span>
            </div>
            <div class="flex-align-center gap-xs ml-auto">
              <span *ngIf="inst.isMain" class="badge badge-success text-xs">Main</span>
              <span class="badge badge-muted text-xs">{{ (inst.language || 'en') | uppercase }}</span>
            </div>
          </div>

          <div *ngIf="instances.length === 0" class="instance-select-empty">
            {{ emptyMessage }}
          </div>
        </div>
      </div>
      
      <p class="form-hint" *ngIf="hint">{{ hint }}</p>
    </div>
  `,
})
export class InstanceSelectComponent {
  @Input() label = '';
  @Input() placeholder = 'Select an instance...';
  @Input() emptyMessage = 'No matching instances available';
  @Input() hint = '';
  @Input() disabled = false;
  @Input() instances: Instance[] = [];

  @Input() set selectedId(val: number | string | undefined) {
    this._selectedId = val !== undefined && val !== '' ? Number(val) : undefined;
  }
  get selectedId(): number | undefined {
    return this._selectedId;
  }
  private _selectedId: number | undefined;

  @Output() selectedIdChange = new EventEmitter<number>();
  @Output() instanceSelected = new EventEmitter<Instance>();

  isOpen = false;

  constructor(private elementRef: ElementRef) {}

  get selectedInstance(): Instance | undefined {
    if (this.selectedId === undefined) return undefined;
    return this.instances.find(i => i.id === this.selectedId);
  }

  toggle() {
    if (!this.disabled) {
      this.isOpen = !this.isOpen;
    }
  }

  selectInstance(inst: Instance) {
    this.selectedId = inst.id;
    this.isOpen = false;
    this.selectedIdChange.emit(inst.id);
    this.instanceSelected.emit(inst);
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: Event) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen = false;
    }
  }
}
