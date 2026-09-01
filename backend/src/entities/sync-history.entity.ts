import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { SyncProfile } from './sync-profile.entity';
import { SyncRun } from './sync-run.entity';

@Entity()
export class SyncHistory {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ nullable: true })
  syncRunId?: string;

  @Column()
  syncProfileId!: number;

  @Column()
  mediaTitle!: string;

  @Column({ type: 'varchar' })
  mediaType!: 'movie' | 'episode';

  @Column({ nullable: true })
  externalId!: string;

  @Column({ type: 'varchar' })
  action!: 'linked' | 'already_linked' | 'search_triggered' | 'added' | 'season_monitored' | 'skipped' | 'would_link' | 'needs_download' | 'already_exists_child' | 'error';

  @Column({ type: 'text', nullable: true })
  details!: string;

  @Column({ nullable: true })
  sourcePath?: string;

  @Column({ nullable: true })
  destinationPath?: string;

  @Column({ type: 'simple-json', nullable: true })
  languagesDetected?: string[];

  @ManyToOne(() => SyncProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'syncProfileId' })
  syncProfile!: SyncProfile;

  @ManyToOne(() => SyncRun, run => run.items, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'syncRunId', referencedColumnName: 'syncRunId' })
  syncRun?: SyncRun;

  @CreateDateColumn()
  createdAt!: Date;
}

