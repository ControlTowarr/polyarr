import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Instance } from './instance.entity';

@Entity()
export class SyncProfile {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  mainInstanceId!: number;

  @Column()
  childInstanceId!: number;

  /** Whether this sync profile participates in automated background syncs, library scans, and webhooks */
  @Column({ default: true })
  enabled!: boolean;

  /** Linking strategy: 'hardlink' (default, 0 extra storage) or 'symlink' */
  @Column({ type: 'varchar', default: 'hardlink' })
  linkType!: 'hardlink' | 'symlink';

  /** Delay in hours before child instance searches for missing audio */
  @Column({ type: 'integer', default: 0 })
  delayHours!: number;

  /**
   * If true: child instance automatically searches indexers when the main file lacks the target audio.
   * If false: child instance does NOT search indexers; missing audio items are ignored (no-op) and only compatible files are linked.
   */
  @Column({ default: true })
  searchIfMissing!: boolean;

  /**
   * Sonarr only: keeps season monitor status in sync across primary and secondary Sonarr instances.
   * Not used for Radarr instances.
   */
  @Column({ default: true })
  syncMonitoredSeasons!: boolean;

  @Column({ default: '' })
  mainPath!: string;

  @Column({ default: '' })
  childPath!: string;

  @ManyToOne(() => Instance, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mainInstanceId' })
  mainInstance!: Instance;

  @ManyToOne(() => Instance, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'childInstanceId' })
  childInstance!: Instance;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
