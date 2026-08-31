import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { SyncProfile } from './sync-profile.entity';

@Entity()
export class SyncHistory {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  syncProfileId!: number;

  @Column()
  mediaTitle!: string;

  @Column({ type: 'varchar' })
  mediaType!: 'movie' | 'episode';

  @Column({ nullable: true })
  externalId!: string;

  @Column({ type: 'varchar' })
  action!: 'linked' | 'search_triggered' | 'added' | 'season_monitored' | 'error';

  @Column({ type: 'text', nullable: true })
  details!: string;

  @ManyToOne(() => SyncProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'syncProfileId' })
  syncProfile!: SyncProfile;

  @CreateDateColumn()
  createdAt!: Date;
}
