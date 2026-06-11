// ────────────────────────────────────────────────────────────────────────────
// Taxtoo domain types
// ────────────────────────────────────────────────────────────────────────────

// ---- App config ----

export type StorageProvider = 'google' | 'microsoft';

export interface AppSettings {
  // AI providers (client-side, user key — never sent to any server of ours)
  azureOpenAIEndpoint: string;
  azureOpenAIKey: string;
  modelChat: string; // e.g. 'gpt-4o'
  docIntelEndpoint: string; // Azure Document Intelligence endpoint
  docIntelKey: string;
  // Language layers
  language?: string; // interface language (it | en | ...)
  explanationLanguage?: string; // language for AI explanations / summaries
  // Preferences
  theme?: 'dark' | 'light' | 'auto';
  autoSave?: boolean;
  rootFolderId?: string; // Google: Taxtoo root folder id; OneDrive: unused (path-based)
}

export interface AppUser {
  name: string;
  email: string;
  picture: string;
  accessToken: string;
  expiresAt: number;
  provider: StorageProvider;
}

// ---- Taxpayer ----

export type Sex = 'M' | 'F';

export interface Taxpayer {
  fiscalCode: string; // codice fiscale — never translated/altered
  firstName: string;
  lastName: string;
  birthDate?: string; // ISO yyyy-mm-dd
  birthPlace?: string;
  birthProvince?: string;
  sex?: Sex;
  domicileMunicipality?: string;
  domicileProvince?: string;
  address?: string;
  createdAt: string;
  updatedAt: string;
  driveProfileFileId?: string;
}

// ---- Property ----

export type PropertyUsage =
  | 'main_home' // abitazione principale
  | 'other_building' // altri fabbricati
  | 'land' // terreni
  | 'buildable_area' // aree fabbricabili
  | 'appurtenance'; // pertinenza

export type PropertyStatus =
  | 'incomplete'
  | 'to_verify'
  | 'verified'
  | 'used_in_calc'
  | 'archived'
  | 'sold';

export interface Property {
  id: string;
  taxpayerFiscalCode: string;
  label: string;
  municipality: string;
  municipalityCode: string; // codice comune catastale (e.g. 'L612') — never translated
  category?: string; // categoria catastale (A/2, C/2, ...)
  cadastralIncome?: number; // rendita catastale
  ownershipShare: number; // % (0..100)
  monthsOwned: number; // 0..12
  usageType: PropertyUsage;
  isMainHome?: boolean;
  isExempt?: boolean;
  hasReduction?: boolean;
  acquisitionDate?: string; // ISO yyyy-mm-dd — data da cui si è proprietari
  disposalDate?: string; // ISO yyyy-mm-dd — data di vendita/cessione
  notes?: string;
  status: PropertyStatus;
  createdAt: string;
  updatedAt: string;
  drivePropertyFileId?: string;
}

// ---- Documents ----

export type TaxDocumentType =
  | 'visura'
  | 'f24'
  | 'deed' // atto di compravendita
  | 'imu_declaration'
  | 'receipt'
  | 'rates_sheet' // prospetto comunale aliquote
  | 'other';

export interface TaxDocument {
  id: string;
  taxpayerFiscalCode: string;
  propertyId?: string;
  type: TaxDocumentType;
  year?: number;
  municipalityCode?: string;
  documentLanguage?: string;
  useForExtraction: boolean;
  fileName: string;
  mimeType: string;
  driveFileId?: string;
  uploadedAt: string;
}

// ---- Extraction (AI output) ----

export interface LocalTaxRow {
  municipalityCode: string;
  taxCode: string; // codice tributo (3916, 3918, ...) — never translated
  year: number;
  amountDue: number;
}

export interface Extraction {
  id: string;
  documentId: string;
  createdAt: string;
  documentType: TaxDocumentType;
  confidence?: number; // 0..1
  taxpayer?: Partial<Taxpayer>;
  localTaxRows?: LocalTaxRow[];
  total?: number;
  rawText?: string;
  fields?: Record<string, unknown>;
  driveFileId?: string;
}

// ---- Calculation (deterministic engine output, auditable) ----

export type CalculationStatus = 'draft' | 'user_confirmed';

export interface CalculationRow {
  taxCode: string; // codice tributo
  amount: number;
  installment?: 'acconto' | 'saldo' | 'unico';
}

export interface TaxCalculation {
  id: string; // e.g. 'imu_2026_001'
  taxpayerFiscalCode: string;
  propertyId?: string;
  taxType: 'IMU';
  year: number;
  municipalityCode: string;
  rows: CalculationRow[];
  total: number;
  engineVersion: string;
  inputSources: string[];
  manualOverrides: string[];
  status: CalculationStatus;
  createdAt: string;
  updatedAt: string;
  driveFileId?: string;
}

// ---- F24 (generated document) ----

export interface F24 {
  id: string;
  calculationId: string;
  kind: 'acconto' | 'saldo' | 'unico';
  fileName: string;
  driveFileId?: string;
  generatedAt: string;
}

// ---- Assistant chat ----

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

// ---- Drive folder bundle for a property ----

export interface PropertyFolders {
  taxpayerFolderId: string;
  propertyFolderId: string;
  documentsId: string;
  extractionsId: string;
  calculationsId: string;
  f24Id: string;
}
