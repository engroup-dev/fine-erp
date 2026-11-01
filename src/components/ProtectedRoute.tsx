import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useLogoutMutation } from "../hooks/useAuthQuery";
import { useIdleLock } from "../hooks/useIdleLock";
import { LockScreen } from "./layout/LockScreen";

/**
 * W6-05: the idle lock covers every signed-in route, /change-password included, so a redirect out
 * of the main layout while locked (a 403 MUST_CHANGE_PASSWORD) can never drop the overlay while
 * the lock and the paused queries stay on.
 */
const SessionLock = () => {
  useIdleLock();
  const logoutMutation = useLogoutMutation();
  const navigate = useNavigate();

  const handleSwitchUser = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => navigate("/login", { replace: true }),
    });
  };

  return <LockScreen onSwitchUser={handleSwitchUser} isSwitchingUser={logoutMutation.isPending} />;
};

const ProtectedRoute = () => {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user?.must_change_password && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  return (
    <>
      <Outlet />
      <SessionLock />
    </>
  );
};

export default ProtectedRoute;
