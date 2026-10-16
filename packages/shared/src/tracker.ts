import { formatDateTime } from './format';
import type { BookingDto } from './types';

export type TrackerState = 'done' | 'current' | 'todo' | 'failed';

export interface TrackerStep {
  key: 'requested' | 'review' | 'visit' | 'completed';
  label: string;
  state: TrackerState;
  /** Texto corto bajo el paso (fecha, motivo…). */
  detail: string | null;
}

/**
 * Seguimiento de una cita o solicitud por pasos, como el de un envío:
 *   Solicitud enviada → Revisión y aprobación → Visita en la oficina → Operación completada
 * (las citas que no requieren aprobación no tienen el paso de revisión).
 * Se calcula solo con los datos de la cita, igual en la web y en la app.
 */
export function bookingSteps(b: BookingDto): TrackerStep[] {
  const tz = b.location.timezone;
  const at = (iso: string | null | undefined) => (iso ? formatDateTime(iso, tz) : null);
  const exchange = b.service.kind === 'CRYPTO_EXCHANGE';
  const needsApproval = exchange || !!b.approvedAt || b.status === 'PENDING' || b.status === 'REJECTED';
  const checkedIn = !!b.checkedInAt || ['CHECKED_IN', 'IN_SERVICE', 'COMPLETED'].includes(b.status);

  const steps: TrackerStep[] = [
    { key: 'requested', label: needsApproval ? 'Solicitud enviada' : 'Reserva confirmada', state: 'done', detail: at(b.createdAt) },
  ];

  if (needsApproval) {
    steps.push(
      b.status === 'PENDING'
        ? { key: 'review', label: 'Revisión y aprobación', state: 'current', detail: exchange ? 'Estamos revisando tu solicitud y tu wallet' : 'Estamos revisando tu solicitud' }
        : b.status === 'REJECTED'
          ? { key: 'review', label: 'Revisión y aprobación', state: 'failed', detail: b.rejectReason ? `No aprobada: ${b.rejectReason}` : 'No aprobada' }
          : b.approvedAt
            ? { key: 'review', label: 'Revisión y aprobación', state: 'done', detail: `${b.autoApproved ? 'Aprobada al momento' : 'Aprobada'} · ${at(b.approvedAt)}` }
            : { key: 'review', label: 'Revisión y aprobación', state: 'todo', detail: null },
    );
  }

  steps.push(
    checkedIn
      ? { key: 'visit', label: 'Visita en la oficina', state: 'done', detail: `Llegada registrada${b.checkedInAt ? ` · ${at(b.checkedInAt)}` : ''}` }
      : b.status === 'NO_SHOW'
        ? { key: 'visit', label: 'Visita en la oficina', state: 'failed', detail: 'No se registró la llegada a tiempo' }
        : b.status === 'CONFIRMED'
          ? { key: 'visit', label: 'Visita en la oficina', state: 'current', detail: `${at(b.startsAt)} · ${b.location.name}. Muestra tu QR al llegar` }
          : { key: 'visit', label: 'Visita en la oficina', state: 'todo', detail: `${at(b.startsAt)} · ${b.location.name}` },
  );

  steps.push(
    b.status === 'COMPLETED'
      ? { key: 'completed', label: exchange ? 'Operación completada' : 'Gestión completada', state: 'done', detail: at(b.completedAt) }
      : ['CHECKED_IN', 'IN_SERVICE'].includes(b.status)
        ? { key: 'completed', label: exchange ? 'Operación completada' : 'Gestión completada', state: 'current', detail: 'Te estamos atendiendo' }
        : { key: 'completed', label: exchange ? 'Operación completada' : 'Gestión completada', state: 'todo', detail: null },
  );

  // Cancelada: el primer paso pendiente se marca como fallido y se explica el motivo.
  if (b.status === 'CANCELLED') {
    const i = steps.findIndex((s) => s.state !== 'done');
    if (i >= 0) {
      steps[i] = { ...steps[i], state: 'failed', detail: `Cancelada${b.cancelReason ? `: ${b.cancelReason}` : ''}${b.cancelledAt ? ` · ${at(b.cancelledAt)}` : ''}` };
      for (let j = i + 1; j < steps.length; j++) steps[j] = { ...steps[j], state: 'todo', detail: null };
    }
  }
  return steps;
}
