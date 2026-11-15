import { useEffect, useState } from 'react';
import type { MissionAction, MissionSnapshot } from '../contracts/mission';
import type { ConnectionState, MissionGateway, MissionGatewayEvent } from '../core/MissionGateway';
import { createInitialSnapshot } from './DevMissionGateway';
import type { DevActionLogItem } from './types';

/**
 * useMissionGateway: Hook reactivo para el entorno de DevTools.
 * Se conecta directamente a la instancia de MissionGateway mediante su interfaz canónica
 * sin introducir una segunda versión de Zustand ni duplicar contratos.
 */
export function useMissionGateway(gateway: MissionGateway, roomId: string) {
  const [snapshot, setSnapshot] = useState<MissionSnapshot>(() => createInitialSnapshot(roomId));
  const [connectionState, setConnectionState] = useState<ConnectionState>('connected');
  const [logs, setLogs] = useState<DevActionLogItem[]>([]);
  const [lastError, setLastError] = useState<{
    code?: string;
    message: string;
    actionType?: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;

    // Obtener estado inicial
    gateway.getSnapshot(roomId).then((initialSnap) => {
      if (mounted) setSnapshot(initialSnap);
    }).catch((err) => {
      if (mounted) {
        setLastError({
          message: err instanceof Error ? err.message : 'Error al obtener snapshot inicial',
        });
      }
    });

    // Suscribirse a cambios del Gateway
    const unsubscribe = gateway.subscribe(roomId, (event: MissionGatewayEvent) => {
      if (!mounted) return;

      if (event.kind === 'connection') {
        setConnectionState(event.state);
      } else if (event.kind === 'confirmed') {
        const change = event.change;
        setSnapshot(change.snapshot);

        const newLog: DevActionLogItem = {
          id: change.eventId,
          timestamp: new Date().toLocaleTimeString(),
          actorRole: 'satellite', // el snapshot no discrimina en confirmed, se complementa al registrar
          actionType: 'REQUEST_OBSERVATION', // inferido o actualizado
          status: 'success',
          snapshotRevision: change.snapshot.revision,
          payload: change.snapshot,
        };
        setLogs((prev) => [newLog, ...prev.slice(0, 49)]);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [gateway, roomId]);

  const recordActionLog = (
    action: MissionAction,
    result: 'success' | 'error',
    errorMessage?: string
  ) => {
    const item: DevActionLogItem = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toLocaleTimeString(),
      actorRole: action.actorRole,
      actionType: action.type,
      status: result,
      errorMessage,
      snapshotRevision: snapshot.revision,
      payload: 'payload' in action ? action.payload : {},
    };

    setLogs((prev) => [item, ...prev.slice(0, 49)]);

    if (result === 'error' && errorMessage) {
      setLastError({
        message: errorMessage,
        actionType: action.type,
      });
    } else if (result === 'success') {
      setLastError(null);
    }
  };

  const clearLogs = () => setLogs([]);
  const dismissError = () => setLastError(null);

  return {
    snapshot,
    connectionState,
    logs,
    lastError,
    recordActionLog,
    clearLogs,
    dismissError,
  };
}
