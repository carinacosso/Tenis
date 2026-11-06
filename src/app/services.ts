import type { Repositories } from '../data/ports';
import type { AppDeps } from './deps';
import { PlayerService } from './playerService';
import { SettingsService } from './settingsService';
import { StorageService } from './storageService';
import { TournamentService } from './tournamentService';

export interface Services {
  players: PlayerService;
  settings: SettingsService;
  tournaments: TournamentService;
  storage: StorageService;
}

export function createServices(repos: Repositories, deps: AppDeps): Services {
  return {
    players: new PlayerService(repos, deps),
    settings: new SettingsService(repos),
    tournaments: new TournamentService(repos, deps),
    storage: new StorageService(deps.storage ?? null),
  };
}
