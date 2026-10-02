// ICS fetch + parse for Google secret iCal feeds. Times are converted to Asia/Manila.
const TZ_OFFSET_MIN = 8 * 60;
const RANGE_PAST = 14, RANGE_FUTURE = 120;
export const CAL_TTL = 600;
/* ---------------- ICS parsing ---------------- */
function unfold(ics) { return ics.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, ''); }

export function parseICS(ics, src) {
  const lines = unfold(ics).split('\n');
  const events = []; let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const left = line.slice(0, i), val = line.slice(i + 1);
    const [name, ...params] = left.split(';');
    const p = {}; params.forEach(x => { const [k, v] = x.split('='); p[k] = v; });
    if (name === 'EXDATE') { (cur.exdates ||= []).push(...val.split(',').map(v => toLocal(v, p).date)); continue; }
    cur[name] = { val, p };
  }
  const todayMs = startOfDay(new Date());
  const minDate = isoDate(new Date(todayMs - RANGE_PAST * 864e5));
  const maxDate = isoDate(new Date(todayMs + RANGE_FUTURE * 864e5));
  const out = [];
  // Overrides of recurring instances (RECURRENCE-ID) replace the generated one.
  const overrides = new Set(events.filter(e => e['RECURRENCE-ID']).map(e => e.UID?.val + '|' + toLocal(e['RECURRENCE-ID'].val, e['RECURRENCE-ID'].p).date));
  for (const e of events) {
    if (!e.DTSTART || e.STATUS?.val === 'CANCELLED') continue;
    if (e.TRANSP?.val === 'TRANSPARENT' && /^(Home|Office)$/i.test(e.SUMMARY?.val || '')) continue; // working-location noise
    const start = toLocal(e.DTSTART.val, e.DTSTART.p);
    const end = e.DTEND ? toLocal(e.DTEND.val, e.DTEND.p) : null;
    const base = {
      title: (e.SUMMARY?.val || '(no title)').replace(/\\,/g, ',').replace(/\\n/g, ' '),
      loc: (e.LOCATION?.val || '').replace(/\\,/g, ','),
      time: start.allDay ? '' : start.time,
      endTime: end && !end.allDay ? end.time : '',
      allDay: start.allDay, src,
    };
    const uid = e.UID?.val || base.title;
    const push = (date, suffix) => {
      if (date < minDate || date > maxDate) return;
      if (e.exdates?.includes(date)) return;
      if (!e['RECURRENCE-ID'] && e.RRULE && overrides.has(uid + '|' + date)) return;
      out.push({ ...base, date, id: 'g_' + hash(uid + suffix + date) });
    };
    if (e.RRULE) expand(e.RRULE.val, start.date, push, maxDate);
    else push(start.date, '');
  }
  return out;
}

function expand(rrule, startDate, push, maxDate) {
  const r = {}; rrule.split(';').forEach(x => { const [k, v] = x.split('='); r[k] = v; });
  const interval = Number(r.INTERVAL || 1);
  let until = r.UNTIL ? toLocal(r.UNTIL, {}).date : null;
  let count = r.COUNT ? Number(r.COUNT) : Infinity;
  const limit = until && until < maxDate ? until : maxDate;
  const d0 = fromISO(startDate);
  let n = 0, guard = 0;
  if (r.FREQ === 'WEEKLY') {
    const days = r.BYDAY ? r.BYDAY.split(',').map(x => 'SU,MO,TU,WE,TH,FR,SA'.split(',').indexOf(x.slice(-2))) : [d0.getDay()];
    // walk week by week from the week of d0
    const weekStart = new Date(d0); weekStart.setDate(d0.getDate() - d0.getDay());
    for (let w = 0; guard++ < 600 && n < count; w += interval) {
      for (const dow of days.sort()) {
        const d = new Date(weekStart); d.setDate(weekStart.getDate() + w * 7 + dow);
        if (d < d0) continue;
        const iso = isoDate(d); if (iso > limit) return;
        push(iso, '#' + n); n++; if (n >= count) return;
      }
    }
  } else if (r.FREQ === 'DAILY') {
    for (let i = 0; guard++ < 2000 && n < count; i += interval) {
      const d = new Date(d0); d.setDate(d0.getDate() + i);
      const iso = isoDate(d); if (iso > limit) return; push(iso, '#' + n); n++;
    }
  } else if (r.FREQ === 'MONTHLY') {
    for (let i = 0; guard++ < 240 && n < count; i += interval) {
      const d = new Date(d0.getFullYear(), d0.getMonth() + i, d0.getDate());
      if (d.getDate() !== d0.getDate()) continue; // skip months without that day
      const iso = isoDate(d); if (iso > limit) return; push(iso, '#' + n); n++;
    }
  } else if (r.FREQ === 'YEARLY') {
    for (let i = 0; guard++ < 50 && n < count; i += interval) {
      const d = new Date(d0.getFullYear() + i, d0.getMonth(), d0.getDate());
      const iso = isoDate(d); if (iso > limit) return; push(iso, '#' + n); n++;
    }
  } else push(startDate, '');
}

// Returns {date:'YYYY-MM-DD', time:'HH:MM', allDay} in Manila local time.
function toLocal(val, p) {
  if (p.VALUE === 'DATE' || /^\d{8}$/.test(val)) return { date: `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`, time: '', allDay: true };
  const m = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z?)$/);
  if (!m) return { date: val.slice(0, 10), time: '', allDay: true };
  let d;
  if (m[7] === 'Z') { d = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5])); d = new Date(d.getTime() + TZ_OFFSET_MIN * 60000); }
  else { d = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5])); } // TZID (assume Manila) or floating
  return { date: isoDate(d, true), time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`, allDay: false };
}
const pad = n => String(n).padStart(2, '0');
function isoDate(d, utc) { return utc ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fromISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function startOfDay(d) { const x = new Date(d.getTime() + TZ_OFFSET_MIN * 60000); return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) - TZ_OFFSET_MIN * 60000; }
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
