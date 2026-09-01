import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, CreateDateColumn } from 'typeorm';
import { SyncProfile } from './sync-profile.entity';
import { SyncHistory } from './sync-history.entity';

@Entity('sync_run')
export class SyncRun {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  syncRunId!: string;

  @Column()
  syncProfileId!: number;

  @ManyToOne(() => SyncProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'syncProfileId' })
  syncProfile!: SyncProfile;

  @Column({ type: 'varchar', default: 'manual' })
  triggerType!: 'manual' | 'scheduled' | 'webhook' | 'dry_run';

  @Column({ type: 'varchar', default: 'running' })
  status!: 'running' | 'completed' | 'partial' | 'error';

  @Column({ type: 'integer', default: 0 })
  totalScanned!: number;

  @Column({ type: 'integer', default: 0 })
  linkedCount!: number;

  @Column({ type: 'integer', default: 0 })
  alreadyLinkedCount!: number;

  @Column({ type: 'integer', default: 0 })
  searchTriggeredCount!: number;

  @Column({ type: 'integer', default: 0 })
  alreadyExistsChildCount!: number;

  @Column({ type: 'integer', default: 0 })
  skippedCount!: number;

  @Column({ type: 'integer', default: 0 })
  errorCount!: number;

  @Column({ type: 'integer', default: 0 })
  durationMs!: number;

  @Column({ type: 'text', nullable: true })
  summary!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ nullable: true })
  completedAt?: Date;

  @OneToMany(() => SyncHistory, history => history.syncRun, { cascade: true })
  items!: SyncHistory[];
}
