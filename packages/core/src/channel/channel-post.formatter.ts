import type { AdTypeCode } from '@rabst24/shared';
import type { MaxInlineKeyboardAttachment } from '@rabst24/max-api';
import type { AdWithDetailsRecord } from '../ads/ad.repository.js';

const DEFAULT_MINI_APP_URL = 'https://app.rabst24.ru';

export interface ChannelPostFormatterOptions {
  miniAppUrl?: string;
  miniAppWebApp?: string | null;
}

export class ChannelPostFormatter {
  private readonly miniAppUrl: string;
  private readonly miniAppWebApp?: string;

  constructor(options: string | ChannelPostFormatterOptions = DEFAULT_MINI_APP_URL) {
    if (typeof options === 'string') {
      this.miniAppUrl = options;
      return;
    }

    this.miniAppUrl = options.miniAppUrl ?? DEFAULT_MINI_APP_URL;
    this.miniAppWebApp = options.miniAppWebApp?.trim() || undefined;
  }

  formatAd(ad: AdWithDetailsRecord): string {
    const type = this.getAdType(ad);
    const lines = [
      `**${this.getTypeLabel(type)}: ${this.escapeMarkdown(ad.title)}**`,
      ...this.getTemplateLines(ad, type),
      this.getContactsBlock(ad),
      `\n[Открыть объявление в приложении](${this.getDetailsUrl(ad)})`
    ];

    return this.trimToMaxMessageLength(lines.filter(Boolean).join('\n'));
  }

  getDetailsUrl(ad: AdWithDetailsRecord): string {
    const miniAppLink = this.getMiniAppLaunchUrl(this.getMiniAppPayload(ad));

    if (miniAppLink) {
      return miniAppLink;
    }

    return this.getWebDetailsUrl(ad);
  }

  private getWebDetailsUrl(ad: AdWithDetailsRecord): string {
    const type = this.getAdType(ad);
    return `${this.miniAppUrl.replace(/\/+$/, '')}/${this.getDetailsPath(type, ad.id)}`;
  }

  createCtaKeyboard(ad: AdWithDetailsRecord): MaxInlineKeyboardAttachment {
    const miniAppButton = this.createMiniAppButton(ad);

    return {
      type: 'inline_keyboard',
      payload: {
        buttons: [
          [
            miniAppButton ?? {
              type: 'link',
              text: 'Открыть объявление',
              url: this.getDetailsUrl(ad)
            }
          ]
        ]
      }
    };
  }

  private createMiniAppButton(ad: AdWithDetailsRecord): MaxInlineKeyboardAttachment['payload']['buttons'][number][number] | null {
    if (!this.miniAppWebApp) {
      return null;
    }

    const payload = this.getMiniAppPayload(ad);

    return {
      type: 'open_app',
      text: 'Открыть в mini app',
      web_app: this.getMiniAppLaunchValue(payload),
      payload
    };
  }

  private getMiniAppLaunchValue(payload: string): string {
    if (!this.miniAppWebApp) {
      return this.miniAppUrl;
    }

    return this.getMiniAppLaunchUrl(payload) ?? this.miniAppWebApp;
  }

  private getMiniAppLaunchUrl(payload: string): string | null {
    if (!this.miniAppWebApp || !this.isHttpUrl(this.miniAppWebApp)) {
      return null;
    }

    try {
      const url = new URL(this.miniAppWebApp);
      url.searchParams.set('startapp', payload);
      return url.toString();
    } catch {
      return null;
    }
  }

  private getMiniAppPayload(ad: AdWithDetailsRecord): string {
    return `ad_${this.getAdType(ad)}_${ad.id}`;
  }

  private isHttpUrl(value: string): boolean {
    return value.startsWith('https://') || value.startsWith('http://');
  }

  private getTemplateLines(ad: AdWithDetailsRecord, type: AdTypeCode): Array<string | null> {
    if (type === 'resume') {
      return this.formatResume(ad);
    }

    if (type === 'vacancy') {
      return this.formatVacancy(ad);
    }

    if (type === 'equipment') {
      return this.formatEquipment(ad);
    }

    return this.formatTradeAd(ad);
  }

  private formatResume(ad: AdWithDetailsRecord): Array<string | null> {
    return [
      this.formatLine('Профессия', ad.resumeDetails?.desiredPosition),
      this.formatLine('О себе / опыт', ad.description, ['Опыт', 'О себе']),
      this.formatLine('Желаемая зарплата', this.formatMoneyValue(ad.resumeDetails?.expectedSalary, ad.resumeDetails?.salaryCurrency ?? ad.currency)),
      this.formatLine('Район', ad.districtText),
      this.formatLine('Адрес', this.getAddress(ad))
    ];
  }

  private formatVacancy(ad: AdWithDetailsRecord): Array<string | null> {
    return [
      this.formatLine('Компания', this.getVacancyCompanyName(ad)),
      this.formatLine('Описание', ad.description, ['Описание']),
      this.getSalary(ad),
      this.formatLine('Район', ad.districtText),
      this.formatLine('Адрес', this.getAddress(ad))
    ];
  }

  private formatEquipment(ad: AdWithDetailsRecord): Array<string | null> {
    const model = [ad.equipmentDetails?.brand, ad.equipmentDetails?.model].filter(Boolean).join(' ');

    return [
      this.formatLine('Модель', model || null),
      this.formatLine('Описание', ad.description, ['Описание']),
      this.formatLine('Состояние', ad.equipmentDetails?.condition?.toLowerCase()),
      this.formatLine('Аренда', this.formatMoneyValue(ad.equipmentDetails?.rentalPrice, ad.equipmentDetails?.currency ?? ad.currency)),
      this.formatLine('Цена', this.formatMoneyValue(ad.equipmentDetails?.salePrice, ad.equipmentDetails?.currency ?? ad.currency)),
      this.formatLine('Район', ad.districtText),
      this.formatLine('Адрес', this.getAddress(ad))
    ];
  }

  private formatTradeAd(ad: AdWithDetailsRecord): Array<string | null> {
    return [
      this.formatLine('Описание', ad.description, ['Описание']),
      this.formatLine('Цена', this.formatMoneyValue(ad.priceAmount, ad.currency)),
      this.formatLine('Район', ad.districtText),
      this.formatLine('Адрес', this.getAddress(ad))
    ];
  }

  private getSalary(ad: AdWithDetailsRecord): string | null {
    const salaryText = this.getMetadataString(ad, ['salaryText']);
    if (salaryText) {
      return this.formatLine('Зарплата', salaryText, ['Зарплата']);
    }

    if (!ad.vacancyDetails) {
      return null;
    }

    const from = ad.vacancyDetails.salaryFrom?.toString();
    const to = ad.vacancyDetails.salaryTo?.toString();
    const suffix = this.formatCurrency(ad.vacancyDetails.salaryCurrency);

    if (from && to) {
      return `Зарплата: ${this.escapeMarkdown(`${from}-${to} ${suffix}`)}`;
    }

    if (from) {
      return `Зарплата: ${this.escapeMarkdown(`от ${from} ${suffix}`)}`;
    }

    if (to) {
      return `Зарплата: ${this.escapeMarkdown(`до ${to} ${suffix}`)}`;
    }

    return ad.vacancyDetails.isSalaryNegotiable ? 'Зарплата: по договорённости' : null;
  }

  private getContactsBlock(ad: AdWithDetailsRecord): string | null {
    const contacts = ad.contacts
      .map((contact) => this.formatContact(contact))
      .filter((contact): contact is string => Boolean(contact));

    return contacts.length ? `\nКонтакты:\n${contacts.join('\n')}` : null;
  }

  private getVacancyCompanyName(ad: AdWithDetailsRecord): string | null {
    const companyName = ad.vacancyDetails?.companyName?.trim();

    if (companyName && companyName !== 'Работодатель' && companyName !== 'Работодатель Rabst24') {
      return companyName;
    }

    return this.getOwnerName(ad);
  }

  private getOwnerName(ad: AdWithDetailsRecord): string | null {
    const fullName = [ad.owner.firstName, ad.owner.lastName].filter(Boolean).join(' ').trim();

    return ad.owner.displayName || fullName || ad.owner.maxUsername || null;
  }

  private formatContact(contact: AdWithDetailsRecord['contacts'][number]): string | null {
    const value = this.stripKnownLabel(contact.value, ['Контакт', 'Контакты']).trim();

    if (!value) {
      return null;
    }

    const rawLabel = contact.label ?? this.formatContactType(contact.type);
    const label = this.stripKnownLabel(rawLabel, ['Контакт', 'Контакты']).trim();

    if (!label || this.isGenericContactLabel(rawLabel)) {
      return this.escapeMarkdown(value);
    }

    return `${this.escapeMarkdown(label)}: ${this.escapeMarkdown(this.stripKnownLabel(value, [label]))}`;
  }

  private formatLine(label: string, value: unknown, duplicateLabels: string[] = [label]): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const text = String(value).trim();
    if (!text) {
      return null;
    }

    return `${label}: ${this.escapeMarkdown(this.stripKnownLabel(text, duplicateLabels))}`;
  }

  private stripKnownLabel(value: string, labels: string[]): string {
    let result = value.trim();

    for (const label of labels) {
      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(`^${escapedLabel}\\s*[:：-]?\\s*`, 'i'), '').trim();
    }

    return result;
  }

  private isGenericContactLabel(label: string): boolean {
    const normalized = label.trim().toLowerCase();
    return normalized === 'контакт' || normalized === 'контакты' || normalized === 'связь';
  }

  private getAddress(ad: AdWithDetailsRecord): string | null {
    return this.getMetadataString(ad, ['address', 'addressText', 'fullAddress', 'locationAddress']);
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

  private getDetailsPath(type: AdTypeCode, id: string): string {
    const routes: Record<AdTypeCode, string> = {
      vacancy: 'vacancies',
      resume: 'resumes',
      equipment: 'equipment',
      material: 'materials',
      tool: 'tools'
    };

    return `${routes[type]}/${id}`;
  }

  private getAdType(ad: AdWithDetailsRecord): AdTypeCode {
    return ad.type.toLowerCase() as AdTypeCode;
  }

  private getTypeLabel(type: AdTypeCode): string {
    const labels: Record<AdTypeCode, string> = {
      vacancy: 'Вакансия',
      resume: 'Резюме',
      equipment: 'Техника',
      material: 'Материалы',
      tool: 'Инструменты'
    };

    return labels[type];
  }

  private formatContactType(type: string): string {
    const labels: Record<string, string> = {
      MAX: 'MAX',
      PHONE: 'Телефон',
      EMAIL: 'Email',
      WEBSITE: 'Сайт',
      OTHER: 'Контакт'
    };

    return labels[type] ?? type.toLowerCase();
  }

  private formatMoneyValue(value: { toString(): string } | null | undefined, currency: string): string | null {
    if (!value) {
      return null;
    }

    return `${value.toString()} ${this.formatCurrency(currency)}`;
  }

  private formatCurrency(currency: string): string {
    return currency.toUpperCase() === 'RUB' ? '₽' : currency;
  }

  private escapeMarkdown(value: string): string {
    return value.replace(/([\\`*_{}[\]()#+\-.!|>])/g, '\\$1');
  }

  private trimToMaxMessageLength(text: string): string {
    if (text.length <= 3900) {
      return text;
    }

    return `${text.slice(0, 3890).trimEnd()}...`;
  }
}
