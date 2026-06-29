import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./client";
import type {
  AdminStats,
  Appointment,
  Dashboard,
  Doctor,
  Patient,
  ScheduleEntry,
  User,
} from "../lib/types";

// --- Doctors ---

export function useDoctors() {
  return useQuery({
    queryKey: ["doctors"],
    queryFn: async () => (await api.get<Doctor[]>("/doctors")).data,
  });
}

export function useSaveDoctor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: Partial<Doctor> & { id?: number }) => {
      const { id, ...body } = d;
      if (id) return (await api.put<Doctor>(`/doctors/${id}`, body)).data;
      return (await api.post<Doctor>("/doctors", body)).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}

export function useDeleteDoctor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/doctors/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
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

// --- Users ---

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data,
  });
}

export function useSaveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (u: Partial<User> & { id?: number; password?: string }) => {
      const { id, ...body } = u;
      if (id) return (await api.put<User>(`/users/${id}`, body)).data;
      return (await api.post<User>("/users", body)).data;
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
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });
}

// --- Admin Stats ---

export function useAdminStats() {
  return useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => (await api.get<AdminStats>("/admin/stats")).data,
  });
}
