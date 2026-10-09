export interface AppointmentSchedule {
  date: string;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  breakStart?: string | null;
  breakEnd?: string | null;
}

export interface GeneratedAppointmentSlot {
  startsAt: Date;
  endsAt: Date;
}

function minutesSinceMidnight(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new RangeError('Les heures doivent être au format HH:mm');
  return Number(match[1]) * 60 + Number(match[2]);
}

function atAntananarivoTime(date: string, minutes: number) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const remainder = String(minutes % 60).padStart(2, '0');
  return new Date(`${date}T${hours}:${remainder}:00+03:00`);
}

export function generateAppointmentSlots(schedule: AppointmentSchedule): GeneratedAppointmentSlot[] {
  const parsedDate = new Date(`${schedule.date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(schedule.date) ||
      Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== schedule.date) {
    throw new RangeError('La date de disponibilité est invalide');
  }

  const start = minutesSinceMidnight(schedule.startTime);
  const end = minutesSinceMidnight(schedule.endTime);
  const breakStart = schedule.breakStart ? minutesSinceMidnight(schedule.breakStart) : null;
  const breakEnd = schedule.breakEnd ? minutesSinceMidnight(schedule.breakEnd) : null;

  if (end <= start || !Number.isInteger(schedule.slotDurationMinutes) ||
      schedule.slotDurationMinutes <= 0 || schedule.slotDurationMinutes > 1440 ||
      (breakStart !== null && breakEnd !== null && (breakStart >= breakEnd || breakStart < start || breakEnd > end))) {
    throw new RangeError('Les paramètres de disponibilité sont invalides');
  }

  const slots: GeneratedAppointmentSlot[] = [];
  for (let slotStart = start; slotStart + schedule.slotDurationMinutes <= end; slotStart += schedule.slotDurationMinutes) {
    const slotEnd = slotStart + schedule.slotDurationMinutes;
    const overlapsBreak = breakStart !== null && breakEnd !== null && slotStart < breakEnd && slotEnd > breakStart;
    if (!overlapsBreak) {
      slots.push({
        startsAt: atAntananarivoTime(schedule.date, slotStart),
        endsAt: atAntananarivoTime(schedule.date, slotEnd),
      });
    }
  }
  return slots;
}
