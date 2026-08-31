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

  @Column({ default: true })
  enabled!: boolean;

  @Column({ type: 'varchar', default: 'hardlink' })
  linkType!: 'hardlink' | 'symlink';

  @Column({ type: 'integer', default: 0 })
  delayHours!: number;

  @Column({ default: true })
  searchIfMissing!: boolean;

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
