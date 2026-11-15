import type { MissionAction, PlayerRole } from '../contracts/mission';
import type { MissionErrorCode } from '../core/MissionGateway';

export interface DevActionLogItem {
  id: string;
  timestamp: string;
  actorRole: PlayerRole;
  actionType: MissionAction['type'];
  status: 'pending' | 'success' | 'error';
  errorCode?: MissionErrorCode;
  errorMessage?: string;
  snapshotRevision?: number;
  payload?: unknown;
}

export interface DevScenarioDefinition {
  id: string;
  title: string;
  description: string;
  setup: (gateway: import('./DevMissionGateway').DevMissionGateway, roomId: string) => Promise<void>;
}
