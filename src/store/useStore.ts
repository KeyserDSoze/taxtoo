import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AppSettings,
  AppUser,
  Taxpayer,
  Property,
  TaxDocument,
  Extraction,
  TaxCalculation,
  F24,
} from '../types';

interface AppStore {
  // Auth
  user: AppUser | null;
  // Settings (loaded from Drive, NOT persisted locally for security)
  settings: AppSettings | null;
  settingsDriveFileId: string | null;
  isLoadingSettings: boolean;

  // Domain data
  taxpayers: Taxpayer[];
  properties: Property[];
  documents: TaxDocument[];
  extractions: Extraction[];
  calculations: TaxCalculation[];
  f24s: F24[];

  // UI state
  activeFiscalCode: string | null;
  activePropertyId: string | null;

  // Auth actions
  setUser: (user: AppUser | null) => void;
  setSettings: (settings: AppSettings, driveFileId?: string) => void;
  setSettingsDriveFileId: (id: string) => void;
  setLoadingSettings: (loading: boolean) => void;
  logout: () => void;

  // Taxpayer actions
  addTaxpayer: (t: Taxpayer) => void;
  updateTaxpayer: (fiscalCode: string, updates: Partial<Taxpayer>) => void;
  removeTaxpayer: (fiscalCode: string) => void;
  setActiveFiscalCode: (fiscalCode: string | null) => void;

  // Property actions
  addProperty: (p: Property) => void;
  updateProperty: (id: string, updates: Partial<Property>) => void;
  removeProperty: (id: string) => void;
  setActiveProperty: (id: string | null) => void;

  // Document actions
  addDocument: (d: TaxDocument) => void;
  updateDocument: (id: string, updates: Partial<TaxDocument>) => void;
  removeDocument: (id: string) => void;

  // Extraction actions
  addExtraction: (e: Extraction) => void;
  removeExtraction: (id: string) => void;

  // Calculation actions
  addCalculation: (c: TaxCalculation) => void;
  updateCalculation: (id: string, updates: Partial<TaxCalculation>) => void;
  removeCalculation: (id: string) => void;

  // F24 actions
  addF24: (f: F24) => void;
  removeF24: (id: string) => void;
}

export const useStore = create<AppStore>()(
  persist(
    (set) => ({
      user: null,
      settings: null,
      settingsDriveFileId: null,
      isLoadingSettings: false,

      taxpayers: [],
      properties: [],
      documents: [],
      extractions: [],
      calculations: [],
      f24s: [],

      activeFiscalCode: null,
      activePropertyId: null,

      setUser: (user) => set({ user }),
      setSettings: (settings, driveFileId) =>
        set((state) => ({
          settings,
          settingsDriveFileId: driveFileId ?? state.settingsDriveFileId,
        })),
      setSettingsDriveFileId: (id) => set({ settingsDriveFileId: id }),
      setLoadingSettings: (loading) => set({ isLoadingSettings: loading }),
      logout: () =>
        set({
          user: null,
          settings: null,
          settingsDriveFileId: null,
          isLoadingSettings: false,
          activeFiscalCode: null,
          activePropertyId: null,
        }),

      addTaxpayer: (t) =>
        set((state) => ({ taxpayers: [t, ...state.taxpayers.filter((x) => x.fiscalCode !== t.fiscalCode)] })),
      updateTaxpayer: (fiscalCode, updates) =>
        set((state) => ({
          taxpayers: state.taxpayers.map((t) =>
            t.fiscalCode === fiscalCode ? { ...t, ...updates } : t
          ),
        })),
      removeTaxpayer: (fiscalCode) =>
        set((state) => ({
          taxpayers: state.taxpayers.filter((t) => t.fiscalCode !== fiscalCode),
          properties: state.properties.filter((p) => p.taxpayerFiscalCode !== fiscalCode),
          documents: state.documents.filter((d) => d.taxpayerFiscalCode !== fiscalCode),
          activeFiscalCode: state.activeFiscalCode === fiscalCode ? null : state.activeFiscalCode,
        })),
      setActiveFiscalCode: (fiscalCode) => set({ activeFiscalCode: fiscalCode }),

      addProperty: (p) => set((state) => ({ properties: [p, ...state.properties] })),
      updateProperty: (id, updates) =>
        set((state) => ({
          properties: state.properties.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        })),
      removeProperty: (id) =>
        set((state) => ({
          properties: state.properties.filter((p) => p.id !== id),
          documents: state.documents.filter((d) => d.propertyId !== id),
          calculations: state.calculations.filter((c) => c.propertyId !== id),
          activePropertyId: state.activePropertyId === id ? null : state.activePropertyId,
        })),
      setActiveProperty: (id) => set({ activePropertyId: id }),

      addDocument: (d) => set((state) => ({ documents: [d, ...state.documents] })),
      updateDocument: (id, updates) =>
        set((state) => ({
          documents: state.documents.map((d) => (d.id === id ? { ...d, ...updates } : d)),
        })),
      removeDocument: (id) =>
        set((state) => ({
          documents: state.documents.filter((d) => d.id !== id),
          extractions: state.extractions.filter((e) => e.documentId !== id),
        })),

      addExtraction: (e) => set((state) => ({ extractions: [e, ...state.extractions] })),
      removeExtraction: (id) =>
        set((state) => ({ extractions: state.extractions.filter((e) => e.id !== id) })),

      addCalculation: (c) => set((state) => ({ calculations: [c, ...state.calculations] })),
      updateCalculation: (id, updates) =>
        set((state) => ({
          calculations: state.calculations.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        })),
      removeCalculation: (id) =>
        set((state) => ({
          calculations: state.calculations.filter((c) => c.id !== id),
          f24s: state.f24s.filter((f) => f.calculationId !== id),
        })),

      addF24: (f) => set((state) => ({ f24s: [f, ...state.f24s] })),
      removeF24: (id) => set((state) => ({ f24s: state.f24s.filter((f) => f.id !== id) })),
    }),
    {
      name: 'taxtoo-store',
      partialize: (state) => ({
        user: state.user,
        settingsDriveFileId: state.settingsDriveFileId,
        taxpayers: state.taxpayers,
        properties: state.properties,
        documents: state.documents,
        extractions: state.extractions,
        calculations: state.calculations,
        f24s: state.f24s,
        activeFiscalCode: state.activeFiscalCode,
        activePropertyId: state.activePropertyId,
      }),
    }
  )
);
