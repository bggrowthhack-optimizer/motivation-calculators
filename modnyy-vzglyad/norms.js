/**
 * Модный взгляд — нормы (константы политики оплаты).
 *
 * Модель (встреча 08.09): ЗП = оклад + % от личной выручки + KPI-премия.
 *   • % от выручки — по ГРЕЙДУ выполнения плана продаж филиала (лестница).
 *   • KPI — один на месяц, бинарный (выполнил план по KPI → фикс. премия).
 *     Оптометрист: KPI = средний чек линз ЗА ПАРУ (все линзы, не только ВТЛ).
 *     Консультант:  KPI = средний чек заказа очков (линзы + оправа).
 *
 * Пороги KPI зафиксированы 22.09 (Руслан + Андрей): 13 000 ₽ за пару линз,
 * 17 000 ₽ за заказ очков. Важно: в iTigris средний чек линз выгружается
 * ЗА ОДНУ линзу — порог 13 000 сравнивать с удвоенным значением.
 * База на момент решения: пара линз у топ-5 ≈ 9 000 ₽; средний чек своего
 * заказа по сети за август — 10 903 ₽ (265 заказов), у топ-5 ≈ 14 000 ₽.
 *
 * Не зафиксировано: точные пороги/ставки грейдов, вес премии (10 000 — пример),
 * оклады. Правится на /modnyy-vzglyad/settings/ (localStorage одного браузера)
 * либо здесь в коде, чтобы стало боевым для всех.
 *
 * Грейды: массив ступеней {порог, ставка}, отсортирован по порогу.
 * Первый элемент — базовая ставка (порог 0, «ниже всех порогов»).
 * Ставка = ставка последней ступени, чей порог ≤ % выполнения плана.
 */
(function (global) {
  var STORAGE_KEY = 'modnyy-vzglyad:norms';

  var ГРЕЙДЫ_ПО_УМОЛЧАНИЮ = [
    { порог: 0,   ставка: 0.03 },  // план < 81%
    { порог: 81,  ставка: 0.06 },
    { порог: 90,  ставка: 0.07 },
    { порог: 100, ставка: 0.08 },
    { порог: 110, ставка: 0.09 }   // перевыполнение
  ];

  var DEFAULT_NORMS = {
    оптометрист: {
      оклад: 30000,
      грейды: ГРЕЙДЫ_ПО_УМОЛЧАНИЮ.map(function (g) { return { порог: g.порог, ставка: g.ставка }; }),
      kpi: {
        label: 'Средний чек линз за пару',
        unit: 'money',      // 'money' | 'percent'
        план: 13000,        // зафиксировано 22.09; база топ-5 ≈ 9 000 за пару
        премия: 10000
      }
    },
    консультант: {
      оклад: 28000,
      грейды: ГРЕЙДЫ_ПО_УМОЛЧАНИЮ.map(function (g) { return { порог: g.порог, ставка: g.ставка }; }),
      kpi: {
        label: 'Средний чек заказа очков',
        unit: 'money',
        план: 17000,        // зафиксировано 22.09; база по сети 10 903, топ-5 ≈ 14 000
        премия: 10000
      }
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

  // ── общая логика грейдов (нужна и калькулятору, и настройкам) ──────────────
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

  global.MV_NORMS = {
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
