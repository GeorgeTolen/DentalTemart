import { Route, Routes, useParams } from "react-router-dom";
import BookingPage from "./BookingPage";
import BookingStatus from "./BookingStatus";

/**
 * Публичная страница записи клиники: /book/{slug}. Живёт вне AuthProvider -
 * клиент не логинится, сессии нет, а /me дёргать незачем.
 */
export default function PublicBooking() {
  const { slug = "" } = useParams();
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-md px-4 py-6">
        <Routes>
          <Route index element={<BookingPage slug={slug} />} />
          <Route path="status/:token" element={<BookingStatus slug={slug} />} />
        </Routes>
        <p className="mt-8 text-center text-xs text-slate-400">
          Temart · онлайн-запись
        </p>
      </div>
    </div>
  );
}
