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

  /** The path on Polyarr's local filesystem that corresponds to this instance's rootFolderPath.
   *  If empty, defaults to rootFolderPath (assumes identical mount paths). */
  @Column({ default: '' })
  localPath!: string;

  @Column({ default: 1 })
  qualityProfileId!: number;

  @Column({ default: false })
  isMain!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
