// Hand-authored stroke-style SVG icon set (24x24, currentColor) — no icon
// font/library dependency, no emoji.
const wrap = (inner, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${extra}>${inner}</svg>`;

export const ICONS = {
  dashboard: wrap('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  store: wrap('<path d="M4 9.5 5.2 4h13.6l1.2 5.5"/><path d="M4 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0"/><path d="M5 9.5V20h14V9.5"/><path d="M9.5 20v-6h5v6"/>'),
  scooter: wrap('<circle cx="6" cy="18" r="2.2"/><circle cx="17" cy="18" r="2.2"/><path d="M6 18h4l1.5-6h5"/><path d="M11.5 8H15l1.5 4H19"/><path d="M8 18h6.5"/>'),
  battery: wrap('<rect x="2.5" y="8" width="16" height="9" rx="1.5"/><path d="M18.5 11v3"/><rect x="5" y="10.5" width="4" height="4" fill="currentColor" stroke="none"/>'),
  charger: wrap('<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z"/>'),
  package: wrap('<path d="M21 8V17a1 1 0 0 1-.5.87l-8 4.5a1 1 0 0 1-1 0l-8-4.5A1 1 0 0 1 3 17V8"/><path d="m3 8 9-5 9 5-9 5-9-5Z"/><path d="M12 13v9"/>'),
  sales: wrap('<path d="M4 4h2l1 12.2A2 2 0 0 0 9 18h8.5a2 2 0 0 0 2-1.6L21 8H7"/><circle cx="10" cy="21.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="17.5" cy="21.5" r="1.4" fill="currentColor" stroke="none"/>'),
  transfer: wrap('<path d="M4 8h13"/><path d="m14 4 3.5 4L14 12"/><path d="M20 16H7"/><path d="m10 20-3.5-4L10 12"/>'),
  reports: wrap('<path d="M4 20V10"/><path d="M11 20V4"/><path d="M18 20v-7"/><path d="M3 20h18"/>'),
  alert: wrap('<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none"/>'),
  plus: wrap('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  edit: wrap('<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m14 6.5 3 3"/>'),
  trash: wrap('<path d="M4 7h16"/><path d="M9 7V4.8c0-.44.36-.8.8-.8h4.4c.44 0 .8.36.8.8V7"/><path d="M6 7l1 13.2c.03.44.4.8.85.8h8.3c.44 0 .82-.36.85-.8L18 7"/><path d="M10 11v6"/><path d="M14 11v6"/>'),
  close: wrap('<path d="M5 5l14 14"/><path d="M19 5 5 19"/>'),
  search: wrap('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.3-4.3"/>'),
  filter: wrap('<path d="M4 5h16"/><path d="M7 12h10"/><path d="M10 19h4"/>'),
  chevronDown: wrap('<path d="m6 9 6 6 6-6"/>'),
  chevronLeft: wrap('<path d="m15 6-6 6 6 6"/>'),
  download: wrap('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>'),
  print: wrap('<path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="1.5"/><path d="M6 17v4h12v-4"/>'),
  check: wrap('<path d="m5 13 4 4L19 7"/>'),
  checkCircle: wrap('<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.5 2.5L16 9.5"/>'),
  menu: wrap('<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>'),
  building: wrap('<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/><path d="M10 21v-3h4v3"/>'),
  ev: wrap('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M13 7 9 13h3l-1 4 4-6h-3z"/>'),
  arrowRight: wrap('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'),
  refresh: wrap('<path d="M20 11a8 8 0 0 0-14.6-4.5M4 13a8 8 0 0 0 14.6 4.5"/><path d="M4 4v5h5"/><path d="M20 20v-5h-5"/>'),
  wallet: wrap('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16" cy="14.5" r="1" fill="currentColor" stroke="none"/>'),
  boxes: wrap('<path d="M4 16.5v-5l4-2 4 2v5l-4 2Z"/><path d="M12 18.5v-5l4-2 4 2v5l-4 2Z"/><path d="M8 9.5v-5l4-2 4 2v5l-4 2Z"/>'),
  user: wrap('<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c1.4-3.6 4.4-5.5 7.5-5.5s6.1 1.9 7.5 5.5"/>'),
  phone: wrap('<path d="M6.5 4h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5L16 13l4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4Z"/>'),
  calendar: wrap('<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/>'),
  info: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.6" r="0.9" fill="currentColor" stroke="none"/>')
};

export function icon(name, cls = '') {
  return `<span class="icon ${cls}">${ICONS[name] || ''}</span>`;
}
