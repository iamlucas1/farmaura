/*
farmaura/react/internal/screens/deliveries-screen.jsx

Internal deliveries screen for Farmaura.

Responsibilities:
- render the delivery route overview and stop list;
- display a free Leaflet map backed by OpenStreetMap tiles;
- preserve navigation and chat actions for each delivery stop;

Observations:
- the route line is drawn from hub to stops using the optimized order available in the page data;
- no API key is required because the map runtime is loaded from Leaflet CDN and OpenStreetMap tiles;
*/

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { loadLeaflet } from "../../shared/leaflet.js";
import { Topbar, orderStatusMeta } from "../core/internal-shell.jsx";

const DEFAULT_CENTER = { lat: -15.9775167, lng: -48.0383778 };
const TILE_LAYER_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_LAYER_ATTRIBUTION = "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors";

function buildStopContent(stop, index) {
  /** Build the popup HTML for a delivery stop. */

  return `
    <div style="min-width:220px">
      <div style="font-weight:800;font-size:14px;margin-bottom:4px">${index + 1}. ${stop.customer}</div>
      <div style="font-size:12.5px;color:#4b5563">${stop.address}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">${stop.district} · ${stop.cep || "Sem CEP"}</div>
    </div>
  `;
}

function buildHubContent(hub) {
  /** Build the popup HTML for the dispatch hub. */

  return `
    <div style="min-width:220px">
      <div style="font-weight:800;font-size:14px;margin-bottom:4px">${hub.name}</div>
      <div style="font-size:12.5px;color:#4b5563">${hub.addr}</div>
    </div>
  `;
}

function createHubIcon(leaflet) {
  /** Create the Leaflet icon used for the hub marker. */

  return leaflet.divIcon({
    className: "lf-icon",
    html: "<div class=\"lf-hub\"></div>",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

function createDriverIcon(leaflet) {
  /** Create the Leaflet icon used for the live driver position marker. */

  return leaflet.divIcon({
    className: "lf-icon",
    html: "<div class=\"lf-hub\" style=\"background:var(--fa-success)\"></div>",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

function createStopIcon(leaflet, index) {
  /** Create the Leaflet icon used for a numbered delivery stop marker. */

  return leaflet.divIcon({
    className: "lf-icon",
    html: `<div class="lf-pin"><span>${index + 1}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -26],
  });
}

function getCoordinates(item) {
  /** Normalize a record into a valid latitude and longitude pair. */

  if (!item || item.lat == null || item.lng == null) {
    return null;
  }
  const lat = Number(item.lat);
  const lng = Number(item.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
}

function RouteMap({ hub, stops, active, driverPosition }) {
  /** Render the delivery map with Leaflet markers and a route line. */

  const elementRef = useRef(null);
  const mapRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersRef = useRef({});
  const routeLineRef = useRef(null);
  const driverMarkerRef = useRef(null);
  const [mapError, setMapError] = useState("");
  const validStops = useMemo(
    () => stops.filter((stop) => getCoordinates(stop)),
    [stops]
  );

  useEffect(() => {
    let cancelled = false;

    async function renderMap() {
      /** Load Leaflet and paint the current delivery route state. */

      if (!elementRef.current) {
        return;
      }

      try {
        const leaflet = await loadLeaflet();
        if (cancelled || !elementRef.current) {
          return;
        }

        setMapError("");

        const hubCoordinates = getCoordinates(hub);
        const firstStopCoordinates = getCoordinates(validStops[0]);
        const center = hubCoordinates || firstStopCoordinates || DEFAULT_CENTER;

        const map = mapRef.current || leaflet.map(elementRef.current, {
          center: [center.lat, center.lng],
          zoom: hubCoordinates || firstStopCoordinates ? 12 : 10,
          zoomControl: true,
          scrollWheelZoom: true,
        });
        mapRef.current = map;

        if (!tileLayerRef.current) {
          tileLayerRef.current = leaflet.tileLayer(TILE_LAYER_URL, {
            attribution: TILE_LAYER_ATTRIBUTION,
            maxZoom: 19,
          });
          tileLayerRef.current.addTo(map);
        }

        Object.values(markersRef.current).forEach((marker) => marker.remove());
        markersRef.current = {};

        if (routeLineRef.current) {
          routeLineRef.current.remove();
          routeLineRef.current = null;
        }

        const bounds = [];

        if (hubCoordinates) {
          const hubMarker = leaflet
            .marker([hubCoordinates.lat, hubCoordinates.lng], {
              icon: createHubIcon(leaflet),
              title: hub.name,
            })
            .bindPopup(buildHubContent(hub))
            .addTo(map);

          markersRef.current.__hub__ = hubMarker;
          bounds.push([hubCoordinates.lat, hubCoordinates.lng]);
        }

        validStops.forEach((stop, index) => {
          const stopCoordinates = getCoordinates(stop);
          if (!stopCoordinates) {
            return;
          }

          const marker = leaflet
            .marker([stopCoordinates.lat, stopCoordinates.lng], {
              icon: createStopIcon(leaflet, index),
              title: stop.customer,
            })
            .bindPopup(buildStopContent(stop, index))
            .addTo(map);

          markersRef.current[stop.id] = marker;
          bounds.push([stopCoordinates.lat, stopCoordinates.lng]);
        });

        const routePath = [
          ...(hubCoordinates ? [[hubCoordinates.lat, hubCoordinates.lng]] : []),
          ...validStops.map((stop) => {
            const stopCoordinates = getCoordinates(stop);
            return [stopCoordinates.lat, stopCoordinates.lng];
          }),
        ];

        if (routePath.length >= 2) {
          routeLineRef.current = leaflet
            .polyline(routePath, {
              color: "#7A0D16",
              weight: 4,
              opacity: 0.82,
              lineJoin: "round",
            })
            .addTo(map);
        }

        if (bounds.length > 0) {
          map.fitBounds(bounds, { padding: [52, 52] });
        } else {
          map.setView([center.lat, center.lng], hubCoordinates || firstStopCoordinates ? 12 : 10);
        }
      } catch (error) {
        if (!cancelled) {
          setMapError(error && error.message ? error.message : "Nao foi possivel carregar o mapa.");
        }
      }
    }

    void renderMap();

    return () => {
      cancelled = true;
    };
  }, [hub, validStops]);

  useEffect(() => {
    /** Focus the active stop marker when the stop list is hovered. */

    const marker = active ? markersRef.current[active] : null;
    const map = mapRef.current;
    if (!marker || !map) {
      return;
    }

    marker.openPopup();
    map.panTo(marker.getLatLng());
  }, [active]);

  useEffect(() => {
    /** Move (or create/remove) the live driver marker as GPS pings arrive. */

    let cancelled = false;

    async function updateDriverMarker() {
      const map = mapRef.current;
      if (!map) {
        return;
      }
      if (!driverPosition) {
        if (driverMarkerRef.current) {
          driverMarkerRef.current.remove();
          driverMarkerRef.current = null;
        }
        return;
      }
      const leaflet = await loadLeaflet();
      if (cancelled || !mapRef.current) {
        return;
      }
      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLatLng([driverPosition.lat, driverPosition.lng]);
      } else {
        driverMarkerRef.current = leaflet
          .marker([driverPosition.lat, driverPosition.lng], { icon: createDriverIcon(leaflet), title: "Entregador" })
          .addTo(map);
      }
      driverMarkerRef.current.bindPopup(`<div style="font-size:12.5px">Entregador · atualizado às ${driverPosition.updatedLabel || "—"}</div>`);
    }

    void updateDriverMarker();

    return () => {
      cancelled = true;
    };
  }, [driverPosition]);

  useEffect(() => {
    /** Destroy the Leaflet map when the screen unmounts. */

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      tileLayerRef.current = null;
      markersRef.current = {};
      routeLineRef.current = null;
      driverMarkerRef.current = null;
    };
  }, []);

  if (mapError) {
    return (
      <div className="ph-map" style={{ display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <span className="fa-iconbox" style={{ margin: "0 auto 14px", width: 52, height: 52 }}>
            <Icon name="pin" size={24} />
          </span>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Mapa indisponivel</div>
          <div className="ph-cell-sub">{mapError}</div>
        </div>
      </div>
    );
  }

  return <div className="ph-map" ref={elementRef}></div>;
}

function DeliveriesScreen({ ctx }) {
  /** Render the deliveries route page and actions. */

  const { orders, openOrder, openChatFor, onLogout, dispatchRoute, deliveryRoute, driverLivePosition, assignRouteDriver, fetchTeamMembers } = ctx;
  const hub = ctx.hub || { name: "", addr: "", lat: null, lng: null };
  const route = {
    id: (deliveryRoute && deliveryRoute.id) || "",
    optimizedOrder: Array.isArray(deliveryRoute && deliveryRoute.stops) ? deliveryRoute.stops.map((stop) => stop.order_id) : [],
    totalKm: deliveryRoute ? Number(deliveryRoute.total_km || 0) : 0,
    totalMin: deliveryRoute ? Number(deliveryRoute.total_min || 0) : 0,
    savedKm: deliveryRoute ? Number(deliveryRoute.saved_km || 0) : 0,
    driver: (deliveryRoute && deliveryRoute.driver) || "",
    driverUserId: (deliveryRoute && deliveryRoute.driver_user_id) || "",
  };
  const [active, setActive] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [assigningDriver, setAssigningDriver] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const members = fetchTeamMembers ? await fetchTeamMembers() : [];
      if (alive) setDrivers((members || []).filter((member) => member.role === 'driver'));
    })();
    return () => { alive = false; };
  }, []);

  const handleAssignDriver = async (driverUserId) => {
    if (!route.id) return;
    setAssigningDriver(true);
    try {
      await assignRouteDriver(route.id, driverUserId);
    } finally {
      setAssigningDriver(false);
    }
  };

  const byId = (id) => orders.find((order) => order.id === id);
  const ordered = route.optimizedOrder
    .map(byId)
    .filter((order) => order && order.fulfillment === "delivery" && order.status !== "dispatched");
  const others = orders.filter(
    (order) => order.fulfillment === "delivery" && order.status !== "dispatched" && !route.optimizedOrder.includes(order.id)
  );
  const stops = [...ordered, ...others];
  const readyCount = stops.filter((order) => order.status === "ready").length;
  const mappedStops = stops.filter((stop) => getCoordinates(stop));
  const hubCoordinates = getCoordinates(hub);
  const mapsUrl = (order) => hubCoordinates
    ? `https://www.google.com/maps/dir/?api=1&origin=${hub.lat},${hub.lng}&destination=${order.lat},${order.lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${order.lat},${order.lng}`;

  return (
    <>
      <Topbar
        title="Entregas & rota"
        sub={`${stops.length} entregas pendentes · ${readyCount} prontas para sair`}
        onLogout={onLogout} ctx={ctx}
      />
      <div className="ph-content ph-content-wide">
        <div className="ph-map-grid">
          <div>
            <RouteMap hub={hub} stops={stops} active={active} driverPosition={driverLivePosition} />
            <div className="fa-card" style={{ marginTop: 16, padding: 16, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <span className="fa-iconbox" style={{ background: "var(--fa-rose-soft)" }}>
                <Icon name="route" size={22} />
              </span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Melhor rota planejada</div>
                <div className="ph-cell-sub">Calculada a partir da loja · {hub.addr}</div>
              </div>
              <div style={{ display: "flex", gap: 22, marginLeft: "auto" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{stops.length}</div>
                  <div className="ph-cell-sub">paradas</div>
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{route.totalKm} km</div>
                  <div className="ph-cell-sub">distância</div>
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{route.totalMin} min</div>
                  <div className="ph-cell-sub">estimativa</div>
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{mappedStops.length}</div>
                  <div className="ph-cell-sub">com mapa</div>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: "var(--fa-success)", fontWeight: 600 }}>
              <Icon name="sparkle" size={15} />
              Rota otimizada economiza ~{route.savedKm} km vs. ordem de chegada dos pedidos.
            </div>
          </div>
          <div>
            <div className="ph-sec-head" style={{ marginTop: 0 }}>
              <div style={{ flex: 1 }}>
                <div className="ph-sec-title">Lista de endereços</div>
                <div className="ph-sec-sub">Sequência otimizada{driverLivePosition ? ` · posição atualizada às ${driverLivePosition.updatedLabel}` : ''}</div>
              </div>
            </div>
            <div className="fa-card" style={{ padding: 16, marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span className="fa-iconbox"><Icon name="truck" size={18} /></span>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>Entregador</div>
                <div className="ph-cell-sub">{route.driver || 'Nenhum entregador atribuído'}</div>
              </div>
              <select
                className="fa-select"
                value={route.driverUserId}
                disabled={assigningDriver || !route.id}
                onChange={(event) => handleAssignDriver(event.target.value)}
                style={{ width: 220, flex: "none" }}
              >
                <option value="">Sem entregador</option>
                {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
              </select>
            </div>
            <div className="fa-card" style={{ padding: "4px 16px" }}>
              {stops.map((order, index) => (
                <div
                  key={order.id}
                  className="ph-routestep"
                  data-active={active === order.id ? "1" : "0"}
                  onMouseEnter={() => setActive(order.id)}
                  onMouseLeave={() => setActive(null)}
                  onClick={() => openOrder(order.id)}
                >
                  <span className="ph-routenum">{index + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{order.customer}</span>
                      {order.priority === "express" ? <Icon name="bolt" size={13} style={{ color: "var(--fa-vital)" }} /> : null}
                    </div>
                    <div className="ph-cell-sub" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {order.address}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                      <span className="ph-cell-sub">{order.district} · {order.cep}</span>
                      <span className="ph-cell-sub">·</span>
                      <span className="ph-cell-sub">{order.dist} km</span>
                      {order.status === "ready" ? (
                        <span className="fa-badge fa-badge-health" style={{ fontSize: 10 }}>pronto</span>
                      ) : (
                        <span className="fa-badge fa-badge-warn" style={{ fontSize: 10 }}>
                          {orderStatusMeta(order.status).label.toLowerCase()}
                        </span>
                      )}
                      {!getCoordinates(order) ? <span className="fa-badge fa-badge-mist" style={{ fontSize: 10 }}>sem coordenada</span> : null}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "none" }}>
                    <a
                      className="fa-iconbtn"
                      style={{
                        width: 34,
                        height: 34,
                        opacity: getCoordinates(order) ? 1 : 0.45,
                        pointerEvents: getCoordinates(order) ? "auto" : "none",
                      }}
                      href={mapsUrl(order)}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir navegacao"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Icon name="nav" size={15} />
                    </a>
                    <button
                      className="fa-iconbtn"
                      style={{ width: 34, height: 34 }}
                      aria-label="conversar"
                      onClick={(event) => {
                        event.stopPropagation();
                        openChatFor(order);
                      }}
                    >
                      <Icon name="chat" size={15} />
                    </button>
                  </div>
                </div>
              ))}
              {stops.length === 0 ? (
                <div className="ph-empty" style={{ padding: "30px 10px" }}>
                  <div className="fa-faint">Nenhuma entrega pendente.</div>
                </div>
              ) : null}
            </div>
            <button className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" style={{ marginTop: 14 }} disabled={readyCount === 0} onClick={dispatchRoute}>
              <Icon name="nav" size={18} />
              Despachar rota ({readyCount} {readyCount === 1 ? "pronta" : "prontas"})
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export { DeliveriesScreen, RouteMap };
