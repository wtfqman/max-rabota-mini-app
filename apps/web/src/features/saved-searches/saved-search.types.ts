import type { VacancyListQuery } from '../vacancies/vacancy.types.js';

export type SavedSearchAdType = 'vacancy' | 'resume' | 'equipment' | 'material' | 'tool';
export type SavedSearchFrequency = 'IMMEDIATE' | 'DAILY' | 'OFF';

export interface SavedSearch {
  id: string;
  name: string;
  adType: SavedSearchAdType;
  query: VacancyListQuery;
  canonicalFilters: VacancyListQuery;
  notificationFrequency: SavedSearchFrequency;
  enabled: boolean;
  lastMatchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
