# Taxtoo — Data models & Drive layout

## Drive folder layout (same shape on Google Drive and OneDrive)

```
/Taxtoo
  /settings
    settings.json            ← Google: App Data Folder; OneDrive: /Apps/Taxtoo
  /taxpayers
    /RPTLSN86C06C765A        ← <FISCAL_CODE>
      profile.json
      /properties
        /L612_<id>           ← <CODICE_COMUNE>_<propertyId>
          property.json
          /documents         ← original uploads (visura, F24, atti, ...)
          /extractions       ← extraction_<date>.json (AI output)
          /calculations      ← imu_<year>.json + imu_<year>_summary.pdf
          /f24               ← f24_imu_<year>_acconto.pdf / _saldo.pdf
      /payments
        /2026
          f24_imu_2026_L612.pdf
          receipt.pdf
```

Notes:
- Google Drive: settings live in the **App Data Folder** (private to the app); content folders
  live under a top-level `Taxtoo` folder created with `drive.file` scope.
- OneDrive: path-based, under `/Apps/Taxtoo` (Microsoft Graph creates intermediate folders).

## TypeScript domain types (see `src/types/index.ts`)

### AppUser
```ts
{ name, email, picture, accessToken, expiresAt, provider: 'google' | 'microsoft' }
```

### AppSettings (stored in Drive, not local)
```ts
{
  // AI providers (client-side, user key)
  azureOpenAIEndpoint, azureOpenAIKey, modelChat,            // e.g. 'gpt-4o'
  docIntelEndpoint, docIntelKey,                             // Azure Document Intelligence
  // languages (four layers)
  language,            // interface  (it | en | ...)
  explanationLanguage, // AI explanations
  // preferences
  theme: 'dark' | 'light' | 'auto',
  autoSave, rootFolderId
}
```

### Taxpayer
```ts
{
  fiscalCode: 'RPTLSN86C06C765A',
  firstName, lastName, birthDate, birthPlace, birthProvince,
  sex: 'M' | 'F',
  domicileMunicipality, domicileProvince, address
}
```

### Property
```ts
{
  id, taxpayerFiscalCode,
  label, municipality, municipalityCode: 'L612',
  category,                 // cadastral category (A/2, C/2, ...)
  cadastralIncome,          // rendita catastale
  ownershipShare: 100,      // %
  monthsOwned: 12,
  usageType: 'main_home' | 'other_building' | 'land' | 'buildable_area' | 'appurtenance',
  isMainHome, isExempt, hasReduction, notes,
  status: 'incomplete' | 'to_verify' | 'verified' | 'used_in_calc' | 'archived'
}
```

### TaxDocument
```ts
{
  id, taxpayerFiscalCode, propertyId?,
  type: 'visura' | 'f24' | 'deed' | 'imu_declaration' | 'receipt' | 'rates_sheet' | 'other',
  year?, municipalityCode?, documentLanguage?, useForExtraction: boolean,
  driveFileId, fileName, mimeType, uploadedAt
}
```

### Extraction (AI output)
```ts
{
  id, documentId, createdAt,
  documentType: 'f24' | 'visura' | ...,
  confidence,                       // 0..1
  taxpayer?: Partial<Taxpayer>,
  localTaxRows?: Array<{ municipalityCode, taxCode, year, amountDue }>,
  total?, rawText?, fields?: Record<string, unknown>
}
```

### TaxCalculation (auditable)
```ts
{
  id: 'imu_2026_001',
  taxType: 'IMU',
  year: 2026,
  municipalityCode: 'L612',
  rows: [{ taxCode: '3916', amount: 35.00 }, { taxCode: '3918', amount: 24.00 }],
  total: 59.00,
  engineVersion: '1.0.0',
  inputSources: ['visura_catastale.pdf', 'settings.json'],
  manualOverrides: ['aliquota set manually'],
  status: 'draft' | 'user_confirmed',
  createdAt, updatedAt
}
```

### F24 (generated)
```ts
{ id, calculationId, kind: 'acconto' | 'saldo' | 'unico', driveFileId, fileName, generatedAt }
```

## IMU tax-code dictionary (`src/lib/imu/taxCodes.ts`)

| Code | Meaning (do not translate the code) |
|------|--------------------------------------|
| 3912 | IMU abitazione principale e pertinenze |
| 3914 | IMU terreni |
| 3916 | IMU aree fabbricabili |
| 3918 | IMU altri fabbricati |
| 3925 | IMU immobili gruppo D — quota Stato |
| 3930 | IMU immobili gruppo D — incremento Comune |

The dictionary provides a localized **label** (IT/EN) for display while keeping the code itself
unchanged everywhere.
