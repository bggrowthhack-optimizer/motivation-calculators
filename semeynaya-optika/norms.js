/**
 * Семейная оптика — нормы (константы политики оплаты). Черновик для обсуждения
 * с Галиной, цифры не утверждены.
 *
 * Модель (чат с Русланом, 27.10, пересмотрена трижды в тот же день):
 * ЗП консультанта = оклад + % от личной выручки (общей, не только по
 * «заказам» — все продажи консультанта).
 *
 *   • ГРЕЙД (ставка %) берётся от ВЫПОЛНЕНИЯ ПЛАНА ФИЛИАЛА в целом (в %,
 *     как и считает система) — не от личного плана консультанта. Личная
 *     выручка используется только для денег (ставка × личная выручка),
 *     не для выбора ступени.
 *   • Работа с базой — НЕ про то, кто вернул конкретного клиента и не
 *     про звонки (это спорно и неотслеживаемо по факту продажи).
 *     Вместо этого — личная НОРМА ЗАПИСЕЙ ИЗ БАЗЫ за месяц: сколько
 *     клиентов из базы консультант лично записал на приём. Бинарно,
 *     без градаций: норма выполнена или нет. Выполнена — ставка +1 п.п.,
 *     не выполнена — ставка −1 п.п. Запись — объективно проверяемое
 *     действие (CRM), в отличие от того, кто потом обслужил клиента
 *     в зале, поэтому спора об атрибуции нет.
 *   • Средний чек — всё ещё не отдельная премия, а ОГРАНИЧИТЕЛЬ: если факт
 *     ниже порога (% от планового чека), премия урезается до указанной
 *     доли.
 *
 * Оклад, грейды, норма записей и параметры чека — ПРИМЕРНЫЕ числа для
 * старта разговора с Галиной, ничего не зафиксировано.
 *
 * Правится на /semeynaya-optika/settings/ (localStorage одного браузера)
 * либо здесь в коде, чтобы стало боевым для всех.
 *
 * Грейды: массив ступеней {порог, ставка}, отсортирован по порогу.
 * Первый элемент — базовая ставка (порог 0, «ниже всех порогов»).
 */
(function (global) {
  var STORAGE_KEY = 'semeynaya-optika:norms';

  var DEFAULT_NORMS = {
    оклад: 30000,
    грейды: [
      { порог: 0,   ставка: 0.03 },  // план филиала < 80%
      { порог: 80,  ставка: 0.05 },
      { порог: 100, ставка: 0.07 },
      { порог: 110, ставка: 0.09 }   // перевыполнение
    ],
    записи: {
      норма: 15,      // сколько записей из базы в месяц считается нормой
      надбавка: 0.01  // ±1 п.п. к ставке: выполнена норма — плюс, не выполнена — минус
    },
    чек: {
      план: 12000,       // плановый средний чек, ₽ (цифра от Руслана, 27.10)
      порогДоли: 90,      // ниже этой % от планового чека — премия урезается
      урезаниеДо: 70       // до какой % от расчётной премии урезаем при провале чека
    }
  };

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }

  function merge(base, over) {
    if (Array.isArray(base)) return Array.isArray(over) ? over.slice() : base.slice();
    var out = isObj(base) ? Object.assign({}, base) : base;
    Object.keys(over || {}).forEach(function (k) {
      out[k] = (isObj(base[k]) && isObj(over[k])) || (Array.isArray(base[k]) && Array.isArray(over[k]))
        ? merge(base[k], over[k])
        : over[k];
    });
    return out;
  }

  function readOverride() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function load() {
    var over = readOverride();
    return over ? merge(DEFAULT_NORMS, over) : merge(DEFAULT_NORMS, {});
  }

  function save(norms) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(norms)); return true; }
    catch (e) { return false; }
  }

  function reset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  function isCustom() { return !!readOverride(); }

  // ── общая логика ступеней ───────────────────────────────────────────────
  function stepValue(ступени, pct) {
    var r = (ступени[0] || {}).ставка || 0;
    for (var i = 0; i < ступени.length; i++) {
      if (pct >= ступени[i].порог) r = ступени[i].ставка;
    }
    return r;
  }
  function nextStep(ступени, pct) {
    for (var i = 0; i < ступени.length; i++) {
      if (ступени[i].порог > pct) return ступени[i];
    }
    return null;
  }

  global.SO_NORMS = {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_NORMS: DEFAULT_NORMS,
    load: load,
    save: save,
    reset: reset,
    isCustom: isCustom,
    gradeRate: stepValue,
    nextGrade: nextStep
  };
})(window);
