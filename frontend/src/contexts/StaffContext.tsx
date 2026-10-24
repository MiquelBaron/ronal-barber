import { createContext, useContext } from "react";

export type StaffUser = {
  id: number;
  email: string;
  role: string;
  barber_name?: string;
  barber_id?: number | null;
};

type StaffContextValue = {
  user: StaffUser;
  setUser: (user: StaffUser) => void;
  isAdmin: boolean;
  isAdminBarber: boolean;
  isBarberStaff: boolean;
  isLimitedBarber: boolean;
  canEdit: boolean;
};

const StaffContext = createContext<StaffContextValue | null>(null);

export function StaffProvider({
  user,
  setUser,
  children,
}: {
  user: StaffUser;
  setUser: (user: StaffUser) => void;
  children: React.ReactNode;
}) {
  const isAdmin = user.role === "admin";
  const isAdminBarber = user.role === "admin_barber";
  const isBarberStaff = user.role === "barber" || isAdminBarber;
  const isLimitedBarber = user.role === "barber";
  const canEdit = isAdmin || isAdminBarber;

  return (
    <StaffContext.Provider
      value={{ user, setUser, isAdmin, isAdminBarber, isBarberStaff, isLimitedBarber, canEdit }}
    >
      {children}
    </StaffContext.Provider>
  );
}

export function useStaff() {
  const context = useContext(StaffContext);
  if (!context) {
    throw new Error("useStaff must be used within StaffProvider");
  }
  return context;
}

export function staffRoleLabel(role: string): string {
  if (role === "admin") return "Administrador";
  if (role === "admin_barber") return "Barbero jefe";
  if (role === "barber") return "Barbero";
  return role;
}

export function staffHomePath(role: string): string {
  if (role === "admin") return "/admin";
  if (role === "barber" || role === "admin_barber") return "/admin/agenda";
  return "/admin";
}
