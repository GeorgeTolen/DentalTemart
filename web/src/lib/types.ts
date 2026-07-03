// Roles: "superadmin" is the platform administrator (manages all clinics);
// "owner" is a clinic owner; "admin" is a clinic manager; "doctor" is a doctor.
export type Role = "superadmin" | "owner" | "admin" | "doctor";

export interface User {
  id: number;
  full_name: string;
  email: string;
  role: Role;
  clinic_id: number | null;
  clinic_name?: string;
  clinic_slug?: string;
}

// Compact user shape returned by the clinic user-management endpoints.
export interface ClinicUser {
  id: number;
  full_name: string;
  email: string;
  role: Role;
  clinic_id: number | null;
}

// Minimal, public clinic shape for the login picker.
export interface PublicClinic {
  id: number;
  name: string;
  slug: string;
}

// Full clinic shape for the platform admin panel.
export interface Clinic {
  id: number;
  name: string;
  slug: string;
  address: string;
  phone: string;
  is_active: boolean;
  owner_count: number;
  patient_count: number;
  doctor_count: number;
}

export interface PlatformStats {
  total_clinics: number;
  active_clinics: number;
  total_users: number;
  total_patients: number;
  total_doctors: number;
  total_appointments: number;
}

export interface Doctor {
  id: number;
  full_name: string;
  specialization: string;
  phone: string;
  color: string;
  is_active: boolean;
  user_id: number | null;
}

export type PatientRecordType = "xray" | "allergy" | "scan3d";

export interface PatientRecord {
  id: number;
  patient_id: number;
  type: PatientRecordType;
  title: string;
  note: string;
  file_url: string | null;
  file_name: string;
  created_by_name: string;
  created_at: string;
}

export const RECORD_TYPE_LABELS: Record<PatientRecordType, string> = {
  xray: "Рентген",
  allergy: "Аллергия",
  scan3d: "3D снимок",
};

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

// Display labels for roles. Internal identifiers are kept stable for the API.
export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Администратор платформы",
  owner: "Владелец",
  admin: "Менеджер",
  doctor: "Врач",
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
