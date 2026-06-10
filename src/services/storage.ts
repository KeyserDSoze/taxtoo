/**
 * Storage abstraction — dispatches to Google Drive or OneDrive based on user.provider.
 * Components import from here, never from googleDrive / oneDrive directly.
 */

import type { AppUser, AppSettings, PropertyFolders } from '../types';
import * as gDrive from './googleDrive';
import * as oDrive from './oneDrive';

export function ensureTaxpayerFolder(user: AppUser, fiscalCode: string): Promise<string> {
  if (user.provider === 'microsoft') return oDrive.ensureTaxpayerFolder(fiscalCode);
  return gDrive.ensureTaxpayerFolder(user.accessToken, fiscalCode);
}

export function ensurePropertyFolders(
  user: AppUser,
  fiscalCode: string,
  propertyKey: string
): Promise<PropertyFolders> {
  if (user.provider === 'microsoft')
    return oDrive.ensurePropertyFolders(fiscalCode, propertyKey);
  return gDrive.ensurePropertyFolders(user.accessToken, fiscalCode, propertyKey);
}

export function uploadFile(
  user: AppUser,
  name: string,
  content: Blob | string,
  mimeType: string,
  parentId: string
): Promise<string> {
  if (user.provider === 'microsoft')
    return oDrive.uploadFile(user.accessToken, name, content, mimeType, parentId);
  return gDrive.uploadFile(user.accessToken, name, content, mimeType, parentId);
}

export function updateFile(
  user: AppUser,
  fileId: string,
  content: Blob | string,
  mimeType: string
): Promise<void> {
  if (user.provider === 'microsoft')
    return oDrive.updateFile(user.accessToken, fileId, content, mimeType);
  return gDrive.updateFile(user.accessToken, fileId, content, mimeType);
}

export function downloadFileBlob(user: AppUser, fileId: string): Promise<Blob> {
  if (user.provider === 'microsoft') return oDrive.downloadFileBlob(user.accessToken, fileId);
  return gDrive.downloadFileBlob(user.accessToken, fileId);
}

export function downloadFileText(user: AppUser, fileId: string): Promise<string> {
  if (user.provider === 'microsoft') return oDrive.downloadFileText(user.accessToken, fileId);
  return gDrive.downloadFileText(user.accessToken, fileId);
}

export function renameFile(user: AppUser, fileId: string, newName: string): Promise<void> {
  if (user.provider === 'microsoft') return oDrive.renameFile(user.accessToken, fileId, newName);
  return gDrive.renameFile(user.accessToken, fileId, newName);
}

export function deleteFile(user: AppUser, fileId: string): Promise<void> {
  if (user.provider === 'microsoft') return oDrive.deleteFile(user.accessToken, fileId);
  return gDrive.deleteFile(user.accessToken, fileId);
}

export function saveSettings(
  user: AppUser,
  settings: AppSettings,
  existingFileId?: string | null
): Promise<string> {
  if (user.provider === 'microsoft')
    return oDrive.saveSettings(user.accessToken, settings, existingFileId);
  return gDrive.saveSettings(user.accessToken, settings, existingFileId);
}

export function loadSettings(
  user: AppUser
): Promise<{ settings: AppSettings; fileId: string } | null> {
  if (user.provider === 'microsoft') return oDrive.loadSettings(user.accessToken);
  return gDrive.loadSettings(user.accessToken);
}
