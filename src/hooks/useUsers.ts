import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "../api/endpoints/users";

export function useUsers(
  options: { withTrashed?: boolean; retry?: (failureCount: number, error: unknown) => boolean } = {},
) {
  const { withTrashed, retry } = options;
  return useQuery({
    queryKey: ["users", { withTrashed }],
    queryFn: async () => (await usersApi.list({ withTrashed })).data.data,
    ...(retry ? { retry } : {}),
  });
}

export function useUser(id?: string, options: { withTrashed?: boolean } = {}) {
  return useQuery({
    queryKey: ["user", id, options],
    queryFn: async () => (await usersApi.get(id as string, { withTrashed: options.withTrashed })).data.data,
    enabled: Boolean(id),
  });
}

/** Every user mutation invalidates user lists and individual user cache. */
function useUserAction<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["user"] });
      qc.invalidateQueries({ queryKey: ["auditLog"] });
    },
  });
}

export function useCreateUser() {
  return useUserAction(usersApi.create);
}

export function useUpdateUser() {
  return useUserAction(
    ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      email?: string;
      password?: string;
      is_active?: boolean;
      record_version: number;
    }) => usersApi.update(id, data),
  );
}

export function useDeleteUser() {
  return useUserAction((id: string) => usersApi.delete(id));
}

export function useRestoreUser() {
  return useUserAction((id: string) => usersApi.restore(id));
}

export function useAssignRole() {
  return useUserAction(
    ({ userId, roleId, operatingUnitId }: { userId: string; roleId: string; operatingUnitId: string | null }) =>
      usersApi.assignRole(userId, { role_id: roleId, operating_unit_id: operatingUnitId }),
  );
}

export function useRemoveRole() {
  return useUserAction(
    ({ userId, roleId, operatingUnitId }: { userId: string; roleId: string; operatingUnitId: string | null }) =>
      usersApi.removeRole(userId, roleId, operatingUnitId),
  );
}
