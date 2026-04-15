import { create } from "zustand";
import type { MedProfile, UserPrefs } from "@/lib/types";
import {
  getMedProfile,
  getUserPrefs,
  saveMedProfile,
  saveUserPrefs,
} from "@/lib/storage";

interface UserState {
  prefs: UserPrefs;
  medProfile: MedProfile | null;
  hydrated: boolean;
  hydrate: () => void;
  setMedProfile: (profile: MedProfile) => void;
  setPrefs: (prefs: UserPrefs) => void;
}

export const useUserStore = create<UserState>((set) => ({
  prefs: {
    timezone: "UTC",
    notificationPrefs: { inAppRemindersEnabled: true },
  },
  medProfile: null,
  hydrated: false,

  hydrate: () => {
    if (typeof window === "undefined") return;
    set({
      prefs: getUserPrefs(),
      medProfile: getMedProfile(),
      hydrated: true,
    });
  },

  setMedProfile: (medProfile) => {
    saveMedProfile(medProfile);
    set({ medProfile });
  },

  setPrefs: (prefs) => {
    saveUserPrefs(prefs);
    set({ prefs });
  },
}));
