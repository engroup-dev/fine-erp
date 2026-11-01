import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import {
  loginApi,
  fetchMeApi,
  logoutApi,
  changePasswordApi,
  verifyPasswordApi,
} from "../api/auth";
import { useAuthStore } from "../stores/authStore";
import { useLockStore } from "../stores/lockStore";
import {
  ApiMessageResponse,
  AuthResponse,
  ChangePasswordResponse,
  User,
} from "../types/auth/types";
import {
  AUTH_QUERY_KEY,
  AUTH_REFETCH_INTERVAL_MS,
  AUTH_STALE_TIME_MS,
} from "../constants/auth/constants";
import {
  ChangePasswordCredentials,
  LoginCredentials,
} from "../types/auth/schemas";

export const useLoginMutation = () => {
  const queryClient = useQueryClient();
  const setAuth = useAuthStore((state) => state.setAuth);

  return useMutation<
    AuthResponse,
    AxiosError<{ message?: string }>,
    LoginCredentials
  >({
    mutationFn: (credentials) => loginApi(credentials),
    onSuccess: (data) => {
      setAuth(data.access_token, data.user);
      queryClient.setQueryData(AUTH_QUERY_KEY, data.user);
    },
  });
};

export const useUserQuery = () => {
  const { token, setUser, logout } = useAuthStore();
  const queryClient = useQueryClient();

  return useQuery<User, AxiosError>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      try {
        const user = await fetchMeApi();
        setUser(user);
        const previous = queryClient.getQueryData<User>(AUTH_QUERY_KEY);
        if (
          previous &&
          JSON.stringify(previous.roles ?? []) !==
            JSON.stringify(user.roles ?? [])
        ) {
          queryClient.invalidateQueries();
        }
        return user;
      } catch (err) {
        const status = (err as AxiosError)?.response?.status;
        if (status === 401 || status === 403) {
          logout();
        }
        throw err;
      }
    },
    enabled: Boolean(token),
    staleTime: AUTH_STALE_TIME_MS,
    refetchInterval: AUTH_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
};

export const useLogoutMutation = () => {
  const queryClient = useQueryClient();
  const logout = useAuthStore((state) => state.logout);

  return useMutation<ApiMessageResponse, AxiosError>({
    mutationFn: () => logoutApi(),
    // W6-05: queries count as offline while the screen is locked; logging out must still go out and settle.
    networkMode: "always",
    onSettled: () => {
      logout();
      queryClient.clear();
    },
  });
};

export const useChangePasswordMutation = () => {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);

  return useMutation<
    ChangePasswordResponse,
    AxiosError<{ message?: string }>,
    ChangePasswordCredentials
  >({
    mutationFn: (credentials) => changePasswordApi(credentials),
    onSuccess: (data) => {
      setUser(data.user);
      queryClient.setQueryData(AUTH_QUERY_KEY, data.user);
    },
  });
};

/** W6-05: unlocks the lock screen once the server confirms the signed-in user's password. */
export const useVerifyPasswordMutation = () => {
  const unlock = useLockStore((state) => state.unlock);

  return useMutation<ApiMessageResponse, AxiosError<{ message?: string; code?: string; retry_after?: number }>, string>({
    mutationFn: (password) => verifyPasswordApi(password),
    // Sent while the screen is locked, when TanStack Query reports itself offline.
    networkMode: "always",
    onSuccess: () => {
      unlock();
    },
  });
};
