import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MediaItem } from '../../core/models';

@Component({
  selector: 'app-media-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="media-card" (click)="cardClick.emit(media)">
      <div style="position:relative;width:100%;aspect-ratio:2/3;background:var(--bg-surface);">
        <img
          *ngIf="media.posterUrl"
          [src]="media.posterUrl"
          [alt]="media.title"
          class="media-card-poster"
          loading="lazy"
          (error)="media.posterUrl = null"
        />
        <div *ngIf="!media.posterUrl" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:2.5rem;">
          {{ media.mediaType === 'movie' ? '🎬' : '📺' }}
        </div>

        <!-- Badges on top right -->
        <div class="media-card-badges">
          <span class="badge badge-vibrant" [ngClass]="media.mediaType === 'movie' ? 'badge-radarr' : 'badge-sonarr'">
            {{ media.mediaType === 'movie' ? 'Movie' : 'Series' }}
          </span>

          <span *ngIf="isInChild" class="badge badge-vibrant badge-success" title="Available in Main + Child instance">
            🔗 Synced
          </span>
          <span *ngIf="!isInChild" class="badge badge-vibrant badge-muted" title="Only in Main instance">
            Main Only
          </span>
        </div>
      </div>

      <div class="media-card-info">
        <div class="media-card-title" [title]="media.title">
          {{ media.title }}
        </div>
        <div class="media-card-meta">
          <span style="font-size:0.8rem;color:var(--text-muted);">{{ media.year }}</span>

          <!-- Audio languages badges -->
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">
            @for (lang of allLanguages; track lang) {
              <span class="badge badge-muted" style="font-size:0.65rem;padding:2px 6px;">
                {{ getLanguageFlag(lang) }} {{ lang | uppercase }}
              </span>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class MediaCardComponent {
  @Input({ required: true }) media!: MediaItem;
  @Output() cardClick = new EventEmitter<MediaItem>();

  get isInChild(): boolean {
    return this.media.instances?.some(i => i.instance && !i.instance.isMain) || false;
  }

  get allLanguages(): string[] {
    const set = new Set<string>();
    this.media.instances?.forEach(inst => {
      inst.audioLanguages?.forEach(l => {
        if (l) set.add(l.toLowerCase());
      });
      if (inst.instance?.language) {
        set.add(inst.instance.language.toLowerCase());
      }
    });
    return Array.from(set);
  }

  getLanguageFlag(lang: string): string {
    const flags: Record<string, string> = {
      en: '🇬🇧',
      fr: '🇫🇷',
      de: '🇩🇪',
      es: '🇪🇸',
      it: '🇮🇹',
      ja: '🇯🇵',
    };
    return flags[lang.toLowerCase()] || '🌐';
  }
}
