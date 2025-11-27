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

    var dateInput, qtyValueEl, availabilityBox, bookingForm, debugBox;
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
    dateGroup.appendChild(createEl('label', null, ['Selected Date']));
    dateInput = createEl('input', { type: 'date', id: 'hcf-date' });

    var yyyy = today.getFullYear();
    var mm = ('0' + (today.getMonth() + 1)).slice(-2);
    var dd = ('0' + today.getDate()).slice(-2);
    dateInput.value = yyyy + '-' + mm + '-' + dd;
    dateInput.min = dateInput.value;

    // Helper: load rated availability for current date & quantity
    function loadAvailability() {
      if (!dateInput.value) {
        alert('Please choose a date.');
        return;
      }

      var dateYmd = dateInput.value.replace(/-/g, '');
      var qty = state.qty;

      setLoading(true);

      var url = HowsteanCheckfront.restBase +
        'item-rated?item_id=' + encodeURIComponent(state.itemId) +
        '&date=' + encodeURIComponent(dateYmd) +
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
      loadAvailability();
    });


    dateGroup.appendChild(dateInput);
    wrapper.appendChild(dateGroup);

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

    function buildFieldControl(name, field) {
      var type = (field.type || 'text').toLowerCase();
      var id = 'hcf-field-' + name;
      var input;

      if (type === 'select' && field.options) {
        input = createEl('select', { id: id, 'data-field-name': name });
        input.appendChild(createEl('option', { value: '' }, ['Please Select']));
        var opts = field.options;
        if (Array.isArray(opts)) {
          opts.forEach(function (opt) {
            var v = typeof opt === 'object' ? opt.value : opt;
            var lbl = typeof opt === 'object' ? (opt.label || opt.name || opt.value) : opt;
            input.appendChild(createEl('option', { value: v }, [lbl]));
          });
        } else if (typeof opts === 'object') {
          Object.keys(opts).forEach(function (k) {
            input.appendChild(createEl('option', { value: k }, [opts[k]]));
          });
        }
      } else if (type === 'checkbox') {
        input = createEl('input', { type: 'checkbox', id: id, 'data-field-name': name, value: '1' });
      } else if (type === 'textarea') {
        input = createEl('textarea', { id: id, 'data-field-name': name });
      } else {
        input = createEl('input', { type: type, id: id, 'data-field-name': name });
      }

      if (field.required) {
        input.setAttribute('required', 'required');
      }

      return input;
    }

    function renderDynamicFields(params) {
      if (!dynamicFieldsContainer) return;
      dynamicFieldsContainer.innerHTML = '';

      if (!params || typeof params !== 'object') {
        return;
      }

      Object.keys(params).forEach(function (name) {
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
      var url = HowsteanCheckfront.restBase +
        'item-rated?item_id=' + encodeURIComponent(state.itemId) +
        '&date=' + encodeURIComponent(ymd) +
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

        // Show currently selected time slot (if any)
        if (state.timeslots && state.timeslots.length) {
          var selIndex = typeof state.selectedTimeslotIndex === 'number'
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
        alert('Please choose a date.');
        return;
      }
      var dateYmd = dateInput.value.replace(/-/g, '');
      var qty = state.qty;

      setLoading(true);

      var url = HowsteanCheckfront.restBase +
        'item-rated?item_id=' + encodeURIComponent(state.itemId) +
        '&date=' + encodeURIComponent(dateYmd) +
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
      var formPayload = {};
      var missing = [];

      Array.prototype.forEach.call(formFields, function (el) {
        var name = el.getAttribute('data-field-name');
        var value = '';
        var tag = el.tagName.toLowerCase();
        var type = (el.getAttribute('type') || '').toLowerCase();

        if (type === 'checkbox') {
          value = el.checked ? (el.value || '1') : '';
        } else if (tag === 'select') {
          value = el.value;
        } else {
          value = (el.value || '').trim();
        }

        if (el.required && !value) {
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
