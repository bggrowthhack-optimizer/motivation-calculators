/**
 * Общий движок калькуляторов мотивации.
 *
 * Что общее у всех клиентов (живёт здесь): переключатель ролей, слайдеры,
 * механика "зафиксировать сейчас → живая дельта", подсказки, вёрстка и тема.
 *
 * Что своё у каждого клиента (живёт в client.js каждой папки): набор полей
 * и функция compute(state) — сама формула расчёта зарплаты может быть какой
 * угодно, движок про неё ничего не знает и не навязывает форму расчёта.
 *
 * Конфиг, который принимает MotivationCalculator.init(config):
 * {
 *   title: string,            // <h1>
 *   eyebrow: string,          // строка над заголовком, обычно "Клиент · тема"
 *   lede: string,             // пояснение под заголовком (html разрешён)
 *   favicon: string,          // emoji для <link rel="icon">
 *   theme: { accent: '#hex', accentDark: '#hex' },  // необязательно
 *   footnotes: [string, ...], // html-строки внизу страницы с описанием формул
 *   roles: [
 *     {
 *       id: 'optometrist',
 *       label: 'Оптометрист',
 *       fields: [
 *         { id: 'days', label: '...', unit: 'count'|'money'|'percent',
 *           min, max, step, default,
 *           marginalLabel: '...',            // необязательно, нужен только если marginal возвращает число
 *           // необязательно — подсказка "за счёт чего вырасти" под слайдером:
 *           //  - вернуть number → рендерится как "{marginalLabel} ≈ +{число} ₽/мес"
 *           //    (годится для линейных формул: ставка × количество)
 *           //  - вернуть string (html) → рендерится как есть, marginalLabel игнорируется
 *           //    (нужен для ступенчатых/пороговых формул — сам опиши, сколько
 *           //    осталось до следующего порога и какой будет прибавка)
 *           marginal: (state) => number | string
 *         },
 *         ...
 *       ],
 *       // state — объект {fieldId: значение}; вернуть строки для итоговой карточки
 *       // и total, по которому считается дельта относительно базы
 *       compute: (state) => ({ rows: [{label, value}], total }),
 *       // необязательно: подсказка под итогом, получает результат compute()
 *       tip: (computed, state) => htmlString
 *     },
 *     ...
 *   ]
 * }
 * Если ролей всего одна — переключатель ролей скрывается автоматически.
 */
(function (global) {
  function fmtMoney(n) {
    return Math.round(n).toLocaleString('ru-RU') + ' ₽';
  }

  function formatFieldValue(field, value) {
    if (field.unit === 'money') return fmtMoney(value);
    if (field.unit === 'percent') return value + '%';
    return String(value);
  }

  function applyTheme(theme) {
    if (!theme) return;
    var root = document.documentElement;
    if (theme.accent) root.style.setProperty('--primary', theme.accent);
    if (theme.accentDark) root.style.setProperty('--primary-dark', theme.accentDark);
  }

  function unitSuffix(field) {
    if (field.unit === 'money') return '₽';
    if (field.unit === 'percent') return '%';
    return '';
  }

  // Разделитель разрядов как у чисел в остальном интерфейсе (ru-RU,
  // "8 000" вместо "8000") — иначе редактируемое поле и итоговая карточка
  // показывают одно и то же число по-разному оформленным.
  function formatGrouped(n) {
    return Number(n).toLocaleString('ru-RU');
  }

  // Убирает пробелы-разделители (обычный и неразрывный) перед разбором —
  // без этого "8 000", введённое или подставленное самим полем, читалось бы как 8.
  function parseGroupedNumber(raw) {
    var cleaned = String(raw).replace(/[\s ]/g, '').replace(',', '.');
    var v = parseFloat(cleaned);
    return isNaN(v) ? null : v;
  }

  function setFavicon(emoji) {
    if (!emoji) return;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<text y="0.9em" font-size="90">' + emoji + '</text></svg>';
    var link = document.querySelector('link[rel="icon"]') || document.createElement('link');
    link.rel = 'icon';
    link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
    document.head.appendChild(link);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function init(config) {
    applyTheme(config.theme);
    setFavicon(config.favicon);
    if (config.title) document.title = config.title;

    var app = document.getElementById('app') || document.body;
    app.innerHTML = '';

    var hero = el('div', { class: 'hero' }, [
      config.eyebrow ? el('p', { class: 'eyebrow', text: config.eyebrow }) : null,
      el('h1', { text: config.title || 'Калькулятор зарплаты' }),
      config.lede ? el('p', { class: 'lede', html: config.lede }) : null
    ]);

    var roleSwitch = el('div', { class: 'role-switch', role: 'tablist' });
    var panelGrid = el('main', { class: 'panel-grid' });
    var resultCard = el('aside', { class: 'result-card' });
    var resBody = el('div', { class: 'result-body' });
    var deltaPill = el('div', { class: 'delta-pill neutral', hidden: 'hidden' });
    var tipBox = el('p', { class: 'tip' });
    var btnSet = el('button', { class: 'primary', type: 'button', text: 'Зафиксировать как «сейчас»' });
    var btnReset = el('button', { type: 'button', text: 'Сбросить', disabled: 'disabled' });
    var baselineNote = el('p', { class: 'baseline-note' });

    resultCard.appendChild(resBody);
    resultCard.appendChild(deltaPill);
    resultCard.appendChild(tipBox);
    resultCard.appendChild(el('div', { class: 'baseline-controls' }, [btnSet, btnReset]));
    resultCard.appendChild(baselineNote);

    var panels = {};
    var sliders = {}; // roleId -> fieldId -> {input, valueEl, margEl, field}
    var state = {};
    var baselines = {};

    config.roles.forEach(function (role, idx) {
      state[role.id] = {};
      role.fields.forEach(function (f) { state[role.id][f.id] = f.default; });
      baselines[role.id] = null;

      var btn = el('button', {
        class: 'role-btn' + (idx === 0 ? ' active' : ''),
        role: 'tab',
        'aria-selected': idx === 0 ? 'true' : 'false',
        'data-role': role.id,
        type: 'button',
        text: role.label
      });
      btn.addEventListener('click', function () { switchRole(role.id); });
      roleSwitch.appendChild(btn);

      var panel = el('section', { class: 'inputs', id: 'panel-' + role.id });
      if (idx !== 0) panel.hidden = true;
      sliders[role.id] = {};

      role.fields.forEach(function (field) {
        var fieldId = 'f-' + role.id + '-' + field.id;
        var suffix = unitSuffix(field);
        // Ползунок — для быстрого исследования "что если"; число рядом — для
        // точного ввода реальных данных (например, из отчёта AMO/iTigris).
        // Оба управляют одним и тем же state и обновляют друг друга.
        // Число — как текст, не type=number: так можно показывать "8 000" с
        // разделителем разрядов, как в остальном интерфейсе (карточка итога),
        // а не голое "8000". Разбор значения — вручную, через parseFloat.
        var numberInput = el('input', {
          type: 'text',
          inputmode: 'decimal',
          class: 'value-input mono' + (suffix ? ' has-unit' : ''),
          id: fieldId,
          value: field.default
        });
        var valueWrap = el('div', { class: 'value-input-wrap' }, [
          numberInput,
          suffix ? el('span', { class: 'value-unit', text: suffix }) : null
        ]);
        var rangeInput = el('input', {
          type: 'range',
          'aria-label': field.label,
          min: field.min,
          max: field.max,
          step: field.step,
          value: field.default
        });
        // Подпись всегда на отдельной строке сверху (как Label над Input у
        // Оптимайзера) — так число со слайдером стоят на одном месте у всех
        // полей независимо от длины подписи. Раньше при переносе длинной
        // подписи на две строки поле съезжало вниз и "плавало" относительно
        // однострочных полей.
        var label = el('label', { for: fieldId, text: field.label, class: 'field-label' });
        var control = el('div', { class: 'field-control' }, [valueWrap, rangeInput]);
        var margEl = null;
        var fieldWrap = el('div', { class: 'field' }, [label, control]);
        if (field.marginal) {
          margEl = el('p', { class: 'marginal' });
          fieldWrap.appendChild(margEl);
        }
        panel.appendChild(fieldWrap);
        sliders[role.id][field.id] = { input: rangeInput, numberInput: numberInput, margEl: margEl, field: field };

        rangeInput.addEventListener('input', function () {
          state[role.id][field.id] = Number(rangeInput.value);
          render();
        });

        // При входе в поле показываем "сырое" число без разделителей —
        // редактировать "8 000" неудобно, пробел не разберёшь, где курсор.
        numberInput.addEventListener('focus', function () {
          numberInput.value = String(state[role.id][field.id]);
          numberInput.select();
        });
        // Во время печати не насильно переформатируем и не клэмпим — иначе
        // курсор скачет и цифры "поедают" друг друга на каждое нажатие клавиши.
        numberInput.addEventListener('input', function () {
          var v = parseGroupedNumber(numberInput.value);
          if (v !== null) {
            state[role.id][field.id] = v;
            render();
          }
        });
        // Клэмп в границы поля и возврат разделителей разрядов — только когда
        // сотрудник закончил ввод (ушёл с поля).
        numberInput.addEventListener('blur', function () {
          var v = parseGroupedNumber(numberInput.value);
          if (v === null) v = field.default;
          v = Math.min(field.max, Math.max(field.min, v));
          state[role.id][field.id] = v;
          render();
        });
      });

      panels[role.id] = panel;
      panelGrid.appendChild(panel);
    });

    panelGrid.appendChild(resultCard);

    var currentRole = config.roles[0].id;

    function switchRole(roleId) {
      currentRole = roleId;
      Array.prototype.forEach.call(roleSwitch.children, function (b) {
        var active = b.getAttribute('data-role') === roleId;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      Object.keys(panels).forEach(function (id) { panels[id].hidden = id !== roleId; });
      render();
    }

    function fillPct(input) {
      var pct = (input.value - input.min) / (input.max - input.min) * 100;
      input.style.setProperty('--fill', pct + '%');
    }

    function describeSnapshot(role, snapshot) {
      return role.fields.map(function (f) {
        return f.label + ': ' + formatFieldValue(f, snapshot[f.id]);
      }).join(' · ');
    }

    function render() {
      var role = config.roles.filter(function (r) { return r.id === currentRole; })[0];
      var s = state[role.id];

      role.fields.forEach(function (field) {
        var slot = sliders[role.id][field.id];
        slot.input.value = s[field.id];
        // Не трогаем значение поля, пока в нём печатают — иначе на каждое
        // нажатие клавиши курсор прыгает в конец и цифры вводятся не туда.
        if (document.activeElement !== slot.numberInput) {
          slot.numberInput.value = formatGrouped(s[field.id]);
        }
        fillPct(slot.input);
        if (slot.margEl && field.marginal) {
          var m = field.marginal(s);
          if (typeof m === 'number') {
            // Простой случай: линейная ценность шага (годится для формул вида "ставка × количество").
            slot.margEl.innerHTML = (field.marginalLabel || 'Изменение') + ' ≈ <span class="mono">+' + fmtMoney(m) + '/мес</span>';
          } else {
            // Формула сложнее линейной (ступени, пороги и т.п.) — клиент сам строит готовую HTML-подсказку.
            slot.margEl.innerHTML = m;
          }
        }
      });

      var computed = role.compute(s);
      resBody.innerHTML = '';
      computed.rows.forEach(function (row) {
        resBody.appendChild(el('div', { class: 'result-row' }, [
          el('span', { text: row.label }),
          el('span', { class: 'mono', html: fmtMoney(row.value) })
        ]));
      });
      resBody.appendChild(el('div', { class: 'result-total' }, [
        el('span', { class: 'label', text: 'Итого в месяц' }),
        el('span', { class: 'mono', html: fmtMoney(computed.total) })
      ]));

      if (role.tip) {
        tipBox.innerHTML = role.tip(computed, s);
        tipBox.hidden = false;
      } else {
        tipBox.hidden = true;
      }

      var baseline = baselines[role.id];
      if (!baseline) {
        deltaPill.hidden = true;
        btnReset.disabled = true;
        baselineNote.innerHTML = 'Точка отсчёта ещё не задана — выставь свои реальные цифры и нажми «Зафиксировать».';
      } else {
        btnReset.disabled = false;
        var diff = computed.total - baseline.total;
        var pct = baseline.total > 0 ? Math.round((diff / baseline.total) * 100) : 0;
        deltaPill.hidden = false;
        deltaPill.className = 'delta-pill ' + (diff > 0 ? 'positive' : diff < 0 ? 'negative' : 'neutral');
        if (diff === 0) {
          deltaPill.textContent = 'Без изменений от точки отсчёта';
        } else {
          var sign = diff > 0 ? '+' : '−';
          deltaPill.textContent = sign + fmtMoney(Math.abs(diff)) + ' (' + sign + Math.abs(pct) + '%)';
        }
        baselineNote.innerHTML = 'База: <span class="mono">' + describeSnapshot(role, baseline.snapshot) +
          '</span> → <span class="mono">' + fmtMoney(baseline.total) + '</span>';
      }
    }

    btnSet.addEventListener('click', function () {
      var role = config.roles.filter(function (r) { return r.id === currentRole; })[0];
      var snapshot = Object.assign({}, state[role.id]);
      var computed = role.compute(snapshot);
      baselines[role.id] = { snapshot: snapshot, total: computed.total };
      render();
    });

    btnReset.addEventListener('click', function () {
      var role = config.roles.filter(function (r) { return r.id === currentRole; })[0];
      var baseline = baselines[role.id];
      if (!baseline) return;
      state[role.id] = Object.assign({}, baseline.snapshot);
      role.fields.forEach(function (field) {
        sliders[role.id][field.id].input.value = state[role.id][field.id];
      });
      render();
    });

    if (config.roles.length < 2) roleSwitch.hidden = true;

    app.appendChild(el('div', { class: 'app' }, [
      hero,
      roleSwitch,
      panelGrid,
      config.footnotes ? el('footer', {
        class: 'formula',
        html: config.footnotes.map(function (t) { return '<p>' + t + '</p>'; }).join('')
      }) : null
    ]));

    render();
  }

  global.MotivationCalculator = { init: init, util: { fmtMoney: fmtMoney } };
})(window);
