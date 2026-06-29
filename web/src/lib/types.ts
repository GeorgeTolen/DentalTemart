export type Role = "owner" | "admin" | "doctor";

export interface User {
  id: number;
  full_name: string;
  email: string;
  role: Role;
}

export interface Doctor {
  id: number;
  full_name: string;
  specialization: string;
  phone: string;
  color: string;
  is_active: boolean;
}

export interface Patient {
  id: number;
  full_name: string;
  phone: string;
  birth_date: string | null;
  notes: string;
}

export type AppointmentStatus =
  | "scheduled"
  | "completed"
  | "cancelled"
  | "no_show";

export interface Appointment {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_phone: string;
  doctor_id: number;
  doctor_name: string;
  doctor_color: string;
  start_time: string; // RFC3339 UTC
  end_time: string;
  status: AppointmentStatus;
  diagnosis: string;
  description: string;
  next_visit_date: string | null;
}

export interface ScheduleEntry {
  weekday: number; // 1=Mon .. 7=Sun
  start_time: string; // "HH:MM"
  end_time: string;
}

export interface Dashboard {
  today_count: number;
  week_count: number;
  today_appointments: Appointment[];
}

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Запланирован",
  completed: "Завершён",
  cancelled: "Отменён",
  no_show: "Не пришёл",
};

export interface AdminStats {
  total_patients: number;
  total_doctors: number;
  total_users: number;
  scheduled_count: number;
  completed_count: number;
  cancelled_count: number;
  no_show_count: number;
  archived_count: number;
}
