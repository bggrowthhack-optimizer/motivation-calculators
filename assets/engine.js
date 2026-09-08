/**
 * Общий движок калькуляторов мотивации.
 *
 * Что общее у всех клиентов (живёт здесь): переключатель ролей, группы полей
 * (в т.ч. сворачиваемые), поля ввода (слайдер+число, выбор из списка, галочка),
 * механика "зафиксировать сейчас → живая дельта", подсказки, вёрстка и тема.
 *
 * Что своё у каждого клиента (живёт в index.html каждой папки): набор полей
 * и функция compute(state) — сама формула расчёта зарплаты может быть какой
 * угодно, движок про неё ничего не знает и не навязывает форму расчёта.
 *
 * Конфиг, который принимает MotivationCalculator.init(config):
 * {
 *   title, eyebrow, lede, favicon,
 *   theme: { accent: '#hex', accentDark: '#hex' },  // необязательно
 *   footnotes: [string, ...],
 *   roles: [
 *     {
 *       id, label,
 *
 *       // ── поля роли: либо плоский список fields, либо groups ────────────
 *       fields: [ ...поля... ],           // простой вариант, одна безымянная группа
 *       // ИЛИ
 *       groups: [
 *         {
 *           title: 'Продажи линз — твои рычаги',   // необязательно
 *           note: 'Что растёт от твоей работы',    // необязательно, строка под заголовком
 *           collapsible: true,                     // необязательно — группу можно свернуть
 *           collapsed: true,                       // необязательно — стартует свёрнутой
 *           sum: 'money' | (state) => number,      // необязательно — показывать в шапке
 *                                                  //   группы её вклад: 'money' = сумма
 *                                                  //   money-полей группы; функция = что
 *                                                  //   угодно (напр. с учётом ставок/долей)
 *           fields: [ ...поля... ]
 *         },
 *         ...
 *       ],
 *
 *       compute: (state) => ({ rows: [{label, value}], total }),
 *       tip: (computed, state) => htmlString      // необязательно
 *     }
 *   ]
 * }
 *
 * Поле (элемент fields):
 *   (нет type) / type:'range' — число со слайдером.
 *     { id, label, unit: 'count'|'money'|'percent', min, max, step, default,
 *       slider: false,        // убрать ползунок, оставить только поле ввода
 *       marginalLabel, marginal }
 *   type:'select'   — { id, label, type:'select', default, options: ['A',{value,label}] }
 *   type:'checkbox' — { id, label, type:'checkbox', default: false }
 *   type:'heading'  — подзаголовок внутри группы, без значения. { label, type:'heading' }
 *
 *   marginal(state) → number  (рендерится "{marginalLabel} ≈ +{n} ₽/мес")
 *                   → string  (html как есть — для ступенчатых/пороговых формул)
 *   key: true — если хотя бы у одного поля роли стоит, в строке "База: …"
 *     под итогом показываются только key-поля (иначе все).
 *
 * Если ролей всего одна — переключатель ролей скрывается автоматически.
 */
(function (global) {
  function fmtMoney(n) {
    return Math.round(n).toLocaleString('ru-RU') + ' ₽';
  }

  function optValue(o) { return (o && typeof o === 'object') ? o.value : o; }
  function optLabel(o) { return (o && typeof o === 'object') ? (o.label != null ? o.label : o.value) : o; }

  function formatFieldValue(field, value) {
    if (field.type === 'checkbox') return value ? 'да' : 'нет';
    if (field.type === 'select') {
      var opt = (field.options || []).filter(function (o) { return optValue(o) === value; })[0];
      return opt ? optLabel(opt) : String(value);
    }
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

  function formatGrouped(n) {
    return Number(n).toLocaleString('ru-RU');
  }

  function parseGroupedNumber(raw) {
    var cleaned = String(raw).replace(/[\s ]/g, '').replace(',', '.');
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

  function groupsOf(role) {
    if (role.groups && role.groups.length) return role.groups;
    return [{ fields: role.fields || [] }];
  }

  function valueFields(role) {
    var out = [];
    groupsOf(role).forEach(function (g) {
      (g.fields || []).forEach(function (f) { if (f.type !== 'heading') out.push(f); });
    });
    return out;
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
    var topTotal = el('span', { class: 'mono' });
    var topbar = el('div', { class: 'topbar' }, [
      roleSwitch,
      el('div', { class: 'topbar-total' }, [
        el('span', { class: 'lbl', text: 'Итого в месяц' }),
        topTotal
      ])
    ]);
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
    var slots = {};       // roleId -> fieldId -> slot
    var groupSums = {};    // roleId -> [{ group, el }]
    var state = {};
    var baselines = {};

    function renderField(roleId, field, container) {
      if (field.type === 'heading') {
        container.appendChild(el('p', { class: 'field-group', text: field.label }));
        return;
      }

      var fieldId = 'f-' + roleId + '-' + field.id;
      var slot = { field: field };
      var margEl = field.marginal ? el('p', { class: 'marginal' }) : null;
      var fieldWrap = el('div', { class: 'field' });

      if (field.type === 'checkbox') {
        var cb = el('input', { type: 'checkbox', id: fieldId, class: 'field-checkbox' });
        cb.checked = !!field.default;
        fieldWrap.appendChild(el('label', { class: 'checkbox-row', for: fieldId }, [
          cb, el('span', { text: field.label })
        ]));
        cb.addEventListener('change', function () {
          state[roleId][field.id] = cb.checked;
          render();
        });
        slot.checkbox = cb;

      } else if (field.type === 'select') {
        fieldWrap.appendChild(el('label', { for: fieldId, text: field.label, class: 'field-label' }));
        var sel = el('select', { id: fieldId, class: 'field-select' });
        (field.options || []).forEach(function (o) {
          sel.appendChild(el('option', { value: optValue(o), text: optLabel(o) }));
        });
        sel.value = field.default;
        fieldWrap.appendChild(sel);
        sel.addEventListener('change', function () {
          state[roleId][field.id] = sel.value;
          render();
        });
        slot.select = sel;

      } else {
        fieldWrap.appendChild(el('label', { for: fieldId, text: field.label, class: 'field-label' }));
        var suffix = unitSuffix(field);
        var hasSlider = field.slider !== false;

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
        var controlChildren = [valueWrap];
        var rangeInput = null;
        if (hasSlider) {
          rangeInput = el('input', {
            type: 'range',
            'aria-label': field.label,
            min: field.min,
            max: field.max,
            step: field.step,
            value: field.default
          });
          controlChildren.push(rangeInput);
          rangeInput.addEventListener('input', function () {
            state[roleId][field.id] = Number(rangeInput.value);
            render();
          });
        }
        fieldWrap.appendChild(el('div', { class: 'field-control' + (hasSlider ? '' : ' no-slider') }, controlChildren));

        numberInput.addEventListener('focus', function () {
          numberInput.value = String(state[roleId][field.id]);
          numberInput.select();
        });
        numberInput.addEventListener('input', function () {
          var v = parseGroupedNumber(numberInput.value);
          if (v !== null) {
            state[roleId][field.id] = v;
            render();
          }
        });
        numberInput.addEventListener('blur', function () {
          var v = parseGroupedNumber(numberInput.value);
          if (v === null) v = field.default;
          if (typeof field.max === 'number') v = Math.min(field.max, v);
          if (typeof field.min === 'number') v = Math.max(field.min, v);
          state[roleId][field.id] = v;
          render();
        });

        slot.input = rangeInput;
        slot.numberInput = numberInput;
      }

      if (margEl) {
        slot.margEl = margEl;
        fieldWrap.appendChild(margEl);
      }
      container.appendChild(fieldWrap);
      slots[roleId][field.id] = slot;
    }

    config.roles.forEach(function (role, idx) {
      state[role.id] = {};
      valueFields(role).forEach(function (f) { state[role.id][f.id] = f.default; });
      baselines[role.id] = null;
      slots[role.id] = {};
      groupSums[role.id] = [];

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

      var groups = groupsOf(role);
      var grouped = groups.length > 1 || groups[0].title || groups[0].collapsible;
      if (grouped) panelGrid.classList.add('has-groups');
      var panel = el('section', { class: 'inputs' + (grouped ? ' grouped' : ''), id: 'panel-' + role.id });
      if (idx !== 0) panel.hidden = true;

      groups.forEach(function (group) {
        var container = panel;

        if (grouped) {
          var card = el('div', { class: 'group-card' + (group.collapsed ? ' collapsed' : '') });
          var sumEl = group.collapsible && group.sum
            ? el('span', { class: 'group-sum' })
            : null;
          var titleBlock = el('div', { class: 'group-title-block' }, [
            group.title ? el('p', { class: 'group-title', text: group.title }) : null,
            group.note ? el('p', { class: 'group-note', text: group.note }) : null
          ]);
          var headChildren = [titleBlock];
          if (sumEl || group.collapsible) {
            headChildren.push(el('div', { class: 'group-head-right' }, [
              sumEl,
              group.collapsible ? el('span', { class: 'group-toggle', 'aria-hidden': 'true' }) : null
            ]));
          }
          var head = el('div', { class: 'group-head' }, headChildren);
          var body = el('div', { class: 'group-body' });
          if (group.collapsed) body.hidden = true;

          if (group.collapsible) {
            head.setAttribute('role', 'button');
            head.setAttribute('tabindex', '0');
            head.setAttribute('aria-expanded', group.collapsed ? 'false' : 'true');
            var toggle = function () {
              var nowCollapsed = card.classList.toggle('collapsed');
              body.hidden = nowCollapsed;
              head.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
            };
            head.addEventListener('click', toggle);
            head.addEventListener('keydown', function (e) {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
            });
          }

          card.appendChild(head);
          card.appendChild(body);
          panel.appendChild(card);
          container = body;

          if (sumEl) {
            var moneyIds = (group.fields || [])
              .filter(function (f) { return f.unit === 'money'; })
              .map(function (f) { return f.id; });
            groupSums[role.id].push({
              compute: typeof group.sum === 'function'
                ? group.sum
                : function (st) { return moneyIds.reduce(function (a, id) { return a + (Number(st[id]) || 0); }, 0); },
              el: sumEl
            });
          }
        }

        (group.fields || []).forEach(function (field) {
          renderField(role.id, field, container);
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

    function snapshotFields(role) {
      var all = valueFields(role);
      var keyed = all.filter(function (f) { return f.key; });
      return keyed.length ? keyed : all;
    }

    function describeSnapshot(role, snapshot) {
      return snapshotFields(role).map(function (f) {
        return f.label + ': ' + formatFieldValue(f, snapshot[f.id]);
      }).join(' · ');
    }

    function render() {
      var role = config.roles.filter(function (r) { return r.id === currentRole; })[0];
      var s = state[role.id];

      valueFields(role).forEach(function (field) {
        var slot = slots[role.id][field.id];
        if (!slot) return;

        if (slot.checkbox) {
          slot.checkbox.checked = !!s[field.id];
        } else if (slot.select) {
          slot.select.value = s[field.id];
        } else {
          if (slot.input) {
            slot.input.value = s[field.id];
            fillPct(slot.input);
          }
          if (slot.numberInput && document.activeElement !== slot.numberInput) {
            slot.numberInput.value = formatGrouped(s[field.id]);
          }
        }

        if (slot.margEl && field.marginal) {
          var m = field.marginal(s);
          if (typeof m === 'number') {
            slot.margEl.innerHTML = (field.marginalLabel || 'Изменение') + ' ≈ <span class="mono">+' + fmtMoney(m) + '/мес</span>';
          } else {
            slot.margEl.innerHTML = m;
          }
        }
      });

      (groupSums[role.id] || []).forEach(function (gs) {
        var sum = gs.compute(s);
        // Пусто, а не "—", когда группа ничего не добавляет — чтобы в шапке
        // свёрнутой группы не стояли рядом два значка ("—" и "+").
        gs.el.textContent = sum ? fmtMoney(sum) : '';
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
      topTotal.textContent = fmtMoney(computed.total);

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
      render();
    });

    if (config.roles.length < 2) {
      roleSwitch.hidden = true;
      topbar.classList.add('single-role');
    }

    app.appendChild(el('div', { class: 'app' }, [
      hero,
      topbar,
      panelGrid,
      config.footnotes ? el('footer', {
        class: 'formula',
        html: config.footnotes.map(function (t) { return '<p>' + t + '</p>'; }).join('')
      }) : null
    ]));

    // Тень под прилипшей шапкой — только когда она реально «приклеилась» к верху.
    var onScroll = function () {
      topbar.classList.toggle('stuck', topbar.getBoundingClientRect().top <= 0.5);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    render();
  }

  global.MotivationCalculator = { init: init, util: { fmtMoney: fmtMoney } };
})(window);
