import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ToastService, Toast } from '../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container" *ngIf="toasts.length > 0">
      <div
        *ngFor="let toast of toasts; trackBy: trackById"
        class="toast-card"
        [ngClass]="'toast-' + toast.type"
      >
        <div class="toast-icon">
          <span *ngIf="toast.type === 'success'">✓</span>
          <span *ngIf="toast.type === 'error'">✕</span>
          <span *ngIf="toast.type === 'warning'">⚠️</span>
          <span *ngIf="toast.type === 'info'">ℹ️</span>
        </div>

        <div class="toast-content">
          <div class="toast-title" *ngIf="toast.title">{{ toast.title }}</div>
          <div class="toast-message">{{ toast.message }}</div>
        </div>

        <button class="toast-close" (click)="dismiss(toast.id)" title="Dismiss">
          ✕
        </button>

        <div class="toast-progress" [style.animationDuration]="toast.duration + 'ms'"></div>
      </div>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 999999;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 440px;
      width: calc(100vw - 48px);
      pointer-events: none;
    }

    .toast-card {
      pointer-events: auto;
      background: #181926;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      align-items: flex-start;
      gap: 14px;
      box-shadow: 0 20px 30px -10px rgba(0, 0, 0, 0.7), 0 10px 15px -5px rgba(0, 0, 0, 0.5);
      position: relative;
      overflow: hidden;
      animation: slideInToast 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      backdrop-filter: blur(12px);
    }

    .toast-success {
      border-left: 4px solid #10b981;
    }
    .toast-success .toast-icon {
      color: #10b981;
      background: rgba(16, 185, 129, 0.2);
    }

    .toast-error {
      border-left: 4px solid #f43f5e;
    }
    .toast-error .toast-icon {
      color: #f43f5e;
      background: rgba(244, 63, 94, 0.2);
    }

    .toast-info {
      border-left: 4px solid #3ecbf0;
    }
    .toast-info .toast-icon {
      color: #3ecbf0;
      background: rgba(62, 203, 240, 0.2);
    }

    .toast-warning {
      border-left: 4px solid #f59e0b;
    }
    .toast-warning .toast-icon {
      color: #f59e0b;
      background: rgba(245, 158, 11, 0.2);
    }

    .toast-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      font-size: 14px;
      font-weight: 700;
      flex-shrink: 0;
    }

    .toast-content {
      flex: 1;
      min-width: 0;
    }

    .toast-title {
      font-weight: 600;
      font-size: 0.92rem;
      color: #f8fafc;
      margin-bottom: 3px;
    }

    .toast-message {
      font-size: 0.85rem;
      color: #cbd5e1;
      line-height: 1.45;
      word-break: break-word;
    }

    .toast-close {
      background: transparent;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      padding: 4px 8px;
      font-size: 14px;
      border-radius: 6px;
      transition: all 0.15s;
    }
    .toast-close:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.1);
    }

    .toast-progress {
      position: absolute;
      bottom: 0;
      left: 0;
      height: 3px;
      background: rgba(255, 255, 255, 0.25);
      width: 100%;
      animation: progressToast linear forwards;
    }

    @keyframes slideInToast {
      from {
        opacity: 0;
        transform: translateY(-15px) translateX(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0) translateX(0);
      }
    }

    @keyframes progressToast {
      from {
        width: 100%;
      }
      to {
        width: 0%;
      }
    }
  `]
})
export class ToastComponent implements OnInit, OnDestroy {
  toasts: Toast[] = [];
  private sub?: Subscription;

  constructor(
    private toastService: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.sub = this.toastService.toasts$.subscribe(toasts => {
      this.toasts = toasts;
      this.cdr.detectChanges();
    });
  }

  trackById(index: number, item: Toast): string {
    return item.id;
  }

  dismiss(id: string) {
    this.toastService.dismiss(id);
    this.cdr.detectChanges();
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }
}
