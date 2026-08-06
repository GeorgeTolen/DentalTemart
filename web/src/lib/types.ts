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
  // Срок доступа клиники истёк: показываем экран «пробный период истёк»,
  // рабочие эндпоинты отвечают 403.
  clinic_frozen?: boolean;
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
  // Срок доступа: null — бессрочный (оплачено); frozen — срок истёк.
  access_expires_at: string | null;
  frozen: boolean;
}

// Администратор платформы (учётка уровня платформы, вне клиник).
export interface PlatformAdmin {
  id: number;
  full_name: string;
  email: string;
  created_at: string;
  // Отмечает текущего пользователя: себя нельзя удалить.
  is_self: boolean;
}

export interface PlatformStats {
  total_clinics: number;
  active_clinics: number;
  total_users: number;
  total_patients: number;
  total_doctors: number;
  total_appointments: number;
  total_revenue: number;
}

export interface Doctor {
  id: number;
  full_name: string;
  specialization: string;
  phone: string;
  color: string;
  is_active: boolean;
  user_id: number | null;
  // Login (email) of the linked account; empty when no account is linked.
  user_email: string;
  // Профиль, который врач ведёт сам в личном кабинете.
  birth_date: string | null;
  experience_years: number;
  bio: string;
  skills: string;
  education: string;
  avatar_url: string | null;
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
  // Медкарта общая: clinic_name — кто сделал запись, is_own — можно ли удалить.
  clinic_name: string;
  is_own: boolean;
}

export const RECORD_TYPE_LABELS: Record<PatientRecordType, string> = {
  xray: "Рентген",
  allergy: "Аллергия",
  scan3d: "3D снимок",
};

export type Gender = "male" | "female" | "";

export const GENDER_LABELS: Record<Exclude<Gender, "">, string> = {
  male: "Мужской",
  female: "Женский",
};

export interface Patient {
  id: number;
  full_name: string;
  phone: string;
  birth_date: string | null;
  notes: string;
  iin: string;
  gender: Gender;
  // База пациентов общая для платформы: clinic_name — клиника, заведшая
  // карточку; is_own — она же ваша (только ей можно удалить пациента).
  clinic_name: string;
  is_own: boolean;
  avatar_url: string | null;
}

// Услуга из прайса клиники. Цена — целое число тенге.
export interface Service {
  id: number;
  name: string;
  price: number;
  is_active: boolean;
  description: string;
}

// Позиция в чеке приёма.
export interface AppointmentService {
  id: number;
  service_id: number | null;
  name: string;
  price: number;
  quantity: number;
  doctor_id: number | null;
  doctor_name: string;
  sum: number;
}

export interface AppointmentServices {
  items: AppointmentService[];
  total: number;
}

// Страница общей базы пациентов: база растёт, выгружаем по 20.
export interface PatientsPage {
  items: Patient[];
  total: number;
}

// Запись журнала действий клиники.
export interface ClinicEvent {
  id: number;
  user_name: string;
  action: string;
  message: string;
  created_at: string;
}

export interface EventsPage {
  items: ClinicEvent[];
  // 0 — больше страниц нет.
  next_before: number;
}

export interface RevenueBucket {
  revenue: number;
  services_count: number;
  appointments_count: number;
}

export interface RevenueStats {
  today: RevenueBucket;
  month: RevenueBucket;
  year: RevenueBucket;
  all_time: RevenueBucket;
  by_month: { month: string; revenue: number; services_count: number }[];
  by_service: { name: string; revenue: number; services_count: number }[];
  by_doctor: { name: string; revenue: number; services_count: number }[];
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
  // Стоимость оказанных услуг, тенге. null — приём чужой клиники: история
  // пациента общая, деньги нет.
  total: number | null;
  clinic_name: string;
  is_own: boolean;
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
