// The "Book a design consultation" sheet. Not connected to anything yet (see consultation.sendTo in the config):
// it checks the fields, then shows the thank-you. Nothing is sent or stored.
import { moneyRange } from './estimate.js';

export function createConsult({ cfg, getTotals }) {
  const dlg = document.getElementById('consult');
  const form = document.getElementById('consultForm');
  const thanks = document.getElementById('thanks');
  const err = document.getElementById('formError');
  const times = document.getElementById('times');
  let time = cfg.consultation.bestTimes[0];

  times.innerHTML = cfg.consultation.bestTimes.map((t, i) => `<button class="fg-pill" type="button" aria-pressed="${i === 0}" data-time="${t}">${t}</button>`).join('');
  times.addEventListener('click', (e) => {
    const b = e.target.closest('[data-time]'); if (!b) return;
    time = b.dataset.time;
    times.querySelectorAll('[data-time]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });

  function open(trigger) {
    const t = getTotals();
    document.getElementById('sheetPrice').textContent = moneyRange(t.range);
    form.hidden = false; thanks.hidden = true; err.textContent = '';
    form.querySelectorAll('.ws-field').forEach((f) => f.classList.remove('error'));
    dlg.returnTo = trigger;
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    setTimeout(() => document.getElementById('fName').focus(), 30);
  }
  function close() {
    if (dlg.open) dlg.close();
  }
  dlg.addEventListener('close', () => dlg.returnTo && dlg.returnTo.focus());
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) { close(); return; }
    if (e.target === dlg) {                          // a tap on the dimmed backdrop
      const r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fName = document.getElementById('fName'), fPhone = document.getElementById('fPhone'), fEmail = document.getElementById('fEmail');
    const name = fName.value.trim(), phone = fPhone.value.trim(), email = fEmail.value.trim();
    const bad = [];
    const mark = (input, ok) => { input.closest('.ws-field').classList.toggle('error', !ok); if (!ok) bad.push(input); };
    mark(fName, name.length > 1);
    mark(fPhone, phone.replace(/\D/g, '').length >= 10);
    mark(fEmail, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    if (bad.length) {
      err.textContent = 'Please check the highlighted fields: a name, a 10-digit phone number and an email address.';
      bad[0].focus();
      return;
    }
    // Not connected yet: nothing leaves the page. A backend or form service would receive
    // { name, phone, email, time, design, estimate } here when consultation.sendTo is set.
    const fill = (s) => s.replace('{business}', cfg.business.name).replace('{phone}', phone).replace('{name}', name);
    document.getElementById('thanksText').textContent = `${fill(cfg.consultation.thankYouText)} Best time: ${time.toLowerCase()}.`;
    document.getElementById('thanksPrice').textContent = moneyRange(getTotals().range);
    form.hidden = true; thanks.hidden = false;
    thanks.querySelector('[data-close]').focus();
  });

  return { open, close };
}
