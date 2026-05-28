import type { AppStateSlice } from "./app-store.types";

export type StatusSlice = {
  storeReady: boolean;
  setStoreReady: (value: boolean) => void;
};

export const createStatusSlice: AppStateSlice<StatusSlice> = (set) =>
  ({
    storeReady: false,

    setStoreReady(value: boolean) {
      set({ storeReady: value });
    },
  });
