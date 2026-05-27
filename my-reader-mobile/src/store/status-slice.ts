import type { AppStateSlice } from "./app-store.types";

export type StatusSlice = {
  loading: boolean;
  hydrated: boolean;
  error: string | null;

  setLoading: (loading: boolean) => void;
  setHydrated: (value: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
};

export const createStatusSlice: AppStateSlice<StatusSlice> = (set) => ({
  loading: true,
  hydrated: false,
  error: null,

  setLoading(loading: boolean) {
    set({ loading });
  },
  setHydrated(value: boolean) {
    set({ hydrated: value });
  },
  setError(error: string | null) {
    set({ error });
  },
  clearError() {
    set({ error: null });
  },
});
