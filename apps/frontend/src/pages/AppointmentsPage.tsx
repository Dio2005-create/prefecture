import { useState } from 'react';
import axios from 'axios';
import { CalendarDays } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appointmentService } from '../services/api';
import { Pagination } from '../components/ui';
import { usePreferences } from '../preferences';

const appointmentStatusLabels: Record<string, string> = {
  PENDING: 'En attente de confirmation',
  BOOKED: 'Confirme',
  CANCELLED: 'Refuse ou annule',
  COMPLETED: 'Termine',
};

type Appointment = { id: string; startsAt: string; office: string; status: string };
type AvailableSlot = { id: string; startsAt: string; endsAt: string; office: string };

export function AppointmentsPage() {
  const { t, language } = usePreferences();
  const client = useQueryClient();
  const [startsAt, setStartsAt] = useState('');
  const [notes, setNotes] = useState('');
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [appointmentPage, setAppointmentPage] = useState(1);
  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({ queryKey: ['appointments'], queryFn: appointmentService.list, refetchInterval: 3000 });
  const { data: availableSlots = [], isLoading: slotsLoading } = useQuery<AvailableSlot[]>({ queryKey: ['appointments', 'available'], queryFn: appointmentService.available, refetchInterval: 30000 });
  const booking = useMutation({
    mutationFn: () => appointmentService.book({ slotId: startsAt, notes }),
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
      <p className="eyebrow">{t('Accueil physique')}</p>
      <h1>{t('Mes rendez-vous')}</h1>
      <p>{t("Reservez un creneau de 30 minutes aupres de la Prefecture d'Ihosy.")}</p>
      <div className="appointment-form">
        <label>{t('Creneau disponible')}
          <select value={startsAt} onChange={(event) => setStartsAt(event.target.value)}>
            <option value="">{slotsLoading ? t('Chargement des creneaux...') : availableSlots.length ? t('Selectionner un creneau') : t('Aucun créneau disponible')}</option>
            {availableSlots.map((slot) => <option key={slot.id} value={slot.id}>{new Date(slot.startsAt).toLocaleString(language === 'mg' ? 'mg-MG' : 'fr-FR')} · {slot.office}</option>)}
          </select>
        </label>
        <label>{t('Motif ou precision')}
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={500} />
        </label>
        <button className="button primary" disabled={!startsAt || booking.isPending} onClick={() => booking.mutate()}><CalendarDays size={17} />{t(booking.isPending ? 'Reservation...' : 'Reserver le creneau')}</button>
        {bookingError && <p className="error-message">{t(bookingError)}</p>}
      </div>
      <h2>{t('Historique')}</h2>
      {isLoading ? <p>{t('Chargement...')}</p> : appointments.length === 0 ? <p>{t('Aucun rendez-vous reserve.')}</p> : <div className="appointment-list">
        {visibleAppointments.map((appointment) => <div className="recent-row" key={appointment.id}><CalendarDays size={18} /><span><strong>{new Date(appointment.startsAt).toLocaleString(language === 'mg' ? 'mg-MG' : 'fr-FR')}</strong><small>{appointment.office} · {t(appointmentStatusLabels[appointment.status] ?? appointment.status.replace(/_/g, ' ').toLowerCase())}</small></span>{appointment.status === 'PENDING' || appointment.status === 'BOOKED' ? <button className="button small appointment-reject" onClick={() => setCancelTarget(appointment.id)}>{t('Annuler')}</button> : null}</div>)}
        <Pagination page={appointmentPage} totalPages={Math.max(1, Math.ceil(appointments.length / 5))} onChange={setAppointmentPage} />
      </div>}
      {cancelTarget && <div className="modal-backdrop" role="presentation"><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-appointment-title"><p className="eyebrow">{t('Rendez-vous')}</p><h2 id="cancel-appointment-title">{t('Annuler ce rendez-vous ?')}</h2><p>{t('Le creneau sera libere pour un autre citoyen.')}</p><div className="modal-actions"><button className="button" onClick={() => setCancelTarget(null)}>{t('Retour')}</button><button className="button appointment-reject" disabled={cancellation.isPending} onClick={() => cancellation.mutate(cancelTarget)}>{t("Confirmer l'annulation")}</button></div></section></div>}
    </section>
  );
}
