import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Instance {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ type: 'varchar' })
  type!: 'radarr' | 'sonarr';

  @Column()
  url!: string;

  @Column()
  apiKey!: string;

  @Column({ default: 'en' })
  language!: string;

  @Column({ default: '' })
  rootFolderPath!: string;

  @Column({ default: 1 })
  qualityProfileId!: number;

  @Column({ default: false })
  isMain!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
