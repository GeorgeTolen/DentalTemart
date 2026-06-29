import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./client";
import type {
  Appointment,
  Dashboard,
  Doctor,
  Patient,
  ScheduleEntry,
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
      if (d.id) return (await api.put<Doctor>(`/doctors/${d.id}`, d)).data;
      return (await api.post<Doctor>("/doctors", d)).data;
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
      if (p.id) return (await api.put<Patient>(`/patients/${p.id}`, p)).data;
      return (await api.post<Patient>("/patients", p)).data;
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
      if (a.id)
        return (await api.put<Appointment>(`/appointments/${a.id}`, a)).data;
      return (await api.post<Appointment>("/appointments", a)).data;
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
