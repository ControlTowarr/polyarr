import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { ToastComponent } from './components/toast/toast.component';
import { ApiService } from './core/services/api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule, SidebarComponent, ToastComponent],
  template: `
    <div class="app-layout">
      <app-sidebar *ngIf="!isSetupRoute"></app-sidebar>
      <main class="main-content" [class.no-sidebar]="isSetupRoute">
        <router-outlet></router-outlet>
      </main>
      <app-toast></app-toast>
    </div>
  `,
})
export class AppComponent implements OnInit {
  title = 'Polyarr';
  isSetupRoute = false;

  constructor(
    private router: Router,
    private api: ApiService
  ) {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.isSetupRoute = event.urlAfterRedirects?.includes('/setup') || event.url?.includes('/setup');
    });
  }

  ngOnInit() {
    this.api.getSettings().subscribe({
      next: (settings: any) => {
        if (settings && settings.setup_completed === false) {
          this.api.getInstances().subscribe({
            next: (instances) => {
              if (instances.length === 0 && !window.location.pathname.includes('/setup')) {
                this.router.navigate(['/setup']);
              }
            },
          });
        }
      },
      error: () => {},
    });
  }
}
