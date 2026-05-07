export interface ModuleStatus {
  module: string;
  status: 'ready';
}

export class FoundationRepository {
  constructor(private readonly moduleName: string) {}

  getStatus(): ModuleStatus {
    return {
      module: this.moduleName,
      status: 'ready'
    };
  }
}

export class FoundationService {
  constructor(private readonly repository: FoundationRepository) {}

  getModuleName(): string {
    return this.repository.getStatus().module;
  }

  getStatus(): ModuleStatus {
    return this.repository.getStatus();
  }
}
