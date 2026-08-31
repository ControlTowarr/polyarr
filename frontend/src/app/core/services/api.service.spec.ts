import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ApiService } from './api.service';
import { Instance, SyncProfile, MediaStats } from '../models';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ApiService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should fetch instances', () => {
    const dummyInstances: Partial<Instance>[] = [
      { id: 1, name: 'Main Radarr', type: 'radarr', isMain: true }
    ];

    service.getInstances().subscribe(instances => {
      expect(instances.length).toBe(1);
      expect(instances[0].name).toBe('Main Radarr');
    });

    const req = httpMock.expectOne('/api/instances');
    expect(req.request.method).toBe('GET');
    req.flush(dummyInstances);
  });

  it('should create an instance', () => {
    const newInstance: Partial<Instance> = { name: 'Child Sonarr', type: 'sonarr' };

    service.createInstance(newInstance).subscribe(instance => {
      expect(instance.id).toBe(2);
    });

    const req = httpMock.expectOne('/api/instances');
    expect(req.request.method).toBe('POST');
    req.flush({ ...newInstance, id: 2 });
  });

  it('should fetch media stats', () => {
    const dummyStats: MediaStats = {
      totalItems: 100,
      syncedCount: 80,
      mainOnlyCount: 20,
      linkedCount: 80,
      downloadedCount: 20,
      pendingCount: 0,
      errorCount: 0
    };

    service.getMediaStats().subscribe(stats => {
      expect(stats.totalItems).toBe(100);
      expect(stats.linkedCount).toBe(80);
    });

    const req = httpMock.expectOne('/api/media/stats');
    expect(req.request.method).toBe('GET');
    req.flush(dummyStats);
  });

  it('should fetch sync profiles', () => {
    const dummyProfiles: Partial<SyncProfile>[] = [
      { id: 1, mainInstanceId: 1, childInstanceId: 2, enabled: true }
    ];

    service.getSyncProfiles().subscribe(profiles => {
      expect(profiles.length).toBe(1);
    });

    const req = httpMock.expectOne('/api/sync-profiles');
    expect(req.request.method).toBe('GET');
    req.flush(dummyProfiles);
  });
});
