import React from "react";

/* FARMAURA — line icons. Linear, rounded, medium stroke per design system. */
const FA_ICON_PATHS = {
  search:   '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
  cart:     '<path d="M1 1h4l2.6 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>',
  user:     '<path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/>',
  heart:    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1 7.8 7.7 7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8Z"/>',
  menu:     '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close:    '<path d="M6 6 18 18M18 6 6 18"/>',
  // Single filled path (bubble-with-tail + receiver combined via fill-rule), not the usual
  // stroke+fill pair every other icon here uses — a stroked outline scales its line thickness
  // by `stroke-width` regardless of icon size, so at the 14px the chat panel header renders this
  // at, the outline overpowered and visually squeezed the receiver glyph off-center. A filled
  // shape scales cleanly at any size instead.
  whatsapp: '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.148.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.03 0C5.412 0 .05 5.36.05 11.977c0 2.114.553 4.176 1.605 5.996L0 24l6.19-1.622a11.9 11.9 0 0 0 5.837 1.492h.005c6.617 0 11.978-5.362 11.978-11.978C24.01 5.36 18.65.005 12.03.005zm.002 21.785h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.981.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.267c0-5.462 4.447-9.906 9.909-9.906 2.646 0 5.132 1.032 7.001 2.902a9.844 9.844 0 0 1 2.899 6.998c0 5.462-4.447 9.906-9.925 9.906z" fill="currentColor" stroke="none"/>',
  expand:   '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  paperclip: '<path d="M21.4 11.1 12.6 20a4.5 4.5 0 0 1-6.4-6.4l9-9a3 3 0 0 1 4.3 4.3l-9 9a1.5 1.5 0 0 1-2.1-2.1l8.3-8.3"/>',
  plus:     '<path d="M12 5v14M5 12h14"/>',
  minus:    '<path d="M5 12h14"/>',
  star:     '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8-4.3-4.1 5.9-.9z" fill="currentColor" stroke="none"/>',
  chevR:    '<path d="m9 5 7 7-7 7"/>',
  chevL:    '<path d="m15 5-7 7 7 7"/>',
  chevD:    '<path d="m5 9 7 7 7-7"/>',
  arrowR:   '<path d="M5 12h14M13 6l6 6-6 6"/>',
  truck:    '<path d="M3 6h11v9H3z"/><path d="M14 9h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>',
  shield:   '<path d="M12 3.5 5 6v5.5C5 16 8 19.2 12 20.5 16 19.2 19 16 19 11.5V6z"/><path d="m9.2 11.8 1.9 1.9 3.7-3.9"/>',
  chat:     '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/>',
  pill:     '<rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M9 9l6 6"/>',
  pillsolid: '<g transform="rotate(45 12 12)"><rect x="3.5" y="8.5" width="17" height="7" rx="3.5"/><path d="M12 8.5h4.5a3.5 3.5 0 0 1 0 7H12z" fill="currentColor" stroke="#fff"/></g>',
  capsule:  '<rect x="8.5" y="3" width="7" height="18" rx="3.5"/><path d="M8.5 12h7"/>',
  rx:       '<path d="M6 3v18M6 3h6a4 4 0 0 1 0 8H6m6 0 6 8"/>',
  clock:    '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.8"/>',
  check:    '<path d="m5 12.5 4.5 4.5L19 7"/>',
  filter:   '<path d="M4 6h16M7 12h10M10 18h4"/>',
  pin:      '<path d="M12 21s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10Z"/><circle cx="12" cy="11" r="2.2"/>',
  trash:    '<path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/>',
  percent:  '<path d="M6 18 18 6"/><circle cx="7.5" cy="7.5" r="2"/><circle cx="16.5" cy="16.5" r="2"/>',
  leaf:     '<path d="M5 19C5 11 11 5 19 5c0 8-6 14-14 14Z"/><path d="M5 19c3-5 6-7 10-9"/>',
  sparkle:  '<path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z"/><path d="M18 16l.7 1.8L20.5 18l-1.8.7L18 20l-.7-1.3L15.5 18l1.8-.2z"/>',
  bell:     '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2H4.5z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  tag:      '<path d="M4 12V5h7l8 8-7 7-8-8Z"/><circle cx="8" cy="9" r="1.3"/>',
  bag:      '<path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  bolt:     '<path d="M13 3 5 13h6l-1 8 8-10h-6z"/>',
  card:     '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>',
  pix:      '<path d="m12 4 8 8-8 8-8-8z"/><path d="M9 12h6"/>',
  repeat:   '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  pause:    '<rect x="7" y="5" width="3.2" height="14" rx="1"/><rect x="13.8" y="5" width="3.2" height="14" rx="1"/>',
  play:     '<path d="M7 5.5v13l11-6.5z"/>',
  gift:     '<rect x="3" y="8" width="18" height="13" rx="1"/><path d="M3 12h18M12 8v13"/>',
  phone:    '<path d="M6 4h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5V18a2 2 0 0 1-2 2A14 14 0 0 1 4 6a2 2 0 0 1 2-2Z"/>',
  mail:     '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  lock:     '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  camera:   '<path d="M4 8h3l1.3-2h7.4L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.2"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9.5h16M8 3v4M16 3v4"/>',
  edit:     '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/>',
  eye:      '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff:   '<path d="m4 4 16 16"/><path d="M9.6 9.7A3 3 0 0 0 14.3 14.4"/><path d="M6.4 6.7C3.9 8.2 2 12 2 12s4 7 10 7c1.7 0 3.3-.4 4.7-1.1"/><path d="M10 5.2A9.7 9.7 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-2.2 2.9"/>',
  logout:   '<path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2"/><path d="M10 12h11m0 0-3-3m3 3-3 3"/>',
  cog:      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 0 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 0 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"/>',
  grid:     '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  activity: '<path d="M3 12h4l2.5 7 5-14L17 12h4"/>',
  syringe:  '<path d="m14 4 6 6"/><path d="M18 8 8.5 17.5 4 19l1.5-4.5L15 5z"/><path d="m9 11 4 4M13.5 6.5l4 4"/>',
  drop:     '<path d="M12 3.2s6 6.3 6 10.8a6 6 0 0 1-12 0c0-4.5 6-10.8 6-10.8Z"/>',
  thermometer: '<path d="M14 14.2V6a2 2 0 0 0-4 0v8.2a4 4 0 1 0 4 0Z"/><path d="M12 8v6.5"/>',
  gauge:    '<path d="M4.5 18a8 8 0 1 1 15 0"/><path d="m12 13.5 4-4"/><circle cx="12" cy="13.8" r="1.1" fill="currentColor" stroke="none"/>',
  info:     '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 7.6h.01"/>',
  plusCircle: '<circle cx="12" cy="12" r="8"/><path d="M12 8.5v7M8.5 12h7"/>',
  star2:    '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8-4.3-4.1 5.9-.9z"/>',
  receipt:  '<path d="M6 3h12v18l-2.5-1.5L13 21l-1.5-1.5L10 21l-2.5-1.5L6 21Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  // Category-shelf glyphs, matched literally to the demo's `.catjar` icons — the backend has no
  // Category.glyph field (see CATEGORY_ICON_BY_LABEL, home-screen.jsx), so these are looked up by
  // category name client-side rather than chosen by an admin.
  medsCapsule:    '<rect x="3" y="10" width="18" height="7" rx="3.5" transform="rotate(-25 12 12)"/><path d="M8 12l3 3"/>',
  vitaminSun:     '<path d="M12 2v6M12 16v6M4.9 4.9l4.2 4.2M14.9 14.9l4.2 4.2M2 12h6M16 12h6M4.9 19.1l4.2-4.2M14.9 9.1l4.2-4.2"/>',
  hygieneBottle:  '<path d="M9 3h6v4H9z"/><path d="M8 7h8l1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L8 7Z"/>',
  babyFace:       '<circle cx="12" cy="9" r="5"/><path d="M8 9c0 2 4 2 4 4M4 21c0-4 3.5-6 8-6s8 2 8 6"/>',
  perfumeDrop:    '<path d="M12 3c2 3 4 5 4 8a4 4 0 0 1-8 0c0-3 2-5 4-8Z"/><path d="M12 15v6"/>',
  wellbeingHeart: '<path d="M20.8 8.6c0 5-8.8 10.6-8.8 10.6S3.2 13.6 3.2 8.6a4.6 4.6 0 0 1 8.8-2 4.6 4.6 0 0 1 8.8 2Z"/>',
};

function Icon({ name, size = 22, stroke = 1.8, style, className }) {
  const d = FA_ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      style={style} className={className} aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: d }} />
  );
}

export { FA_ICON_PATHS, Icon };
