import { AD_TYPE_LABELS } from '@rabst24/shared';
import type { AdWithDetailsRecord } from '../ads/ad.repository.js';

export class ChannelPostFormatter {
  constructor(private readonly miniAppUrl = 'https://app.rabst24.ru') {}

  formatAd(ad: AdWithDetailsRecord): string {
    const type = ad.type.toLowerCase() as keyof typeof AD_TYPE_LABELS;
    const detailsUrl = `${this.miniAppUrl.replace(/\/+$/, '')}/${this.getDetailsPath(type, ad.id)}`;
    const contacts = ad.contacts.map((contact) => {
      const label = contact.label ?? contact.type.toLowerCase();
      return `${label}: ${contact.value}`;
    });
    const lines = [
      `${AD_TYPE_LABELS[type]}: ${ad.title}`,
      this.getSubtitle(ad),
      ad.description ? `\n${ad.description}` : null,
      ...this.getTypeSpecificLines(ad),
      ad.categoryText ? `Категория: ${ad.categoryText}` : null,
      ad.districtText ? `Район: ${ad.districtText}` : null,
      this.getAddress(ad) ? `Адрес: ${this.getAddress(ad)}` : null,
      ad.photos[0] ? `Фото: ${ad.photos[0].url}` : null,
      contacts.length ? `\nКонтакты:\n${contacts.join('\n')}` : null,
      `\nОткрыть объявление: ${detailsUrl}`
    ];

    return lines.filter(Boolean).join('\n');
  }

  private getSubtitle(ad: AdWithDetailsRecord): string | null {
    if (ad.vacancyDetails?.companyName) {
      return `Компания: ${ad.vacancyDetails.companyName}`;
    }

    if (ad.resumeDetails?.desiredPosition) {
      return `Профессия: ${ad.resumeDetails.desiredPosition}`;
    }

    const equipmentName = [ad.equipmentDetails?.brand, ad.equipmentDetails?.model]
      .filter(Boolean)
      .join(' ');

    return equipmentName ? `Модель: ${equipmentName}` : null;
  }

  private getTypeSpecificLines(ad: AdWithDetailsRecord): Array<string | null> {
    const type = ad.type.toLowerCase();

    if (type === 'vacancy') {
      const metro = [
        ...(ad.vacancyDetails?.metroStations.map((item) => {
          const minutes = item.walkingMinutes ? `, ${item.walkingMinutes} мин` : '';
          return `${item.metroStation.name}${minutes}`;
        }) ?? []),
        ...this.getMetadataMetroStations(ad)
      ];

      return [
        ad.vacancyDetails?.schedule ? `График: ${ad.vacancyDetails.schedule}` : null,
        ad.vacancyDetails?.experience ? `Опыт: ${ad.vacancyDetails.experience}` : null,
        this.getSalary(ad),
        metro.length ? `Метро: ${metro.join(', ')}` : null,
        ad.requirements.length
          ? `\nТребования:\n${ad.requirements.map((item) => `- ${item.text}`).join('\n')}`
          : null,
        ad.responsibilities.length
          ? `\nОбязанности:\n${ad.responsibilities.map((item) => `- ${item.text}`).join('\n')}`
          : null,
        ad.benefits.length ? `\nЛьготы:\n${ad.benefits.map((item) => `- ${item.text}`).join('\n')}` : null
      ];
    }

    if (type === 'resume') {
      const experience = this.getMetadataString(ad, ['experienceText', 'experience']);
      return [
        experience ? `Опыт: ${experience}` : null,
        ad.resumeDetails?.expectedSalary
          ? `Желаемая зарплата: ${ad.resumeDetails.expectedSalary.toString()} ${ad.resumeDetails.salaryCurrency}`
          : null
      ];
    }

    if (type === 'material' || type === 'tool') {
      return [
        ad.priceAmount ? `Цена: ${ad.priceAmount.toString()} ${ad.currency}` : null
      ];
    }

    return [
      ad.equipmentDetails?.condition ? `Состояние: ${ad.equipmentDetails.condition.toLowerCase()}` : null,
      ad.equipmentDetails?.rentalPrice
        ? `Аренда: ${ad.equipmentDetails.rentalPrice.toString()} ${ad.equipmentDetails.currency}`
        : null,
      ad.equipmentDetails?.salePrice
        ? `Цена: ${ad.equipmentDetails.salePrice.toString()} ${ad.equipmentDetails.currency}`
        : null
    ];
  }

  private getSalary(ad: AdWithDetailsRecord): string | null {
    if (!ad.vacancyDetails) {
      return ad.priceAmount ? `Цена: ${ad.priceAmount.toString()} ${ad.currency}` : null;
    }

    const from = ad.vacancyDetails.salaryFrom?.toString();
    const to = ad.vacancyDetails.salaryTo?.toString();
    const suffix = ad.vacancyDetails.salaryCurrency;

    if (from && to) {
      return `Зарплата: ${from}-${to} ${suffix}`;
    }

    if (from) {
      return `Зарплата: от ${from} ${suffix}`;
    }

    if (to) {
      return `Зарплата: до ${to} ${suffix}`;
    }

    return ad.vacancyDetails.isSalaryNegotiable ? 'Зарплата: по договоренности' : null;
  }

  private getAddress(ad: AdWithDetailsRecord): string | null {
    return this.getMetadataString(ad, ['address', 'addressText', 'fullAddress', 'locationAddress']);
  }

  private getMetadataMetroStations(ad: AdWithDetailsRecord): string[] {
    const metadata = this.getMetadataRecord(ad);
    const stations = metadata?.metroStations;

    if (!Array.isArray(stations)) {
      return [];
    }

    return stations
      .map((station) => {
        if (!station || typeof station !== 'object' || Array.isArray(station)) {
          return null;
        }

        const record = station as Record<string, unknown>;
        const name = typeof record.name === 'string' ? record.name.trim() : '';

        if (!name) {
          return null;
        }

        const minutes = typeof record.walkingMinutes === 'number' ? `, ${record.walkingMinutes} мин` : '';
        return `${name}${minutes}`;
      })
      .filter((station): station is string => Boolean(station));
  }

  private getMetadataString(ad: AdWithDetailsRecord, keys: string[]): string | null {
    const metadata = this.getMetadataRecord(ad);

    if (!metadata) {
      return null;
    }

    for (const key of keys) {
      const value = metadata[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  private getMetadataRecord(ad: AdWithDetailsRecord): Record<string, unknown> | null {
    if (!ad.metadataJson) {
      return null;
    }

    try {
      const metadata = JSON.parse(ad.metadataJson) as unknown;
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return null;
      }

      return metadata as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private getDetailsPath(type: keyof typeof AD_TYPE_LABELS, id: string): string {
    const routes: Record<keyof typeof AD_TYPE_LABELS, string> = {
      vacancy: 'vacancies',
      resume: 'resumes',
      equipment: 'equipment',
      material: 'materials',
      tool: 'tools'
    };

    return `${routes[type]}/${id}`;
  }
}
