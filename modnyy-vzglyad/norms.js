/**
 * Модный взгляд — нормы (константы политики оплаты).
 *
 * Модель (встреча 08.09, пересмотрена 06.10): ЗП = ставка за смены + % от личной
 * выручки (грейд по выполнению плана филиала) + KPI-премия.
 *   • Ставка за смены (06.10) — заменяет фиксированный оклад. У каждой смены есть
 *     тип: «в паре» (работал с напарником — оптометрист отдельно, консультант
 *     отдельно) или «универсалом» (один закрывал обе роли). Ставка универсала
 *     выше — он один делает работу двоих. База = смен_в_паре × ставка_впаре +
 *     смен_универсалом × ставка_универсал. Кто в какой день работал один —
 *     видно по графику смен, это не нужно высчитывать отдельно.
 *   • % от выручки — по ГРЕЙДУ выполнения плана продаж филиала (лестница), без
 *     изменений с 08.09.
 *   • KPI — один на месяц, теперь ТРИ СТУПЕНИ вместо бинарного порога (06.10):
 *     чем выше показатель, тем больше премия, а не «всё или ничего» сразу за
 *     первым порогом. Метрика для обеих ролей объединена — средний чек ЗАКАЗА
 *     ОЧКОВ (линзы + оправа), а не отдельно «чек линз за пару» у оптометриста —
 *     чтобы расти в заказах с дорогими линзами, а не только в линзах отдельно.
 *
 * Ставки за смены и ступени KPI (06.10) — ПРИМЕРНЫЕ числа из разговора, ещё не
 * зафиксированы собственником (Андрей должен утвердить точные цифры). Грейды
 * % от выручки и их пороги — зафиксированы 08.09, в этой встрече не менялись.
 *
 * Правится на /modnyy-vzglyad/settings/ (localStorage одного браузера)
 * либо здесь в коде, чтобы стало боевым для всех.
 *
 * Грейды: массив ступеней {порог, ставка}, отсортирован по порогу.
 * Первый элемент — базовая ставка (порог 0, «ниже всех порогов»).
 * Ставка = ставка последней ступени, чей порог ≤ % выполнения плана.
 *
 * KPI ступени: массив {порог, премия}, отсортирован по порогу.
 * Премия = премия последней ступени, чей порог ≤ значению KPI (0, если ниже
 * первой ступени).
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

  // Черновые ступени KPI, озвученные на встрече 06.10 (пример Андрея) —
  // средний чек заказа очков: ≥14 000 → +5 000, ≥19 000 → +7 000, ≥21 000 → +10 000.
  var KPI_СТУПЕНИ_ПО_УМОЛЧАНИЮ = [
    { порог: 14000, премия: 5000 },
    { порог: 19000, премия: 7000 },
    { порог: 21000, премия: 10000 }
  ];

  var DEFAULT_NORMS = {
    оптометрист: {
      ставка: { впаре: 1500, универсал: 2000 },
      грейды: ГРЕЙДЫ_ПО_УМОЛЧАНИЮ.map(function (g) { return { порог: g.порог, ставка: g.ставка }; }),
      kpi: {
        label: 'Средний чек заказа очков',
        unit: 'money',      // 'money' | 'percent'
        ступени: KPI_СТУПЕНИ_ПО_УМОЛЧАНИЮ.map(function (s) { return { порог: s.порог, премия: s.премия }; })
      }
    },
    консультант: {
      ставка: { впаре: 1500, универсал: 2000 },
      грейды: ГРЕЙДЫ_ПО_УМОЛЧАНИЮ.map(function (g) { return { порог: g.порог, ставка: g.ставка }; }),
      kpi: {
        label: 'Средний чек заказа очков',
        unit: 'money',
        ступени: KPI_СТУПЕНИ_ПО_УМОЛЧАНИЮ.map(function (s) { return { порог: s.порог, премия: s.премия }; })
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

  // ── общая логика ступеней KPI (та же лесенка, что и у грейдов, но премия
  //    фиксированная сумма, а не ставка от выручки) ───────────────────────────
  function kpiPremium(ступени, value) {
    var p = 0;
    for (var i = 0; i < ступени.length; i++) {
      if (value >= ступени[i].порог) p = ступени[i].премия;
    }
    return p;
  }
  function nextKpiStep(ступени, value) {
    for (var i = 0; i < ступени.length; i++) {
      if (ступени[i].порог > value) return ступени[i];
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
    nextGrade: nextGrade,
    kpiPremium: kpiPremium,
    nextKpiStep: nextKpiStep
  };
})(window);
