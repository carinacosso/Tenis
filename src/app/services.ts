import type { Repositories } from '../data/ports';
import type { AppDeps } from './deps';
import { PlayerService } from './playerService';
import { SettingsService } from './settingsService';

export interface Services {
  players: PlayerService;
  settings: SettingsService;
}

export function createServices(repos: Repositories, deps: AppDeps): Services {
  return {
    players: new PlayerService(repos, deps),
    settings: new SettingsService(repos),
  };
}
