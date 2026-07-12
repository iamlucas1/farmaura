import { FA_ICON_PATHS } from "../../marketplace/core/marketplace-icons.jsx";

/* FARMAURA Console — ícones extras (estende FA_ICON_PATHS de icons.jsx). */
Object.assign(FA_ICON_PATHS, {
  layout:   '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
  box:      '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="m3 7.5 9 4.5 9-4.5M12 12v9"/>',
  boxes:    '<rect x="3" y="9" width="8" height="11" rx="1.5"/><rect x="13" y="9" width="8" height="11" rx="1.5"/><path d="M7 9V4h10v5"/>',
  route:    '<circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.4 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.6"/>',
  map:      '<path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z"/><path d="M9 4v13M15 6.5v13"/>',
  alert:    '<path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10v4.5M12 17.6h.01"/>',
  money:    '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v.01M18 14.5v.01"/>',
  printer:  '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="1.5"/><path d="M7 14h10v6H7z"/><circle cx="17" cy="12" r=".6" fill="currentColor"/>',
  barcode:  '<path d="M4 6v12M7 6v12M10.5 6v12M14 6v12M17 6v12M20 6v12"/>',
  refresh:  '<path d="M20 11a8 8 0 0 0-14-4.5L4 8m0-4v4h4"/><path d="M4 13a8 8 0 0 0 14 4.5L20 16m0 4v-4h-4"/>',
  send:     '<path d="M4 12 20 4l-6 16-3-7-7-1Z"/>',
  dotsV:    '<circle cx="12" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="18" r="1.4" fill="currentColor" stroke="none"/>',
  flag:     '<path d="M5 21V4M5 4h11l-1.5 3.5L16 11H5"/>',
  nav:      '<path d="M3 11 21 3l-8 18-2.2-7.2L3 11Z"/>',
  store:    '<path d="M4 9 5.5 4h13L20 9M4 9h16M4 9v11h16V9M9 20v-6h6v6"/>',
  scan:     '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/>',
  download: '<path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14"/>',
  expand:   '<path d="M9 4H5a1 1 0 0 0-1 1v4M15 4h4a1 1 0 0 1 1 1v4M9 20H5a1 1 0 0 1-1-1v-4M15 20h4a1 1 0 0 0 1-1v-4"/>',
  receipt:  '<path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z"/><path d="M9 8h6M9 12h5"/>',
  cash:     '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.4"/><path d="M6 9.5v5M18 9.5v5"/>',
  qr:       '<rect x="3.5" y="3.5" width="6" height="6" rx="1"/><rect x="14.5" y="3.5" width="6" height="6" rx="1"/><rect x="3.5" y="14.5" width="6" height="6" rx="1"/><path d="M14.5 14.5h2.5v2.5M20.5 14.5v6M14.5 20.5h6"/>',
  trendup:  '<path d="M4 16 10 10l4 4 6-7M16 7h4v4"/>',
  chart:    '<path d="M4 20V4M4 20h16M8 20v-6M12 20V9M16 20v-9M20 20v-4"/>',
  trophy:   '<path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 16h6l1 4H8l1-4Z"/>',
  pin:      '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
  drop:     '<path d="M12 3s6.5 7.2 6.5 11.3A6.5 6.5 0 0 1 5.5 14.3C5.5 10.2 12 3 12 3Z"/>',
  fire:     '<path d="M12 3c1.2 3.2 4.5 4.4 4.5 8.5a4.5 4.5 0 0 1-9 0c0-1.3.6-2.3 1.3-3 .4 1 1.2 1.5 1.2 1.5C9.5 8 12 6.5 12 3Z"/>',
  scale:    '<path d="M12 4v16M7 20h10M5 8h14M5 8 2.8 13.2a3 3 0 0 0 4.4 0L5 8Zm14 0-2.2 5.2a3 3 0 0 0 4.4 0L19 8ZM12 4 5 8M12 4l7 4"/>',
  doc:      '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M9.5 12h5M9.5 16h5"/>',
  wrench:   '<path d="M14.6 5.8a3.6 3.6 0 0 0-4.9 4.4l-5.5 5.5a1.6 1.6 0 0 0 2.3 2.3l5.5-5.5a3.6 3.6 0 0 0 4.4-4.9l-2.3 2.3-1.8-1.8 2.3-2.3Z"/>',
  bank:     '<path d="M4 10 12 4l8 6M5 10v8M19 10v8M9 10v8M15 10v8M3 21h18"/>',
  image:    '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="9" r="1.6"/><path d="m21 15-5-4.5L9.5 16 7 13.5 3 17.5"/>',
});


export { FA_ICON_PATHS };
