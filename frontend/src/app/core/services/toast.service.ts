import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title?: string;
  message: string;
  duration: number; // in ms
  createdAt: number;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toastsSubject = new BehaviorSubject<Toast[]>([]);
  public toasts$: Observable<Toast[]> = this.toastsSubject.asObservable();

  constructor(private ngZone: NgZone) {}

  show(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', title?: string, duration = 20000) {
    this.ngZone.run(() => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: Toast = {
        id,
        type,
        title,
        message,
        duration,
        createdAt: Date.now()
      };

      this.toastsSubject.next([...this.toastsSubject.value, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          this.dismiss(id);
        }, duration);
      }
    });
  }

  success(message: string, title = 'Success', duration = 20000) {
    this.show(message, 'success', title, duration);
  }

  error(message: string, title = 'Error', duration = 20000) {
    this.show(message, 'error', title, duration);
  }

  info(message: string, title = 'Information', duration = 20000) {
    this.show(message, 'info', title, duration);
  }

  warning(message: string, title = 'Warning', duration = 20000) {
    this.show(message, 'warning', title, duration);
  }

  dismiss(id: string) {
    this.ngZone.run(() => {
      this.toastsSubject.next(this.toastsSubject.value.filter(t => t.id !== id));
    });
  }
}
