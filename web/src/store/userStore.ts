import { create } from "zustand";
import type { MedProfile, UserPrefs } from "@/lib/types";
import {
  loadMedProfile,
  loadUserPrefs,
  persistMedProfile,
  persistUserPrefs,
} from "@/lib/wave-storage";

interface UserState {
  prefs: UserPrefs;
  medProfile: MedProfile | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setMedProfile: (profile: MedProfile) => Promise<void>;
  setPrefs: (prefs: UserPrefs) => Promise<void>;
}

export const useUserStore = create<UserState>((set) => ({
  prefs: {
    timezone: "UTC",
    notificationPrefs: { inAppRemindersEnabled: true },
  },
  medProfile: null,
  hydrated: false,

  hydrate: async () => {
    if (typeof window === "undefined") return;
    try {
      const [prefs, medProfile] = await Promise.all([
        loadUserPrefs(),
        loadMedProfile(),
      ]);
      set({ prefs, medProfile, hydrated: true });
    } catch {
      set((s) => ({ ...s, hydrated: true }));
    }
  },

  setMedProfile: async (medProfile) => {
    await persistMedProfile(medProfile);
    set({ medProfile });
  },

  setPrefs: async (prefs) => {
    await persistUserPrefs(prefs);
    set({ prefs });
  },
}));
