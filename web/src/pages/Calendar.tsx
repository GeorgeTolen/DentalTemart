import { useState } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
} from "@fullcalendar/core";
import ruLocale from "@fullcalendar/core/locales/ru";
import { useAppointments, useDoctors } from "../api/hooks";
import type { Appointment } from "../lib/types";
import AppointmentModal from "../components/AppointmentModal";
import { Button, Select } from "../components/ui";
import { useAuth } from "../auth/AuthContext";

interface ModalState {
  existing: Appointment | null;
  initialStart?: string;
  initialEnd?: string;
}

// Узкий экран (телефон) — открываем календарь в режиме дня.
const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

export default function CalendarPage() {
  // Режим поддержки: календарь показываем, но создавать и открывать записи на
  // редактирование нельзя — подробности приёмов видны на вкладке «Записи».
  const { readOnly } = useAuth();
  const [range, setRange] = useState<{ from: string; to: string }>({
    from: "",
    to: "",
  });
  const [doctorId, setDoctorId] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);

  const { data: doctors = [] } = useDoctors();
  const { data: appointments = [] } = useAppointments(
    range.from,
    range.to,
    doctorId
  );

  const events = appointments.map((a) => ({
    id: String(a.id),
    title: `${a.patient_name} · ${a.doctor_name}`,
    start: a.start_time,
    end: a.end_time,
    backgroundColor: a.status === "cancelled" ? "#94A3B8" : a.doctor_color,
    extendedProps: { appointment: a },
  }));

  function onDatesSet(arg: DatesSetArg) {
    setRange({ from: arg.start.toISOString(), to: arg.end.toISOString() });
  }

  function onEventClick(arg: EventClickArg) {
    if (readOnly) return;
    const appt = arg.event.extendedProps.appointment as Appointment;
    setModal({ existing: appt });
  }

  function onSelect(arg: DateSelectArg) {
    if (readOnly) return;
    setModal({
      existing: null,
      initialStart: toLocalInput(arg.start),
      initialEnd: toLocalInput(arg.end),
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Календарь</h1>
        <div className="flex items-center gap-3">
          <div className="w-52">
            <Select
              value={doctorId ?? ""}
              onChange={(e) =>
                setDoctorId(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">Все врачи</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </Select>
          </div>
          {!readOnly && (
            <Button onClick={() => setModal({ existing: null })}>
              Новая запись
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-2 shadow-sm sm:p-4">
        <FullCalendar
          plugins={[timeGridPlugin, interactionPlugin]}
          // На телефоне по умолчанию — вид «День» (неделя не влезает по ширине).
          initialView={isMobile ? "timeGridDay" : "timeGridWeek"}
          locale={ruLocale}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "timeGridWeek,timeGridDay",
          }}
          slotMinTime="08:00:00"
          slotMaxTime="20:00:00"
          allDaySlot={false}
          nowIndicator
          selectable={!readOnly}
          selectMirror
          height="auto"
          expandRows
          events={events}
          datesSet={onDatesSet}
          eventClick={onEventClick}
          select={onSelect}
        />
      </div>

      {modal && (
        <AppointmentModal
          doctors={doctors}
          existing={modal.existing}
          initialStart={modal.initialStart}
          initialEnd={modal.initialEnd}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// Format a Date to the value a datetime-local input expects (local time).
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
