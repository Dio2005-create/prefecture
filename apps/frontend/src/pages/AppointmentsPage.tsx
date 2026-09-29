import { useState } from 'react';
import axios from 'axios';
import { CalendarDays } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appointmentService } from '../services/api';
import { Pagination } from '../components/ui';

const appointmentStatusLabels: Record<string, string> = {
  PENDING: 'En attente de confirmation',
  BOOKED: 'Confirme',
  CANCELLED: 'Refuse ou annule',
  COMPLETED: 'Termine',
};

type Appointment = { id: string; startsAt: string; office: string; status: string };
type AvailableSlot = { startsAt: string; endsAt: string; office: string };

export function AppointmentsPage() {
  const client = useQueryClient();
  const [startsAt, setStartsAt] = useState('');
  const [notes, setNotes] = useState('');
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [appointmentPage, setAppointmentPage] = useState(1);
  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({ queryKey: ['appointments'], queryFn: appointmentService.list, refetchInterval: 3000 });
  const { data: availableSlots = [], isLoading: slotsLoading } = useQuery<AvailableSlot[]>({ queryKey: ['appointments', 'available'], queryFn: appointmentService.available, refetchInterval: 30000 });
  const booking = useMutation({
    mutationFn: () => appointmentService.book({ startsAt: new Date(startsAt).toISOString(), notes }),
    onSuccess: () => { setStartsAt(''); setNotes(''); void client.invalidateQueries({ queryKey: ['appointments'] }); },
  });
  const cancellation = useMutation({
    mutationFn: appointmentService.cancel,
    onSuccess: () => { setCancelTarget(null); void client.invalidateQueries({ queryKey: ['appointments'] }); },
  });
  const bookingError = booking.error && axios.isAxiosError(booking.error)
    ? (booking.error.response?.data as { message?: string } | undefined)?.message ?? 'Impossible de reserver ce creneau.'
    : booking.error ? 'Impossible de reserver ce creneau.' : '';
  const visibleAppointments = appointments.slice((appointmentPage - 1) * 5, appointmentPage * 5);

  return (
    <section className="panel appointment-page" style={{ padding: 24 }}>
      <p className="eyebrow">Accueil physique</p>
      <h1>Mes rendez-vous</h1>
      <p>Reservez un creneau de 30 minutes aupres de la Prefecture d'Ihosy.</p>
      <div className="appointment-form">
        <label>Creneau disponible
          <select value={startsAt} onChange={(event) => setStartsAt(event.target.value)}>
            <option value="">{slotsLoading ? 'Chargement des creneaux...' : 'Selectionner un creneau'}</option>
            {availableSlots.map((slot) => <option key={slot.startsAt} value={slot.startsAt}>{new Date(slot.startsAt).toLocaleString('fr-FR')} · {slot.office}</option>)}
          </select>
        </label>
        <label>Motif ou precision
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={500} />
        </label>
        <button className="button primary" disabled={!startsAt || booking.isPending} onClick={() => booking.mutate()}><CalendarDays size={17} />{booking.isPending ? 'Reservation...' : 'Reserver le creneau'}</button>
        {bookingError && <p className="error-message">{bookingError}</p>}
      </div>
      <h2>Historique</h2>
      {isLoading ? <p>Chargement...</p> : appointments.length === 0 ? <p>Aucun rendez-vous reserve.</p> : <div className="appointment-list">
        {visibleAppointments.map((appointment) => <div className="recent-row" key={appointment.id}><CalendarDays size={18} /><span><strong>{new Date(appointment.startsAt).toLocaleString('fr-FR')}</strong><small>{appointment.office} · {appointmentStatusLabels[appointment.status] ?? appointment.status.replace(/_/g, ' ').toLowerCase()}</small></span>{appointment.status === 'PENDING' || appointment.status === 'BOOKED' ? <button className="button small appointment-reject" onClick={() => setCancelTarget(appointment.id)}>Annuler</button> : null}</div>)}
        <Pagination page={appointmentPage} totalPages={Math.max(1, Math.ceil(appointments.length / 5))} onChange={setAppointmentPage} />
      </div>}
      {cancelTarget && <div className="modal-backdrop" role="presentation"><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-appointment-title"><p className="eyebrow">Rendez-vous</p><h2 id="cancel-appointment-title">Annuler ce rendez-vous ?</h2><p>Le creneau sera libere pour un autre citoyen.</p><div className="modal-actions"><button className="button" onClick={() => setCancelTarget(null)}>Retour</button><button className="button appointment-reject" disabled={cancellation.isPending} onClick={() => cancellation.mutate(cancelTarget)}>Confirmer l'annulation</button></div></section></div>}
    </section>
  );
}
