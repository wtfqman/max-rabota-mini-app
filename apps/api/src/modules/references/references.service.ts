import {
  getCategorySuggestions,
  getDistrictSuggestions
} from '@rabst24/shared';
import { FoundationService } from '../../shared/modules/module-status.js';
import type { ReferencesRepository } from './references.repository.js';

export class ReferencesService extends FoundationService {
  constructor(repository: ReferencesRepository) {
    super(repository);
  }

  categories(query?: string) {
    return getCategorySuggestions(query);
  }

  districts(query?: string) {
    return getDistrictSuggestions(query);
  }
}
