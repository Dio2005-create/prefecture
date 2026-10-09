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
  const [appointmentDate, setAppointmentDate] = useState('');
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [notes, setNotes] = useState('');
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [appointmentPage, setAppointmentPage] = useState(1);
  const officeDateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Indian/Antananarivo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const officeToday = `${officeDateParts.find((part) => part.type === 'year')?.value}-${officeDateParts.find((part) => part.type === 'month')?.value}-${officeDateParts.find((part) => part.type === 'day')?.value}`;
  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({ queryKey: ['appointments'], queryFn: appointmentService.list, refetchInterval: 3000 });
  const { data: availableSlots = [], isLoading: slotsLoading } = useQuery<AvailableSlot[]>({
    queryKey: ['appointments', 'available', appointmentDate],
    queryFn: () => appointmentService.available(appointmentDate),
    enabled: Boolean(appointmentDate),
    refetchInterval: 30000,
  });
  const booking = useMutation({
    mutationFn: () => appointmentService.book({ slotId: selectedSlotId, notes }),
    onSuccess: () => {
      setSelectedSlotId('');
      setNotes('');
      void client.invalidateQueries({ queryKey: ['appointments'] });
      void client.invalidateQueries({ queryKey: ['appointments', 'available', appointmentDate] });
    },
  });
  const cancellation = useMutation({
    mutationFn: appointmentService.cancel,
    onSuccess: () => {
      setCancelTarget(null);
      void client.invalidateQueries({ queryKey: ['appointments'] });
      void client.invalidateQueries({ queryKey: ['appointments', 'available', appointmentDate] });
    },
  });
  const bookingError = booking.error && axios.isAxiosError(booking.error)
    ? (booking.error.response?.data as { message?: string } | undefined)?.message ?? 'Impossible de reserver ce creneau.'
    : booking.error ? 'Impossible de reserver ce creneau.' : '';
  const visibleAppointments = appointments.slice((appointmentPage - 1) * 5, appointmentPage * 5);

  return (
    <section className="panel appointment-page" style={{ padding: 24 }}>
      <p className="eyebrow">{t('Accueil physique')}</p>
      <h1>{t('Mes rendez-vous')}</h1>
      <p>{t("Choisissez une date puis un créneau disponible auprès de la Préfecture d'Ihosy.")}</p>
      <div className="appointment-form">
        <label className="appointment-date-field">{t('Date du rendez-vous')}
          <input type="date" value={appointmentDate} min={officeToday} onChange={(event) => { setAppointmentDate(event.target.value); setSelectedSlotId(''); }} />
        </label>
        <label className="appointment-slot-field">{t('Creneau disponible')}
          <select value={selectedSlotId} disabled={!appointmentDate || slotsLoading} onChange={(event) => setSelectedSlotId(event.target.value)}>
            <option value="">{!appointmentDate ? t('Sélectionnez une date') : slotsLoading ? t('Chargement des creneaux...') : availableSlots.length ? t('Selectionner un creneau') : t('Aucun créneau disponible')}</option>
            {availableSlots.map((slot) => <option key={slot.id} value={slot.id}>{new Date(slot.startsAt).toLocaleTimeString(language === 'mg' ? 'mg-MG' : 'fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Antananarivo' })} – {new Date(slot.endsAt).toLocaleTimeString(language === 'mg' ? 'mg-MG' : 'fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Antananarivo' })} · {slot.office}</option>)}
          </select>
        </label>
        <label className="appointment-reason-field">{t('Motif ou precision')}
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={500} />
        </label>
        <button className="button primary" disabled={!selectedSlotId || booking.isPending} onClick={() => booking.mutate()}><CalendarDays size={17} />{t(booking.isPending ? 'Reservation...' : 'Reserver le creneau')}</button>
        {bookingError && <p className="error-message">{t(bookingError)}</p>}
      </div>
      <h2>{t('Historique')}</h2>
      {isLoading ? <p>{t('Chargement...')}</p> : appointments.length === 0 ? <p>{t('Aucun rendez-vous reserve.')}</p> : <div className="appointment-list">
        {visibleAppointments.map((appointment) => <div className="recent-row" key={appointment.id}><CalendarDays size={18} /><span><strong>{new Date(appointment.startsAt).toLocaleString(language === 'mg' ? 'mg-MG' : 'fr-FR', { timeZone: 'Indian/Antananarivo' })}</strong><small>{appointment.office} · {t(appointmentStatusLabels[appointment.status] ?? appointment.status.replace(/_/g, ' ').toLowerCase())}</small></span>{appointment.status === 'PENDING' || appointment.status === 'BOOKED' ? <button className="button small appointment-reject" onClick={() => setCancelTarget(appointment.id)}>{t('Annuler')}</button> : null}</div>)}
        <Pagination page={appointmentPage} totalPages={Math.max(1, Math.ceil(appointments.length / 5))} onChange={setAppointmentPage} />
      </div>}
      {cancelTarget && <div className="modal-backdrop" role="presentation"><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-appointment-title"><p className="eyebrow">{t('Rendez-vous')}</p><h2 id="cancel-appointment-title">{t('Annuler ce rendez-vous ?')}</h2><p>{t('Le creneau sera libere pour un autre citoyen.')}</p><div className="modal-actions"><button className="button" onClick={() => setCancelTarget(null)}>{t('Retour')}</button><button className="button appointment-reject" disabled={cancellation.isPending} onClick={() => cancellation.mutate(cancelTarget)}>{t("Confirmer l'annulation")}</button></div></section></div>}
    </section>
  );
}
