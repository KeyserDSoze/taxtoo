/**
 * OneDrive service via Microsoft Graph API.
 * Interface deliberately mirrors googleDrive.ts for easy swap in storage.ts.
 *
 * OneDrive is path-based: folders are created automatically on upload.
 * We use folder paths as "ids".
 */

import axios from 'axios';
import type { AppSettings, PropertyFolders } from '../types';

const GRAPH = 'https://graph.microsoft.com/v1.0/me/drive';
const APP_FOLDER = 'Apps/Taxtoo';

function authHeader(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

// ---------- Folders ----------

/** Returns the property folder paths (used as "ids"). OneDrive creates them on upload. */
export function ensurePropertyFolders(
  fiscalCode: string,
  propertyKey: string
): Promise<PropertyFolders> {
  const taxpayerFolderId = `${APP_FOLDER}/taxpayers/${fiscalCode}`;
  const propertyFolderId = `${taxpayerFolderId}/properties/${propertyKey}`;
  return Promise.resolve({
    taxpayerFolderId,
    propertyFolderId,
    documentsId: `${propertyFolderId}/documents`,
    extractionsId: `${propertyFolderId}/extractions`,
    calculationsId: `${propertyFolderId}/calculations`,
    f24Id: `${propertyFolderId}/f24`,
    ratesId: `${propertyFolderId}/aliquote`,
  });
}

export function ensureTaxpayerFolder(fiscalCode: string): Promise<string> {
  return Promise.resolve(`${APP_FOLDER}/taxpayers/${fiscalCode}`);
}

// ---------- Files ----------

/**
 * Upload a file to OneDrive by path. `parentId` is the relative folder path
 * (e.g. "Apps/Taxtoo/taxpayers/<fc>/documents"). Intermediate folders are auto-created.
 */
export async function uploadFile(
  accessToken: string,
  name: string,
  content: Blob | string,
  mimeType: string,
  parentId: string
): Promise<string> {
  const blob =
    typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;
  const path = `${parentId}/${name}`;

  const res = await axios.put(`${GRAPH}/root:/${path}:/content`, blob, {
    headers: { ...authHeader(accessToken), 'Content-Type': mimeType },
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

  await axios.put(`${GRAPH}/items/${fileId}/content`, blob, {
    headers: { ...authHeader(accessToken), 'Content-Type': mimeType },
  });
}

export async function downloadFileText(
  accessToken: string,
  fileId: string
): Promise<string> {
  const res = await axios.get(`${GRAPH}/items/${fileId}/content`, {
    headers: authHeader(accessToken),
  });
  return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
}

export async function downloadFileBlob(
  accessToken: string,
  fileId: string
): Promise<Blob> {
  const res = await axios.get(`${GRAPH}/items/${fileId}/content`, {
    headers: authHeader(accessToken),
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
    `${GRAPH}/items/${fileId}`,
    { name: newName },
    { headers: authHeader(accessToken) }
  );
}

export async function deleteFile(accessToken: string, fileId: string): Promise<void> {
  await axios.delete(`${GRAPH}/items/${fileId}`, { headers: authHeader(accessToken) });
}

// ---------- Settings ----------

export async function saveSettings(
  accessToken: string,
  settings: AppSettings,
  _existingFileId?: string | null
): Promise<string> {
  const json = JSON.stringify(settings, null, 2);
  // Path-based upsert: works at first save and on updates, avoids stale-id 400/404.
  return uploadFile(accessToken, 'settings.json', json, 'application/json', `${APP_FOLDER}/settings`);
}

export async function loadSettings(
  accessToken: string
): Promise<{ settings: AppSettings; fileId: string } | null> {
  try {
    const metaRes = await axios.get(`${GRAPH}/root:/${APP_FOLDER}/settings/settings.json`, {
      headers: authHeader(accessToken),
    });
    const fileId = metaRes.data.id as string;
    const text = await downloadFileText(accessToken, fileId);
    return { settings: JSON.parse(text) as AppSettings, fileId };
  } catch {
    return null;
  }
}
