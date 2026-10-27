/**
 * Семейная оптика — нормы (константы политики оплаты). Черновик для обсуждения
 * с Галиной, цифры не утверждены.
 *
 * Модель (чат с Русланом, 27.10): ЗП консультанта = оклад + % от личной
 * выручки по ЛЕСТНИЦЕ ГРЕЙДОВ выполнения плана, где выручка от клиентов,
 * которых вернули из базы, весит в плане тяжелее обычной — это и есть
 * стимул звонить в базу, а не отдельная премия «за голову» сверху.
 *
 *   • Грейд выбирается по ВЗВЕШЕННОМУ % выполнения плана:
 *       взвешенная_выручка = выручка_обычная + выручка_из_базы × весБазы
 *       взвешенный_% = взвешенная_выручка / план × 100
 *     Но сама ставка грейда умножается на РЕАЛЬНУЮ выручку (без веса) —
 *     вес влияет только на то, в какую ступень грейда попадает консультант,
 *     а не на то, с какой суммы считаются деньги.
 *   • Средний чек — не отдельная премия, а ОГРАНИЧИТЕЛЬ: если факт ниже
 *     порога (% от планового чека), премия по грейду урезается до указанной
 *     доли. Так план нельзя закрыть одними скидками.
 *   • «Из базы» в расчёте — не то, что вписывает сам консультант: это
 *     клиент без заказов дольше 12 месяцев, и звонок ему должен быть
 *     зафиксирован в CRM до визита. Премия закрывается после окна на
 *     возвраты товара. Это процессное правило, не часть формулы — калькулятор
 *     его не проверяет, им награждают то, что уже прошло проверку.
 *
 * Оклад, весБазы, грейды и параметры чека — ПРИМЕРНЫЕ числа для старта
 * разговора с Галиной, ничего не зафиксировано.
 *
 * Правится на /semeynaya-optika/settings/ (localStorage одного браузера)
 * либо здесь в коде, чтобы стало боевым для всех.
 *
 * Грейды: массив ступеней {порог, ставка}, отсортирован по порогу.
 * Первый элемент — базовая ставка (порог 0, «ниже всех порогов»).
 * Ставка = ставка последней ступени, чей порог ≤ взвешенному % плана.
 */
(function (global) {
  var STORAGE_KEY = 'semeynaya-optika:norms';

  var DEFAULT_NORMS = {
    оклад: 30000,
    весБазы: 2,  // во сколько раз выручка от клиента «из базы» весит тяжелее в плане
    грейды: [
      { порог: 0,   ставка: 0.03 },  // взвешенный план < 80%
      { порог: 80,  ставка: 0.05 },
      { порог: 100, ставка: 0.07 },
      { порог: 110, ставка: 0.09 }   // перевыполнение
    ],
    чек: {
      план: 5800,        // плановый средний чек, ₽
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

  // ── общая логика грейдов ────────────────────────────────────────────────
  function gradeRate(грейды, pct) {
    var r = (грейды[0] || {}).ставка || 0;
    for (var i = 0; i < грейды.length; i++) {
      if (pct >= грейды[i].порог) r = грейды[i].ставка;
    }
    return r;
  }
  function nextGrade(грейды, pct) {
    for (var i = 0; i < грейды.length; i++) {
      if (грейды[i].порог > pct) return грейды[i];
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
    gradeRate: gradeRate,
    nextGrade: nextGrade
  };
})(window);
