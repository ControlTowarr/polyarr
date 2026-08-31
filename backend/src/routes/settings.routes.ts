import { Router } from 'express';
import { SettingsService } from '../services/settings.service';

export function createSettingsRouter(settingsService: SettingsService): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const settings = await settingsService.getSettings();
      res.json(settings);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/', async (req, res) => {
    try {
      const settings = await settingsService.saveSettings(req.body);
      res.json(settings);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  return router;
}
