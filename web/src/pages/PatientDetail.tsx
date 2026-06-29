import { Link, useParams } from "react-router-dom";
import { usePatient, usePatientAppointments } from "../api/hooks";
import { formatDate, formatDateTime } from "../lib/datetime";
import { StatusBadge } from "../components/ui";

export default function PatientDetail() {
  const { id } = useParams();
  const patientId = id ? Number(id) : null;
  const { data: patient } = usePatient(patientId);
  const { data: history = [] } = usePatientAppointments(patientId);

  if (!patient) return <div className="text-slate-400">Загрузка…</div>;

  return (
    <div className="space-y-6">
      <Link to="/patients" className="text-sm text-brand hover:underline">
        ← К списку пациентов
      </Link>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">{patient.full_name}</h1>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <Info label="Телефон" value={patient.phone || "—"} />
          <Info label="Дата рождения" value={formatDate(patient.birth_date)} />
          <Info label="Приёмов" value={String(history.length)} />
        </dl>
        {patient.notes && (
          <p className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            {patient.notes}
          </p>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">История приёмов</h2>
        <div className="space-y-3">
          {history.map((a) => (
            <div key={a.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{formatDateTime(a.start_time)}</div>
                <StatusBadge status={a.status} />
              </div>
              <div className="mt-1 text-sm text-slate-500">
                Врач: {a.doctor_name}
              </div>
              {a.diagnosis && (
                <div className="mt-2 text-sm">
                  <span className="font-medium">Диагноз:</span> {a.diagnosis}
                </div>
              )}
              {a.description && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                  {a.description}
                </p>
              )}
              {a.next_visit_date && (
                <div className="mt-2 text-sm text-brand">
                  След. приём: {formatDate(a.next_visit_date)}
                </div>
              )}
            </div>
          ))}
          {history.length === 0 && (
            <div className="rounded-2xl bg-white p-8 text-center text-slate-400 shadow-sm">
              Приёмов пока нет
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
