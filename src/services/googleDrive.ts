/**
 * Google Drive API v3 service.
 * Uses the OAuth access token obtained from @react-oauth/google.
 *
 * Folder structure on Drive:
 *   Taxtoo/
 *     taxpayers/<FISCAL_CODE>/
 *       profile.json
 *       properties/<COMUNE>_<id>/{documents,extractions,calculations,f24}
 *       payments/<year>/
 *   App Data Folder ← settings.json (private, app-only)
 *
 * Interface deliberately mirrors oneDrive.ts so storage.ts can swap providers.
 */

import axios from 'axios';
import type { AppSettings, PropertyFolders } from '../types';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const ROOT_FOLDER = 'Taxtoo';

function authHeader(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

// ---------- Folders ----------

export async function findOrCreateFolder(
  accessToken: string,
  name: string,
  parentId?: string
): Promise<string> {
  const safeName = name.replace(/'/g, "\\'");
  const q = parentId
    ? `name='${safeName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${safeName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const res = await axios.get(`${DRIVE_API}/files`, {
    headers: authHeader(accessToken),
    params: { q, fields: 'files(id,name)', spaces: 'drive' },
  });

  if (res.data.files.length > 0) {
    return res.data.files[0].id as string;
  }

  const meta: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) meta.parents = [parentId];

  const created = await axios.post(`${DRIVE_API}/files`, meta, {
    headers: authHeader(accessToken),
    params: { fields: 'id' },
  });
  return created.data.id as string;
}

/** Ensure Taxtoo/taxpayers/<fiscalCode> exists and return its folder id. */
export async function ensureTaxpayerFolder(
  accessToken: string,
  fiscalCode: string
): Promise<string> {
  const rootId = await findOrCreateFolder(accessToken, ROOT_FOLDER);
  const taxpayersId = await findOrCreateFolder(accessToken, 'taxpayers', rootId);
  return findOrCreateFolder(accessToken, fiscalCode, taxpayersId);
}

/** Ensure the full folder tree for a property and return all folder ids. */
export async function ensurePropertyFolders(
  accessToken: string,
  fiscalCode: string,
  propertyKey: string
): Promise<PropertyFolders> {
  const taxpayerFolderId = await ensureTaxpayerFolder(accessToken, fiscalCode);
  const propertiesId = await findOrCreateFolder(accessToken, 'properties', taxpayerFolderId);
  const propertyFolderId = await findOrCreateFolder(accessToken, propertyKey, propertiesId);
  const documentsId = await findOrCreateFolder(accessToken, 'documents', propertyFolderId);
  const extractionsId = await findOrCreateFolder(accessToken, 'extractions', propertyFolderId);
  const calculationsId = await findOrCreateFolder(accessToken, 'calculations', propertyFolderId);
  const f24Id = await findOrCreateFolder(accessToken, 'f24', propertyFolderId);
  return { taxpayerFolderId, propertyFolderId, documentsId, extractionsId, calculationsId, f24Id };
}

// ---------- File upload (multipart) ----------

export async function uploadFile(
  accessToken: string,
  name: string,
  content: Blob | string,
  mimeType: string,
  parentId: string
): Promise<string> {
  const metadata = JSON.stringify({ name, parents: [parentId] });
  const blob =
    typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;

  const form = new FormData();
  form.append('metadata', new Blob([metadata], { type: 'application/json' }));
  form.append('file', blob);

  const res = await axios.post(`${UPLOAD_API}/files?uploadType=multipart`, form, {
    headers: authHeader(accessToken),
    params: { fields: 'id' },
  });
  return res.data.id as string;
}

export async function updateFile(
  accessToken: string,
  fileId: string,
  content: Blob | string,
  mimeType: string
): Promise<void> {
  const blob =
    typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;

  await axios.patch(`${UPLOAD_API}/files/${fileId}?uploadType=media`, blob, {
    headers: { ...authHeader(accessToken), 'Content-Type': mimeType },
  });
}

export async function downloadFileText(
  accessToken: string,
  fileId: string
): Promise<string> {
  const res = await axios.get(`${DRIVE_API}/files/${fileId}`, {
    headers: authHeader(accessToken),
    params: { alt: 'media' },
  });
  return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
}

export async function downloadFileBlob(
  accessToken: string,
  fileId: string
): Promise<Blob> {
  const res = await axios.get(`${DRIVE_API}/files/${fileId}`, {
    headers: authHeader(accessToken),
    params: { alt: 'media' },
    responseType: 'blob',
  });
  return res.data as Blob;
}

export async function renameFile(
  accessToken: string,
  fileId: string,
  newName: string
): Promise<void> {
  await axios.patch(
    `${DRIVE_API}/files/${fileId}`,
    { name: newName },
    { headers: authHeader(accessToken), params: { fields: 'id' } }
  );
}

export async function deleteFile(accessToken: string, fileId: string): Promise<void> {
  await axios.delete(`${DRIVE_API}/files/${fileId}`, { headers: authHeader(accessToken) });
}

// ---------- App Data (settings) ----------

async function findAppDataFile(
  accessToken: string,
  name: string
): Promise<string | null> {
  const res = await axios.get(`${DRIVE_API}/files`, {
    headers: authHeader(accessToken),
    params: { q: `name='${name}'`, spaces: 'appDataFolder', fields: 'files(id)' },
  });
  return res.data.files.length > 0 ? (res.data.files[0].id as string) : null;
}

export async function saveSettings(
  accessToken: string,
  settings: AppSettings,
  existingFileId?: string | null
): Promise<string> {
  const json = JSON.stringify(settings, null, 2);
  const mimeType = 'application/json';

  if (existingFileId) {
    await updateFile(accessToken, existingFileId, json, mimeType);
    return existingFileId;
  }

  const metadata = JSON.stringify({ name: 'settings.json', parents: ['appDataFolder'] });
  const form = new FormData();
  form.append('metadata', new Blob([metadata], { type: 'application/json' }));
  form.append('file', new Blob([json], { type: mimeType }));

  const res = await axios.post(`${UPLOAD_API}/files?uploadType=multipart`, form, {
    headers: authHeader(accessToken),
    params: { fields: 'id' },
  });
  return res.data.id as string;
}

export async function loadSettings(
  accessToken: string
): Promise<{ settings: AppSettings; fileId: string } | null> {
  const fileId = await findAppDataFile(accessToken, 'settings.json');
  if (!fileId) return null;

  const text = await downloadFileText(accessToken, fileId);
  try {
    return { settings: JSON.parse(text) as AppSettings, fileId };
  } catch {
    return null;
  }
}
