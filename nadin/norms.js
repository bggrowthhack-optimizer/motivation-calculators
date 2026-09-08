/**
 * Надин — нормы (константы политики оплаты).
 *
 * DEFAULT_NORMS — то, что сейчас в таблице «Примеры Мотивации» (вкладки
 * «Нормы Врач» / «Нормы Консультант»). Это боевые значения: их видят все
 * сотрудники, открывшие /nadin/.
 *
 * Страница /nadin/настройки/ позволяет переопределить любую норму — правки
 * сохраняются в localStorage ТОГО браузера, где их сделали (общего хранилища
 * у статического сайта нет). То есть панель настроек — инструмент Руслана
 * «прикинуть, что будет, если поменять порог»; чтобы новое значение стало
 * боевым для всех — поменять его здесь, в DEFAULT_NORMS, и запушить.
 *
 * Логика процента (обе роли):
 *   итоговый% = MIN(макс, MAX(мин, базовый + Δконв + Δчек [+ Δмиосмарт]))
 *   Δ по показателю: значение ≥ band.верх → +0.01 ; ≥ band.низ → 0 ; иначе −0.01
 */
(function (global) {
  var STORAGE_KEY = 'nadin:norms';

  var DEFAULT_NORMS = {
    врач: {
      базовыйПроцент: 0.08,
      минПроцент: 0.06,
      максПроцент: 0.11,
      конверсия: { верх: 86, низ: 85 },          // проценты (0–100)
      чек: { верх: 26000, низ: 25000 },           // рубли
      миосмарт: { порог: 6, бонусПроцент: 0.005 },// строго больше порога → +0.5 п.п.
      ставкаЧаса: {
        'Молодой специалист': 100,
        'Опытный врач': 150,
        'Наставник': 200
      },
      чекЛист: 5000,
      передача: 10000,
      часНаставничества: 700,
      долиВыручки: {
        диагностика: 0.30,        // выручка ОКЛ приёмы + ОКТ + глазное дно
        товары: 0.15,             // выручка ОКЛ товары
        визуальнаяТерапия: 0.30
      }
    },
    консультант: {
      базовыйПроцент: 0.08,
      минПроцент: 0.06,
      максПроцент: 0.11,
      конверсия: { верх: 91, низ: 90 },
      чек: { верх: 41000, низ: 40000 },
      ставкаЧаса: 150,
      планОтзывам: 5000,
      старшийСмены: 10000
    }
  };

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }

  function merge(base, over) {
    var out = isObj(base) ? Object.assign({}, base) : base;
    Object.keys(over || {}).forEach(function (k) {
      out[k] = (isObj(base[k]) && isObj(over[k])) ? merge(base[k], over[k]) : over[k];
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

  function isCustom() {
    return !!readOverride();
  }

  global.NADIN_NORMS = {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_NORMS: DEFAULT_NORMS,
    load: load,
    save: save,
    reset: reset,
    isCustom: isCustom
  };
})(window);
