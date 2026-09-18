import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type {
  BookingResult,
  BookingStatus,
  PublicClinic,
  PublicSlots,
} from "../lib/types";

// Публичная страница записи: эндпоинты без авторизации, клиника - по slug из
// ссылки. Тот же axios-инстанс, но 401 здесь не бывает.

export function usePublicClinic(slug: string) {
  return useQuery({
    queryKey: ["public-clinic", slug],
    retry: false,
    queryFn: async () => (await api.get<PublicClinic>(`/public/clinics/${slug}`)).data,
  });
}

export function usePublicSlots(slug: string, date: string, doctorId: number) {
  return useQuery({
    queryKey: ["public-slots", slug, date, doctorId],
    enabled: !!date,
    // Слоты меняются: кто-то мог записаться, пока клиент выбирал.
    refetchInterval: 30000,
    queryFn: async () =>
      (
        await api.get<PublicSlots>(`/public/clinics/${slug}/slots`, {
          params: { date, doctor_id: doctorId || undefined },
        })
      ).data,
  });
}

export interface VerifyResult {
  ok: boolean;
  ttl_sec: number;
  phone: string;
  debug_code?: string;
}

export function useSendCode(slug: string) {
  return useMutation({
    mutationFn: async (phone: string) =>
      (await api.post<VerifyResult>(`/public/clinics/${slug}/verify`, { phone })).data,
  });
}

export function useBook(slug: string) {
  return useMutation({
    mutationFn: async (body: {
      phone: string;
      code: string;
      name: string;
      doctor_id: number;
      start_time: string;
    }) => (await api.post<BookingResult>(`/public/clinics/${slug}/book`, body)).data,
  });
}

export function useBookingStatus(slug: string, token: string) {
  return useQuery({
    queryKey: ["public-booking", slug, token],
    retry: false,
    // Пока заявка ждёт решения, страница обновляется сама.
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 15000 : false),
    queryFn: async () =>
      (await api.get<BookingStatus>(`/public/clinics/${slug}/bookings/${token}`)).data,
  });
}
