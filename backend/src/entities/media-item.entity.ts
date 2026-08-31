import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Instance } from './instance.entity';

@Entity()
export class MediaItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  externalId!: string;

  @Column({ type: 'varchar' })
  mediaType!: 'movie' | 'series';

  @Column()
  title!: string;

  @Column({ nullable: true })
  year!: number;

  @Column({ nullable: true })
  overview!: string;

  @Column({ nullable: true })
  posterUrl!: string;

  @OneToMany(() => MediaItemInstance, mii => mii.mediaItem, { cascade: true, onDelete: 'CASCADE' })
  instances!: MediaItemInstance[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity()
export class MediaItemInstance {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  mediaItemId!: number;

  @Column()
  instanceId!: number;

  @Column({ nullable: true })
  arrId!: number;

  @Column({ type: 'varchar', default: 'missing' })
  status!: 'available' | 'monitored' | 'missing';

  @Column({ type: 'varchar', nullable: true })
  syncMethod!: 'linked' | 'downloaded' | 'not_synced' | null;

  @Column({ type: 'simple-json', nullable: true })
  audioLanguages!: string[];

  @Column({ nullable: true })
  filePath!: string;

  @Column({ nullable: true })
  lastChecked!: Date;

  @ManyToOne(() => MediaItem, mi => mi.instances, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mediaItemId' })
  mediaItem!: MediaItem;

  @ManyToOne(() => Instance, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'instanceId' })
  instance!: Instance;
}
