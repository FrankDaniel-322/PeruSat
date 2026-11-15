import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MissionAction, MissionSnapshot } from '../../contracts/mission';
import { SupabaseMissionGateway } from '../SupabaseMissionGateway';
import { MissionGatewayError } from '../../core/MissionGateway';

describe('SupabaseMissionGateway · Remote Multi-user Adapter Tests', () => {
  const roomId = 'room-test-123';
  let mockSupabase: any;
  let gateway: SupabaseMissionGateway;
  let mockChannel: any;

  const validSnapshot: MissionSnapshot = {
    schemaVersion: 3,
    roomId,
    missionId: 'flood-piura-01',
    phase: 'briefing',
    status: 'ready',
    revision: 0,
    resources: {
      energyWh: 100,
      storageMb: 70,
      contactSeconds: 80,
      budgetCredits: 100,
      massKg: 450,
    },
    observations: [],
  };

  beforeEach(() => {
    mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((callback) => {
        callback('SUBSCRIBED');
        return mockChannel;
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    };

    mockSupabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: 'usr-ground-uuid' } } },
          error: null,
        }),
        signInAnonymously: vi.fn().mockResolvedValue({
          data: { user: { id: 'usr-ground-uuid' } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'mission_state') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { snapshot: validSnapshot, revision: 0 },
              error: null,
            }),
          };
        }
        if (table === 'room_members') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { role: 'ground' },
              error: null,
            }),
          };
        }
        if (table === 'mission_rooms') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { join_code: 'PERU01' },
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        };
      }),
      functions: {
        invoke: vi.fn(),
      },
      rpc: vi.fn(),
      channel: vi.fn(() => mockChannel),
    };

    gateway = new SupabaseMissionGateway(mockSupabase as unknown as SupabaseClient);
  });

  describe('Lectura de Snapshots y Validación', () => {
    it('obtiene el snapshot validado desde mission_state', async () => {
      const snap = await gateway.getSnapshot(roomId);
      expect(snap.schemaVersion).toBe(3);
      expect(snap.roomId).toBe(roomId);
      expect(snap.phase).toBe('briefing');
      expect(snap.resources.energyWh).toBe(100);
    });

    it('falla con INVALID_SNAPSHOT si el servidor retorna un formato corrupto', async () => {
      mockSupabase.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { snapshot: { schemaVersion: 2, badField: true } },
          error: null,
        }),
      }));

      await expect(gateway.getSnapshot(roomId)).rejects.toThrow(MissionGatewayError);
      await expect(gateway.getSnapshot(roomId)).rejects.toThrow(/schemaVersion 3/);
    });

    it('falla con TRANSPORT_ERROR ante fallas de consulta a la base de datos', async () => {
      mockSupabase.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'connection timeout' },
        }),
      }));

      await expect(gateway.getSnapshot(roomId)).rejects.toThrow(MissionGatewayError);
    });
  });

  describe('Despacho de Acciones a Edge Function e Idempotencia', () => {
    const validAction: MissionAction = {
      actionId: 'act-req-001',
      actorRole: 'ground',
      expectedRevision: 0,
      type: 'REQUEST_OBSERVATION',
      payload: { targetId: 'piura-rio' },
    };

    it('despacha la acción correctamente a la Edge Function', async () => {
      const nextSnapshot = { ...validSnapshot, phase: 'planning', revision: 1 };
      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          ok: true,
          change: {
            eventId: 'evt-001',
            actionId: 'act-req-001',
            snapshot: nextSnapshot,
          },
        },
        error: null,
      });

      const res = await gateway.dispatch(roomId, validAction);
      expect(res.actionId).toBe('act-req-001');
      expect(res.snapshot.phase).toBe('planning');
      expect(res.snapshot.revision).toBe(1);

      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('dispatch_action', {
        body: {
          roomId,
          action: validAction,
          expectedRevision: 0,
        },
      });
    });

    it('garantiza idempotencia retornando el resultado previo sin invocar nuevamente el servidor', async () => {
      const nextSnapshot = { ...validSnapshot, phase: 'planning', revision: 1 };
      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          ok: true,
          change: {
            eventId: 'evt-001',
            actionId: 'act-req-001',
            snapshot: nextSnapshot,
          },
        },
        error: null,
      });

      const call1 = await gateway.dispatch(roomId, validAction);
      const call2 = await gateway.dispatch(roomId, validAction);

      expect(call1).toEqual(call2);
      expect(mockSupabase.functions.invoke).toHaveBeenCalledTimes(1);
    });

    it('rechaza acción si la revisión local está desactualizada (conflicto optimista)', async () => {
      await gateway.getSnapshot(roomId); // Inicializa snapshot en revisión 0

      const staleAction: MissionAction = {
        actionId: 'act-stale-002',
        actorRole: 'ground',
        expectedRevision: 5, // Conflicto: se esperaba 0
        type: 'REQUEST_OBSERVATION',
        payload: { targetId: 'piura-rio' },
      };

      await expect(gateway.dispatch(roomId, staleAction)).rejects.toThrow(MissionGatewayError);
      await expect(gateway.dispatch(roomId, staleAction)).rejects.toThrow(/Conflicto de revisión/);
    });

    it('maneja rechazo remoto por revisión obsoleta devuelta por la Edge Function', async () => {
      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          ok: false,
          code: 'stale',
          message: 'Conflicto de revisión concurrente.',
        },
        error: null,
      });

      await expect(gateway.dispatch(roomId, validAction)).rejects.toThrow(MissionGatewayError);
    });

    it('maneja fallas de red con TRANSPORT_ERROR', async () => {
      mockSupabase.functions.invoke.mockResolvedValue({
        data: null,
        error: { message: 'Network failed' },
      });

      await expect(gateway.dispatch(roomId, validAction)).rejects.toThrow(MissionGatewayError);
      await expect(gateway.dispatch(roomId, validAction)).rejects.toThrow(/Network failed/);
    });
  });

  describe('Suscripción Realtime y Sincronización', () => {
    it('notifica estado conectado al suscribirse al canal', () => {
      const listener = vi.fn();
      const unsub = gateway.subscribe(roomId, listener);

      expect(listener).toHaveBeenCalledWith({ kind: 'connection', state: 'connected' });
      expect(mockSupabase.channel).toHaveBeenCalledWith(`mission-room:${roomId}`);

      unsub();
      expect(mockChannel.unsubscribe).toHaveBeenCalled();
    });

    it('emite cambios confirmados cuando Realtime recibe actualización de mission_state', () => {
      let postgresChangesCallback: ((payload: any) => void) | null = null;
      mockChannel.on = vi.fn((_type, opts, cb) => {
        if (opts.table === 'mission_state') {
          postgresChangesCallback = cb;
        }
        return mockChannel;
      });

      const listener = vi.fn();
      gateway.subscribe(roomId, listener);

      const updatedSnapshot = { ...validSnapshot, phase: 'planning', revision: 2 };
      expect(postgresChangesCallback).toBeTruthy();
      postgresChangesCallback!({
        new: { snapshot: updatedSnapshot },
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'confirmed',
          change: expect.objectContaining({
            snapshot: expect.objectContaining({ revision: 2 }),
          }),
        })
      );
    });
  });

  describe('Pertenencia Autenticada y Unirse a Sala', () => {
    it('obtiene el rol asignado sin permitir suplantación', async () => {
      const membership = await gateway.getRoomMembership(roomId);
      expect(membership).toBeTruthy();
      expect(membership?.role).toBe('ground');
      expect(membership?.joinCode).toBe('PERU01');
    });

    it('se une a sala mediante join_room por código', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: { status: 'joined', roomId: 'room-456', role: 'satellite' },
        error: null,
      });

      const result = await gateway.joinRoomByCode('PERU02');
      expect(result.roomId).toBe('room-456');
      expect(result.role).toBe('satellite');
      expect(result.status).toBe('joined');
    });

    it('rechaza unirse si la sala no existe o está llena', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: { status: 'room_not_found' },
        error: null,
      });

      await expect(gateway.joinRoomByCode('BOGUS1')).rejects.toThrow(/Código de sala no encontrado/);

      mockSupabase.rpc.mockResolvedValue({
        data: { status: 'room_full' },
        error: null,
      });

      await expect(gateway.joinRoomByCode('FULL01')).rejects.toThrow(/ya cuenta con sus 2 tripulantes/);
    });

    it('crea sala con createRoom invocando la Edge Function correspondiente', async () => {
      mockSupabase.functions.invoke.mockResolvedValue({
        data: { roomId: 'room-new-789', joinCode: 'PIU123', role: 'ground' },
        error: null,
      });

      const res = await gateway.createRoom('A1', 'ground');
      expect(res.roomId).toBe('room-new-789');
      expect(res.joinCode).toBe('PIU123');
      expect(res.role).toBe('ground');
      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('create_room', {
        body: { scenarioId: 'A1', ownerRole: 'ground' },
      });
    });

    it('registra eventos aplicados en getAppliedEvents tras confirmación de acción', async () => {
      await gateway.getSnapshot(roomId);
      const testAction: MissionAction = {
        actionId: 'act-test-app-01',
        actorRole: 'ground',
        type: 'REQUEST_OBSERVATION',
        expectedRevision: 0,
        payload: { targetId: 'rio-piura' },
      };

      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          ok: true,
          change: {
            eventId: 'evt-applied-01',
            actionId: testAction.actionId,
            snapshot: { ...validSnapshot, revision: 1 },
          },
        },
        error: null,
      });

      await gateway.dispatch(roomId, testAction);
      const applied = gateway.getAppliedEvents(roomId);
      expect(applied.length).toBe(1);
      expect(applied[0].eventId).toBe('evt-applied-01');
      expect(applied[0].result).toBe('accepted');
      expect(applied[0].actorRole).toBe('ground');
    });
  });
});
