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

interface ModalState {
  existing: Appointment | null;
  initialStart?: string;
  initialEnd?: string;
}

export default function CalendarPage() {
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
    const appt = arg.event.extendedProps.appointment as Appointment;
    setModal({ existing: appt });
  }

  function onSelect(arg: DateSelectArg) {
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
          <Button onClick={() => setModal({ existing: null })}>
            Новая запись
          </Button>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <FullCalendar
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
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
          selectable
          selectMirror
          height="auto"
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
