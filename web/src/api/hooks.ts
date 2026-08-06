import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./client";
import type {
  AdminStats,
  Appointment,
  Clinic,
  ClinicUser,
  Dashboard,
  Doctor,
  Patient,
  PatientRecord,
  PatientRecordType,
  PlatformAdmin,
  PlatformStats,
  PublicClinic,
  ScheduleEntry,
} from "../lib/types";

// --- Doctors ---

export function useDoctors() {
  return useQuery({
    queryKey: ["doctors"],
    queryFn: async () => (await api.get<Doctor[]>("/doctors")).data,
  });
}

export interface DoctorPayload extends Partial<Doctor> {
  id?: number;
  // One-window flow: create the doctor's login together with the profile, or
  // (when already linked) reset the linked account's password.
  account_email?: string;
  account_password?: string;
}

export function useSaveDoctor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: DoctorPayload) => {
      const { id, ...body } = d;
      if (id) return (await api.put<Doctor>(`/doctors/${id}`, body)).data;
      return (await api.post<Doctor>("/doctors", body)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doctors"] });
      qc.invalidateQueries({ queryKey: ["unlinked-doctor-users"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useDeleteDoctor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/doctors/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}

export function useMyDoctorProfile() {
  return useQuery({
    queryKey: ["doctor-me"],
    retry: false,
    queryFn: async () => (await api.get<Doctor>("/doctors/me")).data,
  });
}

export function useUnlinkedDoctorUsers(excludeDoctorId?: number) {
  return useQuery({
    queryKey: ["unlinked-doctor-users", excludeDoctorId],
    queryFn: async () =>
      (
        await api.get<{ id: number; full_name: string; email: string }[]>(
          "/doctors/unlinked-users",
          { params: { exclude_doctor_id: excludeDoctorId } }
        )
      ).data,
  });
}

export function useSchedule(doctorId: number | null) {
  return useQuery({
    queryKey: ["schedule", doctorId],
    enabled: doctorId != null,
    queryFn: async () =>
      (await api.get<ScheduleEntry[]>(`/doctors/${doctorId}/schedule`)).data,
  });
}

export function useSaveSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { doctorId: number; entries: ScheduleEntry[] }) =>
      (await api.put(`/doctors/${args.doctorId}/schedule`, args.entries)).data,
    onSuccess: (_d, args) =>
      qc.invalidateQueries({ queryKey: ["schedule", args.doctorId] }),
  });
}

// --- Patients ---

export function usePatients(search: string) {
  return useQuery({
    queryKey: ["patients", search],
    queryFn: async () =>
      (await api.get<Patient[]>("/patients", { params: { search } })).data,
  });
}

export function usePatient(id: number | null) {
  return useQuery({
    queryKey: ["patient", id],
    enabled: id != null,
    queryFn: async () => (await api.get<Patient>(`/patients/${id}`)).data,
  });
}

export function usePatientAppointments(id: number | null) {
  return useQuery({
    queryKey: ["patient-appointments", id],
    enabled: id != null,
    queryFn: async () =>
      (await api.get<Appointment[]>(`/patients/${id}/appointments`)).data,
  });
}

export function useSavePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Partial<Patient> & { id?: number }) => {
      const { id, ...body } = p;
      if (id) return (await api.put<Patient>(`/patients/${id}`, body)).data;
      return (await api.post<Patient>("/patients", body)).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patients"] }),
  });
}

// --- Patient records (рентген / аллергия / 3D снимок) ---

export function usePatientRecords(patientId: number | null, type?: PatientRecordType) {
  return useQuery({
    queryKey: ["patient-records", patientId, type],
    enabled: patientId != null,
    queryFn: async () =>
      (
        await api.get<PatientRecord[]>(`/patients/${patientId}/records`, {
          params: { type },
        })
      ).data,
  });
}

export interface PatientRecordPayload {
  patientId: number;
  type: PatientRecordType;
  title: string;
  note: string;
  file?: File | null;
}

export function useSavePatientRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: PatientRecordPayload) => {
      const form = new FormData();
      form.append("type", r.type);
      form.append("title", r.title);
      form.append("note", r.note);
      if (r.file) form.append("file", r.file);
      return (
        await api.post<PatientRecord>(`/patients/${r.patientId}/records`, form)
      ).data;
    },
    onSuccess: (_d, args) =>
      qc.invalidateQueries({ queryKey: ["patient-records", args.patientId] }),
  });
}

export function useDeletePatientRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { patientId: number; recordId: number }) =>
      api.delete(`/patients/${args.patientId}/records/${args.recordId}`),
    onSuccess: (_d, args) =>
      qc.invalidateQueries({ queryKey: ["patient-records", args.patientId] }),
  });
}

// --- Appointments ---

export function useAppointments(
  from: string,
  to: string,
  doctorId: number | null
) {
  return useQuery({
    queryKey: ["appointments", from, to, doctorId],
    queryFn: async () =>
      (
        await api.get<Appointment[]>("/appointments", {
          params: {
            from,
            to,
            doctor_id: doctorId ?? undefined,
          },
        })
      ).data,
  });
}

export interface AppointmentPayload {
  id?: number;
  patient_id: number;
  doctor_id: number;
  start_time: string;
  end_time: string;
  status: string;
  diagnosis: string;
  description: string;
  next_visit_date: string;
}

export function useSaveAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: AppointmentPayload) => {
      const { id, ...body } = a;
      if (id)
        return (await api.put<Appointment>(`/appointments/${id}`, body)).data;
      return (await api.post<Appointment>("/appointments", body)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["patient-appointments"] });
    },
  });
}

export function useDeleteAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/appointments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });
}

// --- Dashboard ---

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get<Dashboard>("/dashboard")).data,
  });
}

// --- Users (clinic staff) ---

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<ClinicUser[]>("/users")).data,
  });
}

export function useSaveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      u: Partial<ClinicUser> & { id?: number; password?: string }
    ) => {
      const { id, ...body } = u;
      if (id) return (await api.put<ClinicUser>(`/users/${id}`, body)).data;
      return (await api.post<ClinicUser>("/users", body)).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useDeletePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/patients/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["patient"] });
    },
  });
}

// --- Archive ---

export function useArchivedCount() {
  return useQuery({
    queryKey: ["archive-count"],
    queryFn: async () => (await api.get<{ count: number }>("/appointments/archive")).data,
  });
}

export function useDeleteArchivedAppointments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => api.delete("/appointments/archive"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["archive-count"] });
      qc.invalidateQueries({ queryKey: ["archive-list"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });
}

export function useArchivedAppointments(status: "completed" | "cancelled") {
  return useQuery({
    queryKey: ["archive-list", status],
    queryFn: async () =>
      (await api.get<Appointment[]>("/appointments/archive/list", { params: { status } })).data,
  });
}

// --- Admin Stats ---

export function useAdminStats() {
  return useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => (await api.get<AdminStats>("/admin/stats")).data,
  });
}

// --- Platform (superadmin): clinics & global stats ---

// Public list for the login clinic picker.
export function usePublicClinics() {
  return useQuery({
    queryKey: ["public-clinics"],
    retry: false,
    queryFn: async () => (await api.get<PublicClinic[]>("/clinics")).data,
  });
}

export function usePlatformStats() {
  return useQuery({
    queryKey: ["platform-stats"],
    queryFn: async () => (await api.get<PlatformStats>("/platform/stats")).data,
  });
}

export function useClinics() {
  return useQuery({
    queryKey: ["clinics"],
    queryFn: async () => (await api.get<Clinic[]>("/platform/clinics")).data,
  });
}

export interface ClinicPayload {
  id?: number;
  name: string;
  slug: string;
  address: string;
  phone: string;
  is_active: boolean;
  // Only used on create: the clinic's first owner account.
  owner_name?: string;
  owner_email?: string;
  owner_password?: string;
}

export function useSaveClinic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: ClinicPayload) => {
      const { id, ...body } = c;
      if (id) return (await api.put<Clinic>(`/platform/clinics/${id}`, body)).data;
      return (await api.post<Clinic>("/platform/clinics", body)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinics"] });
      qc.invalidateQueries({ queryKey: ["platform-stats"] });
    },
  });
}

export function useDeleteClinic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/platform/clinics/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinics"] });
      qc.invalidateQueries({ queryKey: ["platform-stats"] });
    },
  });
}

// --- Platform: учётные записи клиники глазами платформы ---

export function useClinicUsers(clinicId: number | null) {
  return useQuery({
    queryKey: ["clinic-users", clinicId],
    enabled: clinicId != null,
    queryFn: async () =>
      (await api.get<ClinicUser[]>(`/platform/clinics/${clinicId}/users`)).data,
  });
}

export function useResetClinicUserPassword() {
  return useMutation({
    mutationFn: async (args: {
      clinicId: number;
      userId: number;
      password: string;
    }) =>
      (
        await api.post(
          `/platform/clinics/${args.clinicId}/users/${args.userId}/password`,
          { password: args.password }
        )
      ).data,
  });
}

export function useDeleteClinicUserByPlatform() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { clinicId: number; userId: number }) =>
      api.delete(`/platform/clinics/${args.clinicId}/users/${args.userId}`),
    onSuccess: (_d, args) => {
      qc.invalidateQueries({ queryKey: ["clinic-users", args.clinicId] });
      qc.invalidateQueries({ queryKey: ["clinics"] });
      qc.invalidateQueries({ queryKey: ["platform-stats"] });
    },
  });
}

// --- Platform: администраторы платформы ---

export function usePlatformAdmins() {
  return useQuery({
    queryKey: ["platform-admins"],
    queryFn: async () =>
      (await api.get<PlatformAdmin[]>("/platform/admins")).data,
  });
}

export function useSavePlatformAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: {
      id?: number;
      full_name: string;
      email: string;
      password: string;
    }) => {
      const { id, ...body } = a;
      if (id)
        return (await api.put<PlatformAdmin>(`/platform/admins/${id}`, body))
          .data;
      return (await api.post<PlatformAdmin>("/platform/admins", body)).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform-admins"] }),
  });
}

export function useDeletePlatformAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/platform/admins/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform-admins"] }),
  });
}

export function useChangeOwnPassword() {
  return useMutation({
    mutationFn: async (args: {
      current_password: string;
      new_password: string;
    }) => (await api.post("/platform/password", args)).data,
  });
}

export function useAddClinicOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      clinicId: number;
      full_name: string;
      email: string;
      password: string;
    }) => {
      const { clinicId, ...body } = args;
      return (await api.post(`/platform/clinics/${clinicId}/owner`, body)).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clinics"] }),
  });
}
