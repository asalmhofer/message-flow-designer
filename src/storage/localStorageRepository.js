import { STORAGE_KEY } from '../config/constants.js';
import { exportProject, importProjectFromText } from './importExportService.js';

export function saveProject(project, storage = localStorage){
  storage.setItem(STORAGE_KEY, exportProject(project));
}

export function loadProject(storage = localStorage){
  const text = storage.getItem(STORAGE_KEY);
  return text ? importProjectFromText(text) : null;
}
