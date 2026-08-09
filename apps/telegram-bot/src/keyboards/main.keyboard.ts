import { InlineKeyboard } from 'grammy';
import { config } from '@rabst24/config';

export function createMainKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Создать объявление', 'ad:create')
    .row()
    .text('Мои объявления', 'ad:mine')
    .text('Мой профиль', 'profile:mine')
    .row()
    .url('Открыть RABST24', config.miniAppUrl)
    .text('Связать с MAX', 'account:link');
}

export function createCategoryKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Вакансия', 'ad:type:vacancy')
    .text('Резюме', 'ad:type:resume')
    .row()
    .text('Техника', 'ad:type:equipment')
    .row()
    .text('Материалы', 'ad:type:material')
    .text('Инструменты', 'ad:type:tool')
    .row()
    .text('Отмена', 'ad:cancel');
}
