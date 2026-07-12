import { validateProject } from '../model/validators.js';
import { migrateProject } from './migrations.js';

export function exportProject(project){
  return JSON.stringify(project, null, 2);
}

export function importProjectFromText(text){
  const raw = JSON.parse(text);
  const project = migrateProject(raw);
  const validation = validateProject(project);
  if(!validation.valid) throw new Error(validation.errors.join('
'));
  return project;
}
