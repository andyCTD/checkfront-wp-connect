(function() {
  // Small helper to build DOM elements
  function createEl(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function(key) {
        if (key === 'class') {
          el.className = attrs[key];
        } else if (key === 'html') {
          el.innerHTML = attrs[key];
        } else {
          el.setAttribute(key, attrs[key]);
        }
      });
    }
    if (children) {
      children.forEach(function(child) {
        if (typeof child === 'string') {
          el.appendChild(document.createTextNode(child));
        } else if (child) {
          el.appendChild(child);
        }
      });
    }
    return el;
  }

  function renderApp(root, itemId) {
    var state = {
      itemId: itemId,
      qty: 1,
      minQty: 1,
      maxQty: 60,
      slip: null,
      rated: null,
      itemName: null,
      timeslots: [],
      baseSlip: null,
      selectedTimeslotIndex: 0,
      loading: false
    };

    var today = new Date();
    // We render month views starting from the 1st of the month
    var currentCalDate = new Date(today.getFullYear(), today.getMonth(), 1);

    var dateInput, endDateInput, qtyValueEl, availabilityBox, bookingForm, debugBox;
    var timeslotGroup, timeslotSelect;
    var checkBtn, bookBtn;
    var calendarContainer, calMonthLabel, calBody;

    var wrapper = createEl('div', { class: 'howstean-checkfront-wrapper' });





    // Heading
    wrapper.appendChild(createEl('h4', null, ['Select Date & Participants']));

    /* =====================
     * CALENDAR UI
     * ===================== */
    calendarContainer = createEl('div', { class: 'hcf-calendar-container' });

    // Calendar header with month & navigation
    var calHeader = createEl('div', { class: 'hcf-cal-header' });
    var calPrev = createEl('button', {
      type: 'button',
      class: 'hcf-cal-nav hcf-cal-prev'
    }, ['‹']);
    var calNext = createEl('button', {
      type: 'button',
      class: 'hcf-cal-nav hcf-cal-next'
    }, ['›']);
    calMonthLabel = createEl('div', { class: 'hcf-cal-month-label' });

    calHeader.appendChild(calPrev);
    calHeader.appendChild(calMonthLabel);
    calHeader.appendChild(calNext);
    calendarContainer.appendChild(calHeader);

    // Day-of-week header row (Mon–Sun to match Checkfront)
    var daysHeader = createEl('div', { class: 'hcf-cal-row hcf-cal-row-head' });
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(function(d) {
      daysHeader.appendChild(
        createEl('div', { class: 'hcf-cal-cell hcf-cal-head-cell' }, [d])
      );
    });
    calendarContainer.appendChild(daysHeader);

    // Grid body (weeks)
    calBody = createEl('div', { class: 'hcf-cal-body' });
    calendarContainer.appendChild(calBody);

    // Legend (Available / Sold out / Closed)
    var legend = createEl('div', { class: 'hcf-cal-legend' });
    legend.appendChild(createEl('span', { class: 'hcf-leg-swatch hcf-leg-available' }));
    legend.appendChild(document.createTextNode(' Available '));
    legend.appendChild(createEl('span', { class: 'hcf-leg-swatch hcf-leg-soldout' }));
    legend.appendChild(document.createTextNode(' Sorry sold out '));
    legend.appendChild(createEl('span', { class: 'hcf-leg-swatch hcf-leg-closed' }));
    legend.appendChild(document.createTextNode(' Closed / not bookable'));
    calendarContainer.appendChild(legend);

    wrapper.appendChild(calendarContainer);

    // ===== Date input (acts as the underlying value) =====
    var dateGroup = createEl('div', {
      class: 'hcf-field-group hcf-field-inline hcf-date-group'
    });
    dateGroup.appendChild(createEl('label', null, ['Check-in']));
    dateInput = createEl('input', { type: 'date', id: 'hcf-date' });

    var endGroup = createEl('div', {
      class: 'hcf-field-group hcf-field-inline hcf-date-group'
    });
    endGroup.appendChild(createEl('label', null, ['Check-out']));
    endDateInput = createEl('input', { type: 'date', id: 'hcf-end-date' });

    var yyyy = today.getFullYear();
    var mm = ('0' + (today.getMonth() + 1)).slice(-2);
    var dd = ('0' + today.getDate()).slice(-2);
    var startVal = yyyy + '-' + mm + '-' + dd;
    var tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    var tmm = ('0' + (tomorrow.getMonth() + 1)).slice(-2);
    var tdd = ('0' + tomorrow.getDate()).slice(-2);
    var endVal = tomorrow.getFullYear() + '-' + tmm + '-' + tdd;

    dateInput.value = startVal;
    dateInput.min = startVal;
    endDateInput.value = endVal;
    endDateInput.min = endVal;

    // Helper: load rated availability for current date & quantity
    function loadAvailability() {
      if (!dateInput.value) {
        alert('Please choose a check-in date.');
        return;
      }
      if (!endDateInput.value) {
        alert('Please choose a check-out date.');
        return;
      }

      var dateYmd = dateInput.value.replace(/-/g, '');
      var endYmd = endDateInput.value ? endDateInput.value.replace(/-/g, '') : dateYmd;
      var qty = state.qty;

      setLoading(true);

      var url = HowsteanCheckfront.restBase +
        'item-rated?item_id=' + encodeURIComponent(state.itemId) +
        '&date=' + encodeURIComponent(dateYmd) +
        '&end_date=' + encodeURIComponent(endYmd) +
        '&qty=' + encodeURIComponent(qty);

      fetch(url, {
        method: 'GET',
        headers: { 'X-WP-Nonce': HowsteanCheckfront.nonce },
        credentials: 'same-origin'
      })
        .then(function(res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function(data) {
          showRated(data);
        })
        .catch(function(err) {
          console.error('Error fetching rated item', err);
          availabilityBox.textContent = 'Error contacting Checkfront. Please try again.';
        })
        .finally(function() {
          setLoading(false);
        });
    }

    // AUTO-REFRESH availability + timeslots when date changes
    dateInput.addEventListener('change', function () {
      if (!dateInput.value) return;
      var start = new Date(dateInput.value);
      if (!isNaN(start.getTime())) {
        var nextDay = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        var mm2 = ('0' + (nextDay.getMonth() + 1)).slice(-2);
        var dd2 = ('0' + nextDay.getDate()).slice(-2);
        var minEnd = nextDay.getFullYear() + '-' + mm2 + '-' + dd2;
        if (!endDateInput.value || endDateInput.value < minEnd) {
          endDateInput.value = minEnd;
        }
        endDateInput.min = minEnd;
      }
      loadAvailability();
    });

    endDateInput.addEventListener('change', function () {
      if (!endDateInput.value || !dateInput.value) return;
      if (endDateInput.value <= dateInput.value) {
        var start = new Date(dateInput.value);
        var nextDay = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        var mm2 = ('0' + (nextDay.getMonth() + 1)).slice(-2);
        var dd2 = ('0' + nextDay.getDate()).slice(-2);
        endDateInput.value = nextDay.getFullYear() + '-' + mm2 + '-' + dd2;
      }
      loadAvailability();
    });


      dateGroup.appendChild(dateInput);
    endGroup.appendChild(endDateInput);

    wrapper.appendChild(dateGroup);
    wrapper.appendChild(endGroup);

    // ===== Quantity selector =====
    var qtyGroup = createEl('div', { class: 'hcf-field-group hcf-field-inline' });
    qtyGroup.appendChild(createEl('label', null, ['Participants']));
    var qtyControls = createEl('div', { class: 'hcf-qty-controls' });
    var minusBtn = createEl('button', { type: 'button', class: 'hcf-qty-minus' }, ['-']);
    var plusBtn  = createEl('button', { type: 'button', class: 'hcf-qty-plus' }, ['+']);
    qtyValueEl = createEl('span', { class: 'hcf-qty-value' }, [String(state.qty)]);
    qtyControls.appendChild(minusBtn);
    qtyControls.appendChild(qtyValueEl);
    qtyControls.appendChild(plusBtn);
    qtyGroup.appendChild(qtyControls);
    wrapper.appendChild(qtyGroup);

    // ===== Time slot (populated after availability lookup) =====
    timeslotGroup = createEl('div', { class: 'hcf-field-group hcf-field-inline', style: 'display:none;' });
    timeslotGroup.appendChild(createEl('label', null, ['Time']));
    timeslotSelect = createEl('select', { id: 'hcf-timeslot' });
    timeslotGroup.appendChild(timeslotSelect);
    wrapper.appendChild(timeslotGroup);

    // ===== Check availability button =====
    checkBtn = createEl('button', { type: 'button', class: 'hcf-check-btn' }, ['Check Availability & Price']);
    wrapper.appendChild(checkBtn);

    // Availability box
    availabilityBox = createEl('div', { class: 'hcf-availability' });
    wrapper.appendChild(availabilityBox);

    // ===== Booking form (populated dynamically from Checkfront) =====
    bookingForm = createEl('div', { class: 'hcf-booking-form' });
    bookingForm.style.display = 'none';
    bookingForm.appendChild(createEl('h3', null, ['Your Details']));

    var dynamicFieldsContainer = createEl('div', { class: 'hcf-dynamic-fields' });
    bookingForm.appendChild(dynamicFieldsContainer);

    // Book button (enabled after we have a slip + form fields)
    bookBtn = createEl('button', { type: 'button', class: 'hcf-book-btn', disabled: 'disabled' }, ['Complete Booking & Pay']);
    bookingForm.appendChild(bookBtn);
    wrapper.appendChild(bookingForm);

    // Debug box
    debugBox = createEl('pre', {
      class: 'hcf-debug',
      style: 'display:none; white-space:pre-wrap; background:#f7f7f7; padding:10px; margin-top:15px;'
    });
    wrapper.appendChild(debugBox);

    root.appendChild(wrapper);

    /* =====================
     * Helpers
     * ===================== */

    function updateQtyDisplay() {
      qtyValueEl.textContent = state.qty + ' (Min ' + state.minQty + ', Max ' + state.maxQty + ')';
    }
    updateQtyDisplay();

    minusBtn.addEventListener('click', function() {
      if (state.qty > state.minQty) {
        state.qty--;
        updateQtyDisplay();
        if (dateInput && dateInput.value) {
          loadAvailability();
        }
      }
    });

    plusBtn.addEventListener('click', function() {
      if (state.qty < state.maxQty) {
        state.qty++;
        updateQtyDisplay();
        if (dateInput && dateInput.value) {
          loadAvailability();
        }
      }
    });

    function setLoading(isLoading) {
      state.loading = isLoading;
      checkBtn.disabled = isLoading;
      bookBtn.disabled = isLoading || !state.slip;
      checkBtn.textContent = isLoading ? 'Checking…' : 'Check Availability & Price';
    }

    function normalizeOptions(field) {
      var raw = field.options || field.choices || field.values || [];
      var opts = [];

      if (Array.isArray(raw)) {
        raw.forEach(function(opt) {
          if (opt && typeof opt === 'object') {
            opts.push({ value: opt.value || opt.id || opt.name, label: opt.label || opt.name || opt.value });
          } else {
            opts.push({ value: opt, label: opt });
          }
        });
      } else if (typeof raw === 'object' && raw !== null) {
        Object.keys(raw).forEach(function(key) {
          var val = raw[key];
          if (val && typeof val === 'object') {
            opts.push({ value: val.value || key, label: val.label || val.name || val.value || key });
          } else {
            opts.push({ value: key, label: val });
          }
        });
      }

      return opts;
    }

    function buildFieldControl(name, field) {
      var type = (field.type || field.input || 'text').toLowerCase();
      var display = (field.display || field.widget || '').toLowerCase();
      var htmlType = type;
      if (type === 'spin' || type === 'number') htmlType = 'number';
      if (type === 'phone') htmlType = 'tel';
      if (type === 'checkbox') htmlType = 'checkbox';
      var id = 'hcf-field-' + name;
      var control;

      var options = normalizeOptions(field);
      var wantsRadio = type === 'radio' || display === 'radio';
      var isMultiCheckbox = (type === 'checkbox' && options.length > 1) || display === 'checkboxes';

      if ((type === 'select' || type === 'option' || display === 'select') && options.length) {
        control = createEl('select', { id: id, 'data-field-name': name });
        if (!field.required) {
          control.appendChild(createEl('option', { value: '' }, ['Please Select']));
        }
        options.forEach(function(opt) {
          control.appendChild(createEl('option', { value: opt.value }, [opt.label]));
        });
      } else if (wantsRadio && options.length) {
        control = createEl('div', { class: 'hcf-radio-group', id: id });
        options.forEach(function(opt, idx) {
          var inputId = id + '-opt-' + idx;
          var input = createEl('input', {
            type: 'radio',
            id: inputId,
            name: id,
            'data-field-name': name,
            value: opt.value
          });
          control.appendChild(createEl('label', { for: inputId }, [input, ' ', opt.label]));
        });
      } else if (isMultiCheckbox && options.length) {
        control = createEl('div', { class: 'hcf-checkbox-group', id: id });
        options.forEach(function(opt, idx) {
          var inputId = id + '-chk-' + idx;
          var input = createEl('input', {
            type: 'checkbox',
            id: inputId,
            name: id,
            'data-field-name': name,
            value: opt.value
          });
          control.appendChild(createEl('label', { for: inputId }, [input, ' ', opt.label]));
        });
      } else if (type === 'checkbox') {
        control = createEl('input', { type: htmlType, id: id, 'data-field-name': name, value: '1' });
      } else if (type === 'textarea') {
        control = createEl('textarea', { id: id, 'data-field-name': name });
      } else {
        control = createEl('input', { type: htmlType, id: id, 'data-field-name': name });
      }

      if (field.placeholder && control.tagName) {
        control.setAttribute('placeholder', field.placeholder);
      }

      var range = field.range || field.valid_range || field.validation;
      if (range && control.tagName && control.tagName.toLowerCase() !== 'div') {
        if (range.start) control.setAttribute('min', range.start);
        if (range.end) control.setAttribute('max', range.end);
        if (range.step) control.setAttribute('step', range.step);
      }

      var defaultVal = field.default;
      if (typeof defaultVal === 'undefined') defaultVal = field.value;
      var defaultArray = Array.isArray(defaultVal) ? defaultVal : [defaultVal];

      if (control && control.tagName === 'SELECT' && typeof defaultVal !== 'undefined') {
        Array.prototype.forEach.call(control.options, function(opt) {
          if (defaultArray.indexOf(opt.value) !== -1) {
            opt.selected = true;
          }
        });
      } else if (control && control.classList.contains('hcf-radio-group')) {
        var radios = control.querySelectorAll('input[type="radio"]');
        Array.prototype.forEach.call(radios, function(input) {
          if (defaultArray.indexOf(input.value) !== -1) {
            input.checked = true;
          }
        });
      } else if (control && control.classList.contains('hcf-checkbox-group')) {
        var checkboxes = control.querySelectorAll('input[type="checkbox"]');
        Array.prototype.forEach.call(checkboxes, function(input) {
          if (defaultArray.indexOf(input.value) !== -1) {
            input.checked = true;
          }
        });
      } else if (control && control.tagName === 'TEXTAREA') {
        if (typeof defaultVal !== 'undefined') control.value = defaultVal;
      } else if (control && control.tagName === 'INPUT') {
        if (htmlType === 'checkbox') {
          if (defaultVal === true || defaultVal === '1' || defaultVal === 1) {
            control.checked = true;
          }
        } else if (typeof defaultVal !== 'undefined') {
          control.value = defaultVal;
        }
      }

      if (field.required) {
        if (control.tagName && control.tagName.toLowerCase() === 'div') {
          control.setAttribute('data-field-required', '1');
          var groupedInputs = control.querySelectorAll('input');
          Array.prototype.forEach.call(groupedInputs, function(input) {
            input.setAttribute('data-field-required', '1');
            input.required = true;
          });
        } else {
          control.setAttribute('required', 'required');
        }
      }

      return control;
    }

    function renderDynamicFields(params) {
      if (!dynamicFieldsContainer) return;
      dynamicFieldsContainer.innerHTML = '';

      if (!params || typeof params !== 'object') {
        return;
      }

      var names = Object.keys(params);
      names.sort(function(a, b) {
        var fa = params[a] || {};
        var fb = params[b] || {};
        var oa = parseInt(fa.order || fa.weight || fa.position || fa.sort || 0, 10);
        var ob = parseInt(fb.order || fb.weight || fb.position || fb.sort || 0, 10);
        return oa - ob;
      });

      names.forEach(function (name) {
        var field = params[name] || {};
        var group = createEl('div', { class: 'hcf-field-group' });

        var labelText = field.label || name;
        if (field.required) {
          labelText += ' *';
        }
        group.appendChild(createEl('label', { for: 'hcf-field-' + name }, [labelText]));

        var control = buildFieldControl(name, field);
        group.appendChild(control);

        if (field.instructions) {
          group.appendChild(createEl('p', { class: 'hcf-help' }, [field.instructions]));
        }

        dynamicFieldsContainer.appendChild(group);
      });
    }

    // Convert Date -> "YYYYMMDD"
    function ymdFromDate(d) {
      var y = d.getFullYear();
      var m = ('0' + (d.getMonth() + 1)).slice(-2);
      var day = ('0' + d.getDate()).slice(-2);
      return '' + y + m + day;
    }

    // Load availability for a single day and colour the calendar cell
    function loadDayStatus(ymd, cell) {
      var endYmd = ymd;
      if (endDateInput && endDateInput.value) {
        endYmd = endDateInput.value.replace(/-/g, '');
        if (parseInt(endYmd, 10) <= parseInt(ymd, 10)) {
          // enforce a minimum one-night stay when previewing cells
          var y = parseInt(ymd.slice(0, 4), 10);
          var m = parseInt(ymd.slice(4, 6), 10) - 1;
          var d = parseInt(ymd.slice(6, 8), 10);
          var nextDay = new Date(y, m, d + 1);
          endYmd = ymdFromDate(nextDay);
        }
      }

      var url = HowsteanCheckfront.restBase +
        'item-rated?item_id=' + encodeURIComponent(state.itemId) +
        '&date=' + encodeURIComponent(ymd) +
        '&end_date=' + encodeURIComponent(endYmd) +
        '&qty=1';

      fetch(url, {
        method: 'GET',
        headers: { 'X-WP-Nonce': HowsteanCheckfront.nonce },
        credentials: 'same-origin'
      })
        .then(function(res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function(data) {
          if (!data || !data.item || !data.item.rate) {
            cell.classList.add('hcf-cal-closed');
            return;
          }
          var rate = data.item.rate;
          var status = (rate.status || '').toUpperCase();
          var available = (typeof rate.available !== 'undefined')
            ? parseInt(rate.available, 10)
            : null;

          cell.classList.remove('hcf-cal-closed', 'hcf-cal-available', 'hcf-cal-soldout');

          if (status === 'AVAILABLE' && (available === null || available > 0)) {
            cell.classList.add('hcf-cal-available');
          } else {
            cell.classList.add('hcf-cal-soldout');
          }
        })
        .catch(function() {
          cell.classList.add('hcf-cal-closed');
        });
    }

    // Build / render the month grid
    function renderCalendar() {
      calBody.innerHTML = '';

      var year = currentCalDate.getFullYear();
      var month = currentCalDate.getMonth(); // 0–11
      var months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      calMonthLabel.textContent = months[month] + ' ' + year;

      var firstOfMonth = new Date(year, month, 1);
      var firstDow = firstOfMonth.getDay(); // 0=Sun..6=Sat
      var offset = (firstDow + 6) % 7;      // convert so Monday=0
      var daysInMonth = new Date(year, month + 1, 0).getDate();

      var row = createEl('div', { class: 'hcf-cal-row' });
      calBody.appendChild(row);

      var cellIndex = 0;
      var i, day;

      // Leading blanks
      for (i = 0; i < offset; i++) {
        row.appendChild(createEl('div', { class: 'hcf-cal-cell hcf-cal-empty' }, ['']));
        cellIndex++;
      }

      var todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      var currentYmd = dateInput.value ? dateInput.value.replace(/-/g, '') : null;

      for (day = 1; day <= daysInMonth; day++) {
        if (cellIndex > 0 && cellIndex % 7 === 0) {
          row = createEl('div', { class: 'hcf-cal-row' });
          calBody.appendChild(row);
        }

        var d = new Date(year, month, day);
        var ymd = ymdFromDate(d);

        var cell = createEl('div', {
          class: 'hcf-cal-cell hcf-cal-day',
          'data-ymd': ymd
        }, [String(day)]);
        row.appendChild(cell);
        cellIndex++;

        // Past dates: closed
        if (d < todayMidnight) {
          cell.classList.add('hcf-cal-closed');
        } else {
          loadDayStatus(ymd, cell);
        }

        // Pre-select the currently chosen date (if it’s in this month)
        if (currentYmd && currentYmd === ymd) {
          cell.classList.add('hcf-cal-day-selected');
        }

        // Clicking a cell selects that date (if it’s not closed/sold out)
        cell.addEventListener('click', function() {
          if (this.classList.contains('hcf-cal-closed') ||
              this.classList.contains('hcf-cal-soldout')) {
            return;
          }

          Array.prototype.forEach.call(
            calBody.querySelectorAll('.hcf-cal-day-selected'),
            function(c) { c.classList.remove('hcf-cal-day-selected'); }
          );
          this.classList.add('hcf-cal-day-selected');

          var ymdSel = this.getAttribute('data-ymd');
          var y = ymdSel.substring(0, 4);
          var m = ymdSel.substring(4, 6);
          var d2 = ymdSel.substring(6, 8);
          dateInput.value = y + '-' + m + '-' + d2;

          // Fire change so availability + calendar sync run
          var evt = new Event('change', { bubbles: true });
          dateInput.dispatchEvent(evt);
        });
      }
    }

    // Calendar navigation
    calPrev.addEventListener('click', function() {
      currentCalDate.setMonth(currentCalDate.getMonth() - 1);
      renderCalendar();
    });
    calNext.addEventListener('click', function() {
      currentCalDate.setMonth(currentCalDate.getMonth() + 1);
      renderCalendar();
    });

    // If user manually changes the date input, re-sync calendar highlight/month
    dateInput.addEventListener('change', function() {
      var d = new Date(this.value);
      if (!isNaN(d.getTime())) {
        currentCalDate = new Date(d.getFullYear(), d.getMonth(), 1);
        renderCalendar();
      }
    });

    // ===== Availability details & timeslots =====
    function showRated(data) {
      availabilityBox.innerHTML = '';

    // update title text
var titleNode = document.querySelector(".hcf-activity-title");
if (titleNode && state.itemName) {
    titleNode.textContent = state.itemName;
}

      if (!data || !data.item) {
        availabilityBox.textContent = 'No availability data returned.';
        return;
      }

      var item = data.item;

// store item name
state.itemName = item.name || "";

      renderDynamicFields(item.param || {});


      if (item.rules && typeof item.rules === 'string') {
        try { item.rules = JSON.parse(item.rules); } catch (e) {}
      }

      if (item.rules && item.rules.param) {
        var firstKey = Object.keys(item.rules.param)[0];
        var first = item.rules.param[firstKey];
        if (first) {
          if (first.MIN) state.minQty = parseInt(first.MIN, 10) || 1;
          if (first.MAX) state.maxQty = parseInt(first.MAX, 10) || 60;
          if (state.qty < state.minQty) state.qty = state.minQty;
          if (state.qty > state.maxQty) state.qty = state.maxQty;
          updateQtyDisplay();
        }
      }

      var rate = item.rate || null;
      if (!rate) {
        availabilityBox.textContent = 'No rated response from Checkfront.';
        return;
      }


      // Save rated data and base slip
      state.rated = item;
      state.baseSlip = rate.slip || null;
      state.slip = state.baseSlip || null;
      bookBtn.disabled = !state.slip;

      // Preserve previously selected timeslot (by start_time) if possible
      var previousSelectedStart = null;
      if (state.timeslots &&
          typeof state.selectedTimeslotIndex === 'number' &&
          state.timeslots[state.selectedTimeslotIndex]) {
        previousSelectedStart = state.timeslots[state.selectedTimeslotIndex].start_time || null;
      }

      // Handle timeslots (if any) for the chosen date
      state.timeslots = [];
      if (rate.dates) {
        var dateKeys = Object.keys(rate.dates);
        if (dateKeys.length) {
          var dayObj = rate.dates[dateKeys[0]];
          if (dayObj && Array.isArray(dayObj.timeslots)) {
            state.timeslots = dayObj.timeslots;
          }
        }
      }

      if (timeslotSelect && timeslotGroup) {
        timeslotSelect.innerHTML = '';

        if (state.timeslots.length) {
          var newSelectedIndex = 0;

          state.timeslots.forEach(function (ts, idx) {
            var start24 = ts.start_time || '';
            var end24   = ts.end_time   || '';

            function to12(time24) {
              var p = time24.split(':');
              var h = parseInt(p[0], 10);
              var m = p[1];
              var ampm = h >= 12 ? 'PM' : 'AM';
              h = (h % 12) === 0 ? 12 : (h % 12);
              return h + ':' + m + ' ' + ampm;
            }

            var label = to12(start24) + ' - ' + to12(end24);

            var opt = createEl('option', {
              value: String(idx),
              class: ts.status === 'A' ? 'hcf-slot-available' : 'hcf-slot-unavailable'
            }, [label]);

            timeslotSelect.appendChild(opt);

            // If this timeslot matches the previously selected start_time, remember it
            if (previousSelectedStart && ts.start_time === previousSelectedStart) {
              newSelectedIndex = idx;
            }
          });

          timeslotGroup.style.display = '';

          // Apply selection (same time if possible, otherwise first slot)
          timeslotSelect.value = String(newSelectedIndex);
          state.selectedTimeslotIndex = newSelectedIndex;

          // Adjust slip based on the selected timeslot
          if (state.baseSlip &&
              state.timeslots[newSelectedIndex] &&
              state.timeslots[newSelectedIndex].start_time) {
            var m = state.baseSlip.match(/^(.*@)(\d{2}:\d{2})(X.*)$/);
            if (m) {
              state.slip = m[1] + state.timeslots[newSelectedIndex].start_time + m[3];
            }
          }
        } else {
          timeslotGroup.style.display = 'none';
        }
      }

      availabilityBox.appendChild(createEl('p', null, ['Status: ' + (rate.status || 'Unknown')]));
      if (typeof rate.available !== 'undefined') {
        availabilityBox.appendChild(createEl('p', null, ['Remaining capacity: ' + rate.available]));
      }

      if (rate.summary) {
        var s = rate.summary;
        var ul = createEl('ul');

            // ⭐ Add Event Title at top
    if (state.itemName) {
        ul.appendChild(createEl('li', null, ['Event: ' + state.itemName]));
    }

        if (s.date)  ul.appendChild(createEl('li', null, ['Date: ' + s.date]));
        if (s.end_date && s.end_date !== s.date) {
          ul.appendChild(createEl('li', null, ['Check-out: ' + s.end_date]));
          var startDateObj = new Date(s.date.replace(/-/g, '/'));
          var endDateObj = new Date(s.end_date.replace(/-/g, '/'));
          if (!isNaN(startDateObj) && !isNaN(endDateObj)) {
            var nights = Math.round((endDateObj - startDateObj) / (1000 * 60 * 60 * 24));
            if (nights > 0) {
              ul.appendChild(createEl('li', null, ['Nights: ' + nights]));
            }
          }
        }

        // Show currently selected time slot (if any)
        if (state.timeslots && state.timeslots.length) {
          var selIndex = (typeof state.selectedTimeslotIndex === 'number' &&
                          state.selectedTimeslotIndex >= 0 &&
                          state.selectedTimeslotIndex < state.timeslots.length)
                        ? state.selectedTimeslotIndex
                        : 0;
          var tsSel = state.timeslots[selIndex];
          if (tsSel) {
            var start = tsSel.start_time || '';
            var end   = tsSel.end_time   || '';
            var tsLabel = start && end ? (start + ' - ' + end)
                          : (start || end || 'Selected time slot');
            ul.appendChild(
              createEl('li', { id: 'hcf-timeslot-line' }, ['Time: ' + tsLabel])
            );
          }
        }

        if (s.details) {
          var tmp = document.createElement('div');
          tmp.innerHTML = s.details;
          ul.appendChild(createEl('li', null, ['Details: ' + tmp.textContent]));
        }


        if (s.price && s.price.total) {
          var p = document.createElement('div');
          p.innerHTML = s.price.total;
          ul.appendChild(createEl('li', null, ['Total price: ' + p.textContent]));
        }
        availabilityBox.appendChild(ul);

      }

      bookingForm.style.display = state.slip ? 'block' : 'none';

      debugBox.style.display = 'block';
      debugBox.textContent = 'Rated response from Checkfront:\n\n' + JSON.stringify(data, null, 2);
    }

    // When the customer changes time slot, adjust the slip we send to Checkfront
    if (timeslotSelect) {
      timeslotSelect.addEventListener('change', function() {
        var idx = parseInt(this.value, 10);
        if (isNaN(idx) || !state.timeslots || !state.timeslots[idx]) {
          return;
        }
        state.selectedTimeslotIndex = idx;
        if (state.baseSlip && state.timeslots[idx].start_time) {
          var m = state.baseSlip.match(/^(.*@)(\d{2}:\d{2})(X.*)$/);
          if (m) {
            state.slip = m[1] + state.timeslots[idx].start_time + m[3];
          }
        }

        // Also update the visible "Time" line in the availability summary
        var ts = state.timeslots[idx];
        if (ts) {
          var start = ts.start_time || '';
          var end   = ts.end_time   || '';
          var label = start && end ? (start + ' - ' + end)
                     : (start || end || 'Selected time slot');
          var timeLi = document.getElementById('hcf-timeslot-line');
          if (timeLi) {
            timeLi.textContent = 'Time: ' + label;
          }
        }
      });
    }

    // === "Check Availability & Price" click ===
    checkBtn.addEventListener('click', function() {
      if (!dateInput.value) {
        alert('Please choose a check-in date.');
        return;
      }
      if (!endDateInput.value) {
        alert('Please choose a check-out date.');
        return;
      }
      var dateYmd = dateInput.value.replace(/-/g, '');
      var endYmd = endDateInput.value.replace(/-/g, '');
      var qty = state.qty;

      setLoading(true);

      var url = HowsteanCheckfront.restBase +
        'item-rated?item_id=' + encodeURIComponent(state.itemId) +
        '&date=' + encodeURIComponent(dateYmd) +
        '&end_date=' + encodeURIComponent(endYmd) +
        '&qty=' + encodeURIComponent(qty);

      fetch(url, {
        method: 'GET',
        headers: { 'X-WP-Nonce': HowsteanCheckfront.nonce },
        credentials: 'same-origin'
      })
        .then(function(res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function(data) {
          showRated(data);
        })
        .catch(function(err) {
          console.error('Error fetching rated item', err);
          availabilityBox.textContent = 'Error contacting Checkfront. Please try again.';
        })
        .finally(function() {
          setLoading(false);
        });
    });

    // === Booking submit ===
    bookBtn.addEventListener('click', function() {
      if (!state.slip) {
        alert('Please check availability first.');
        return;
      }
      var formFields = dynamicFieldsContainer ? dynamicFieldsContainer.querySelectorAll('[data-field-name]') : [];
      var grouped = {};

      Array.prototype.forEach.call(formFields, function(el) {
        var name = el.getAttribute('data-field-name');
        if (!grouped[name]) grouped[name] = [];
        grouped[name].push(el);
      });

      var formPayload = {};
      var missing = [];

      Object.keys(grouped).forEach(function(name) {
        var inputs = grouped[name];
        if (!inputs.length) return;

        var first = inputs[0];
        var tag = first.tagName.toLowerCase();
        var type = (first.getAttribute('type') || '').toLowerCase();
        var required = first.required || first.getAttribute('data-field-required') === '1';

        var value = '';

        if (inputs.length > 1) {
          // Radio or checkbox groups
          if (type === 'radio') {
            inputs.forEach(function(el) {
              if (el.checked) value = el.value;
            });
          } else {
            var selected = [];
            inputs.forEach(function(el) {
              var elType = (el.getAttribute('type') || '').toLowerCase();
              if (elType === 'checkbox' && el.checked) {
                selected.push(el.value || '1');
              }
            });
            value = selected.length > 1 ? selected : (selected[0] || '');
          }
        } else if (tag === 'select') {
          if (first.multiple) {
            var chosen = [];
            Array.prototype.forEach.call(first.options, function(opt) {
              if (opt.selected && opt.value) {
                chosen.push(opt.value);
              }
            });
            value = chosen.length > 1 ? chosen : (chosen[0] || '');
          } else {
            value = first.value;
          }
        } else if (type === 'checkbox') {
          value = first.checked ? (first.value || '1') : '';
        } else {
          value = (first.value || '').trim();
        }

        if (required && (!value || (Array.isArray(value) && value.length === 0))) {
          missing.push(name);
        }

        formPayload[name] = value;
      });

      if (missing.length) {
        alert('Please fill in all required fields: ' + missing.join(', '));
        return;
      }

      var tosAgreed = formPayload.customer_tos_agree === '1' || formPayload.customer_tos_agree === 1 || formPayload.customer_tos_agree === true;

      var payload = {
        policy: { customer_tos_agree: tosAgreed ? 1 : 0 },
        slip: state.slip,
        customer_tos_agree: tosAgreed ? 1 : 0,
        form: formPayload
      };

      setLoading(true);

      fetch(HowsteanCheckfront.restBase + 'create-booking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WP-Nonce': HowsteanCheckfront.nonce
        },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      })
        .then(function(res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function(data) {
          debugBox.style.display = 'block';
          debugBox.textContent = 'booking/create response:\n\n' + JSON.stringify(data, null, 2);

          if (data.request && data.request.error) {
            var e = data.request.error;
            var msg = 'There was a problem completing your booking.';
            if (e.details) {
              msg += '\n\n' + e.details;
            }
            alert(msg);
            return;
          }

          var bookingId  = null;
          var bookingRef = null;

          if (data.booking) {
            if (data.booking.booking_id) {
              bookingId = data.booking.booking_id;
            }
            if (data.booking.id) {
              bookingRef = data.booking.id;
            }
            if (data.booking.code) {
              bookingRef = data.booking.code;
            }
          }
          if (!bookingRef && data.booking_id) {
            bookingRef = data.booking_id;
          }

          var refText = bookingRef || bookingId || '(pending reference)';
          var msg = 'Thank you! Your booking has been created.<br><br>' +
            'Your reference: ' + refText + '<br><br>' +
            'You will receive confirmation by email shortly.';
          document.getElementById('howstean-checkfront-app').innerHTML =
            '<div class="hcf-success">' + msg + '</div>';
        })
        .catch(function(err) {
          console.error('Error creating booking', err);
          alert('There was a problem completing your booking. Please try again.');
        })
        .finally(function() {
          setLoading(false);
        });
    });

    // Initial calendar render
    renderCalendar();
  }

  document.addEventListener('DOMContentLoaded', function() {
    var root = document.getElementById('howstean-checkfront-app');
    if (!root) return;
    var itemId = root.getAttribute('data-item-id');
    if (!itemId) {
      root.textContent = 'Missing item_id.';
      return;
    }
    if (typeof HowsteanCheckfront === 'undefined') {
      root.textContent = 'HowsteanCheckfront settings not found. Script not localized correctly.';
      return;
    }
    renderApp(root, itemId);
  });
})();
