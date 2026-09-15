import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { PublicLayout } from "./layouts/PublicLayout";
import { BookingPage } from "./pages/BookingPage";
import { HomePage } from "./pages/HomePage";
import { PublicPage } from "./pages/PublicPage";
import { AdminLoginPage, AdminPage } from "./pages/AdminPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { BarberAgendaPage } from "./pages/BarberAgendaPage";
import { AdminAppointmentsPage } from "./pages/AdminAppointmentsPage";
import { AdminBarbersPage } from "./pages/AdminBarbersPage";
import { AdminHoursPage } from "./pages/AdminHoursPage";
import { AdminServicesPage } from "./pages/AdminServicesPage";
import { AdminLayout } from "./layouts/AdminLayout";
import { AdminDaysOffPage } from "./pages/AdminsDaysOffPage";
import { AdminSettingsPage } from "./pages/AdminSettingsPage";
import { CancelAppointmentPage } from "./pages/CancelAppointmentPage";
import { BarberProfilePage } from "./pages/BarberProfilePage";
import { api } from "./services/api";
import type { Barber, Service } from "./types/api";

function App() {
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [apiOnline, setApiOnline] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/health"), api.getServices(), api.getBarbers()])
      .then(async ([healthResponse, loadedServices, loadedBarbers]) => {
        setApiOnline(healthResponse.ok);
        setServices(loadedServices);
        setBarbers(loadedBarbers);
      })
      .catch(() => setApiOnline(false));
  }, []);

  return (
    <Routes>
      <Route path="/reservar" element={<BookingPage />} />
      <Route path="/cancelar/:token" element={<CancelAppointmentPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route element={<AdminLayout />}>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/users" element={<AdminPage />} />
        <Route path="/admin/appointments" element={<AdminAppointmentsPage />} />
        <Route path="/admin/services" element={<AdminServicesPage />} />
        <Route path="/admin/barbers" element={<AdminBarbersPage />} />
        <Route path="/admin/hours" element={<AdminHoursPage />} />
        <Route path="/admin/days-off" element={<AdminDaysOffPage />} />
        <Route path="/admin/settings" element={<AdminSettingsPage />} />
        <Route path="/admin/agenda" element={<BarberAgendaPage />} />
      </Route>
      <Route path="/mis-citas" element={<Navigate to="/admin/agenda" replace />} />
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage services={services} barbers={barbers} apiOnline={apiOnline} />} />
        <Route path="/servicios" element={<PublicPage path="/servicios" services={services} barbers={barbers} />} />
        <Route path="/barberos" element={<PublicPage path="/barberos" services={services} barbers={barbers} />} />
        <Route path="/barberos/:id" element={<BarberProfilePage />} />
        <Route path="/galeria" element={<PublicPage path="/galeria" services={services} barbers={barbers} />} />
        <Route path="/contacto" element={<PublicPage path="/contacto" services={services} barbers={barbers} />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
