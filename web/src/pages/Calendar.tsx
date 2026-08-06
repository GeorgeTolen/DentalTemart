import { useState } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  DateSelectArg,
  DatesSetArg,
  EventApi,
  EventClickArg,
} from "@fullcalendar/core";
import ruLocale from "@fullcalendar/core/locales/ru";
import {
  useAppointments,
  useDoctors,
  useMyDoctorProfile,
  useSaveAppointment,
} from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Appointment } from "../lib/types";
import AppointmentModal from "../components/AppointmentModal";
import { Button, Select } from "../components/ui";
import { useAuth } from "../auth/AuthContext";

interface ModalState {
  existing: Appointment | null;
  initialStart?: string;
  initialEnd?: string;
}

// Узкий экран (телефон) - открываем календарь в режиме дня.
const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

export default function CalendarPage() {
  // Режим поддержки: календарь показываем, но создавать и двигать записи нельзя.
  const { user, readOnly } = useAuth();
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
  const saveAppt = useSaveAppointment();

  // Врач видит расписание всей клиники, но двигать может только свои приёмы -
  // сервер чужие всё равно отклонит, так что не даём и тянуть.
  const isDoctor = user?.role === "doctor";
  const { data: myProfile } = useMyDoctorProfile(isDoctor);
  const myDoctorId = isDoctor ? myProfile?.id ?? null : null;

  function canMove(a: Appointment): boolean {
    if (readOnly) return false;
    // Завершённый приём - уже история, отменённый двигать незачем.
    if (a.status === "completed" || a.status === "cancelled") return false;
    if (isDoctor) return myDoctorId != null && a.doctor_id === myDoctorId;
    return true;
  }

  // Статус видно прямо на карточке: отменённые серые и перечёркнутые,
  // завершённые с галочкой и приглушены, «не пришёл» помечен крестом.
  const STATUS_MARK: Record<string, string> = {
    completed: "✓ ",
    cancelled: "✕ отменён · ",
    no_show: "✕ не пришёл · ",
  };
  const events = appointments.map((a) => ({
    id: String(a.id),
    title: `${STATUS_MARK[a.status] ?? ""}${a.patient_name} · ${a.doctor_name}`,
    start: a.start_time,
    end: a.end_time,
    backgroundColor: a.status === "cancelled" ? "#94A3B8" : a.doctor_color,
    editable: canMove(a),
    classNames:
      a.status === "cancelled"
        ? ["appt-cancelled"]
        : a.status === "completed"
          ? ["appt-completed"]
          : a.status === "no_show"
            ? ["appt-no-show"]
            : [],
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

  /**
   * Перенос и растягивание приёма мышью.
   *
   * Отправляем запись целиком, меняя только время: UpdateAppointment на сервере
   * перезаписывает все поля, и частичный payload стёр бы диагноз и дату
   * следующего приёма. При отказе (например, 409 - врач уже занят) возвращаем
   * карточку на место.
   */
  async function onEventMoved(info: { event: EventApi; revert: () => void }) {
    const a = info.event.extendedProps.appointment as Appointment;
    const start = info.event.start;
    const end = info.event.end;
    if (!start || !end) {
      info.revert();
      return;
    }
    try {
      await saveAppt.mutateAsync({
        id: a.id,
        patient_id: a.patient_id,
        doctor_id: a.doctor_id,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: a.status,
        diagnosis: a.diagnosis,
        description: a.description,
        next_visit_date: a.next_visit_date ?? "",
      });
    } catch (e) {
      info.revert();
      alert(errorMessage(e));
    }
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

      {!readOnly && (
        <p className="text-sm text-slate-400">
          Карточку записи можно перетащить на другое время или растянуть за край,
          чтобы изменить длительность.
        </p>
      )}

      <div className="rounded-2xl bg-white p-2 shadow-sm sm:p-4">
        <FullCalendar
          plugins={[timeGridPlugin, interactionPlugin]}
          // На телефоне по умолчанию - вид «День» (неделя не влезает по ширине).
          initialView={isMobile ? "timeGridDay" : "timeGridWeek"}
          locale={ruLocale}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "timeGridWeek,timeGridDay",
          }}
          slotMinTime="08:00:00"
          slotMaxTime="20:00:00"
          // По умолчанию FullCalendar пишет на оси только час («8»); просим
          // полное время, чтобы читалось как «08:00».
          slotLabelFormat={{
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }}
          allDaySlot={false}
          nowIndicator
          selectable={!readOnly}
          selectMirror
          editable={!readOnly}
          eventDurationEditable={!readOnly}
          height="auto"
          expandRows
          events={events}
          datesSet={onDatesSet}
          eventClick={onEventClick}
          select={onSelect}
          eventDrop={(info) => void onEventMoved(info)}
          eventResize={(info) => void onEventMoved(info)}
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
