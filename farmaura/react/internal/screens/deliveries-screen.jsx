/*
farmaura/react/internal/screens/deliveries-screen.jsx

Internal deliveries screen for Farmaura.

Responsibilities:
- let the operator plan 1, 2, 3 or more simultaneous delivery routes (one per
  driver going out right now) from every pending delivery order at once;
- render every currently active route on one map, one color per route, plus
  each driver's live GPS position;
- preserve navigation and chat actions for each delivery stop;

Observations:
- route splitting and ordering (sweep clustering + bidirectional Dijkstra over
  a proximity graph) happens entirely on the backend (app/domain/geo.py,
  DeliveryService.plan_routes) — this screen only renders what it gets back
  and lets the operator choose which drivers to plan for;
- no API key is required because the map runtime is loaded from Leaflet CDN and OpenStreetMap tiles;
*/

import React, { useEffect, useMemo, useRef, useState } from "react";
import { loadLeaflet } from "../../shared/leaflet.js";
import { orderStatusMeta, isActiveOrderStatus } from "../core/internal-shell.jsx";
import { Icon, PageHead, Badge, EmptyState, SERIES } from "../core/internal-ui.jsx";

const DEFAULT_CENTER = { lat: -15.9775167, lng: -48.0383778 };
const TILE_LAYER_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_LAYER_ATTRIBUTION = "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors";

function buildStopContent(stop, index, driverLabel) {
  /** Build the popup HTML for a delivery stop. */

  return `
    <div style="min-width:220px">
      <div style="font-weight:800;font-size:14px;margin-bottom:4px">${index + 1}. ${stop.customer}</div>
      ${driverLabel ? `<div style="font-size:11.5px;color:var(--accent);font-weight:700;margin-bottom:2px">${driverLabel}</div>` : ""}
      <div style="font-size:12.5px;color:var(--text-secondary)">${stop.address}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${stop.district} · ${stop.cep || "Sem CEP"}</div>
    </div>
  `;
}

function buildHubContent(hub) {
  /** Build the popup HTML for the dispatch hub. */

  return `
    <div style="min-width:220px">
      <div style="font-weight:800;font-size:14px;margin-bottom:4px">${hub.name}</div>
      <div style="font-size:12.5px;color:var(--text-secondary)">${hub.addr}</div>
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

function createDriverIcon(leaflet, color) {
  /** Create the Leaflet icon used for one route's live driver position marker. */

  return leaflet.divIcon({
    className: "lf-icon",
    html: `<div class="lf-hub" style="background:${color || "var(--good)"}"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

function createStopIcon(leaflet, index, color) {
  /** Create the Leaflet icon used for a numbered delivery stop marker, tinted by route. */

  return leaflet.divIcon({
    className: "lf-icon",
    html: `<div class="lf-pin" style="background:${color || "var(--brand)"}"><span>${index + 1}</span></div>`,
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

function hasRealCoordinates(point) {
  /** Coordinates that are present but pinned at (0,0) mean geocoding silently failed
      (see dev-obsidian/farmaura/05_Integracoes_Infra/Geocoding_Nominatim.md) — treat
      that the same as missing, or a route leg would jump out to the Gulf of Guinea. */

  return !!point && (Math.abs(point.lat) > 0.0001 || Math.abs(point.lng) > 0.0001);
}

function routeColor(index) {
  return SERIES[index % SERIES.length];
}

/* ---------- map: every active route at once, one color each, plus every driver's live position ---------- */

function RouteMap({ hub, routes, activeStopId, driverLivePositions }) {
  /** Render the delivery map with one Leaflet marker set and polyline per active route. */

  const elementRef = useRef(null);
  const mapRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersRef = useRef({}); // por stop.id
  const routeLinesRef = useRef({}); // por route.id
  const driverMarkersRef = useRef({}); // por route.id
  const [mapError, setMapError] = useState("");

  const routesWithStops = useMemo(
    () => routes.map((route) => ({ ...route, validStops: route.stops.filter((stop) => hasRealCoordinates(getCoordinates(stop))) })),
    [routes]
  );

  useEffect(() => {
    let cancelled = false;

    async function renderMap() {
      /** Load Leaflet and paint every active route's markers and line. */

      if (!elementRef.current) {
        return;
      }

      try {
        const leaflet = await loadLeaflet();
        if (cancelled || !elementRef.current) {
          return;
        }

        setMapError("");

        const rawHubCoordinates = getCoordinates(hub);
        const hubCoordinates = hasRealCoordinates(rawHubCoordinates) ? rawHubCoordinates : null;
        const firstStopCoordinates = getCoordinates(routesWithStops.flatMap((route) => route.validStops)[0]);
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
        Object.values(routeLinesRef.current).forEach((line) => line.remove());
        routeLinesRef.current = {};

        const bounds = [];

        if (hubCoordinates) {
          const hubMarker = leaflet
            .marker([hubCoordinates.lat, hubCoordinates.lng], { icon: createHubIcon(leaflet), title: hub.name })
            .bindPopup(buildHubContent(hub))
            .addTo(map);
          markersRef.current.__hub__ = hubMarker;
          bounds.push([hubCoordinates.lat, hubCoordinates.lng]);
        }

        routesWithStops.forEach((route) => {
          route.validStops.forEach((stop, index) => {
            const stopCoordinates = getCoordinates(stop);
            const marker = leaflet
              .marker([stopCoordinates.lat, stopCoordinates.lng], { icon: createStopIcon(leaflet, index, route.color), title: stop.customer })
              .bindPopup(buildStopContent(stop, index, route.driver))
              .addTo(map);
            markersRef.current[stop.id] = marker;
            bounds.push([stopCoordinates.lat, stopCoordinates.lng]);
          });

          const routePath = [
            ...(hubCoordinates ? [[hubCoordinates.lat, hubCoordinates.lng]] : []),
            ...route.validStops.map((stop) => { const c = getCoordinates(stop); return [c.lat, c.lng]; }),
          ];
          if (routePath.length >= 2) {
            routeLinesRef.current[route.id] = leaflet
              .polyline(routePath, { color: route.color, weight: 4, opacity: 0.82, lineJoin: "round" })
              .addTo(map);
          }
        });

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
  }, [hub, routesWithStops]);

  useEffect(() => {
    /** Focus the active stop marker when the stop list is hovered. */

    const marker = activeStopId ? markersRef.current[activeStopId] : null;
    const map = mapRef.current;
    if (!marker || !map) {
      return;
    }

    marker.openPopup();
    map.panTo(marker.getLatLng());
  }, [activeStopId]);

  useEffect(() => {
    /** Move (or create/remove) each route's live driver marker as GPS pings arrive. */

    let cancelled = false;

    async function updateDriverMarkers() {
      const map = mapRef.current;
      if (!map) {
        return;
      }
      const leaflet = await loadLeaflet();
      if (cancelled || !mapRef.current) {
        return;
      }
      const activeRouteIds = new Set(routes.map((route) => route.id));
      Object.keys(driverMarkersRef.current).forEach((routeId) => {
        if (!activeRouteIds.has(routeId) || !driverLivePositions[routeId]) {
          driverMarkersRef.current[routeId].remove();
          delete driverMarkersRef.current[routeId];
        }
      });
      routes.forEach((route) => {
        const position = driverLivePositions[route.id];
        if (!position) {
          return;
        }
        if (driverMarkersRef.current[route.id]) {
          driverMarkersRef.current[route.id].setLatLng([position.lat, position.lng]);
        } else {
          driverMarkersRef.current[route.id] = leaflet
            .marker([position.lat, position.lng], { icon: createDriverIcon(leaflet, route.color), title: route.driver || "Entregador" })
            .addTo(map);
        }
        driverMarkersRef.current[route.id].bindPopup(
          `<div style="font-size:12.5px">${route.driver || "Entregador"} · atualizado às ${position.updatedLabel || "—"}</div>`
        );
      });
    }

    void updateDriverMarkers();

    return () => {
      cancelled = true;
    };
  }, [routes, driverLivePositions]);

  useEffect(() => {
    /** Destroy the Leaflet map when the screen unmounts. */

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      tileLayerRef.current = null;
      markersRef.current = {};
      routeLinesRef.current = {};
      driverMarkersRef.current = {};
    };
  }, []);

  if (mapError) {
    return (
      <div className="card" style={{ display: "grid", placeItems: "center", padding: 24, minHeight: 360 }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <span className="stat-icon" style={{ margin: "0 auto 14px", width: 52, height: 52 }}>
            <Icon name="pin" size={24} />
          </span>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Mapa indisponível</div>
          <div className="cell-muted">{mapError}</div>
        </div>
      </div>
    );
  }

  return <div className="card" style={{ height: 420, overflow: "hidden", padding: 0 }} ref={elementRef}></div>;
}

/* ---------- reusable stop/order row, used both for planned stops and unplanned orders ---------- */

function DeliveryStopRow({ index, color, customer, address, district, cep, dist, priority, orderStatus, lat, lng, hub, active, onMouseEnter, onMouseLeave, onOpen, onChat, bordered }) {
  const coords = hasRealCoordinates({ lat, lng }) ? { lat, lng } : null;
  const hubCoords = hasRealCoordinates(getCoordinates(hub)) ? hub : null;
  const mapsUrl = coords
    ? (hubCoords ? `https://www.google.com/maps/dir/?api=1&origin=${hubCoords.lat},${hubCoords.lng}&destination=${lat},${lng}` : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`)
    : "";
  return (
    <div
      onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={onOpen}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 10px",
        borderTop: bordered ? "1px solid var(--border)" : "none",
        cursor: onOpen ? "pointer" : "default", borderRadius: "var(--radius-md)",
        background: active ? "var(--surface-2)" : "transparent",
      }}
    >
      <span className="stat-icon" style={{ width: 30, height: 30, fontWeight: 800, fontSize: 13, flex: "none", background: color, color: color ? "#fff" : undefined }}>{index}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{customer}</span>
          {priority === "express" && <Icon name="bolt" size={13} style={{ color: "var(--critical)" }} />}
        </div>
        <div className="cell-muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{address}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
          <span className="cell-muted">{district} · {cep}</span>
          {dist != null && <><span className="cell-muted">·</span><span className="cell-muted">{dist} km</span></>}
          {orderStatus === "ready"
            ? <Badge tone="good">pronto</Badge>
            : orderStatus ? <Badge tone="warning">{orderStatusMeta(orderStatus).label.toLowerCase()}</Badge> : null}
          {!coords && <Badge tone="neutral">sem coordenada</Badge>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "none" }}>
        <a
          className="btn btn-secondary btn-sm" style={{ width: 34, height: 34, padding: 0, justifyContent: "center", opacity: coords ? 1 : 0.45, pointerEvents: coords ? "auto" : "none" }}
          href={mapsUrl} target="_blank" rel="noreferrer" title="Abrir navegação" onClick={(e) => e.stopPropagation()}
        >
          <Icon name="nav" size={15} />
        </a>
        {onChat && (
          <button className="btn btn-secondary btn-sm" style={{ width: 34, height: 34, padding: 0, justifyContent: "center" }} aria-label="conversar" onClick={(e) => { e.stopPropagation(); onChat(); }}>
            <Icon name="chat" size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- one active route card: driver, stats, its own stop list ---------- */

function RouteCard({ route, color, orders, openOrder, openChatFor, drivers, assigningRouteId, onAssignDriver, activeStopId, setActiveStopId, hub, driverLivePosition }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head" style={{ flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: color, flex: "none" }} />
          <div>
            <h3>{route.driver || "Sem entregador"}</h3>
            <div className="card-head-sub">
              {route.code} · {route.stops.length} parada{route.stops.length === 1 ? "" : "s"} · {route.totalKm.toFixed(1)} km · {route.totalMin} min
              {driverLivePosition ? ` · posição atualizada às ${driverLivePosition.updatedLabel}` : ""}
            </div>
          </div>
        </div>
        <select
          className="input" style={{ width: 200 }} value={route.driverUserId}
          disabled={assigningRouteId === route.id} onChange={(e) => onAssignDriver(route.id, e.target.value)}
        >
          <option value="">Sem entregador</option>
          {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
        </select>
      </div>
      {route.savedKm > 0.05 && (
        <div style={{ padding: "8px 18px 0", fontSize: 12, color: "var(--good)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="sparkle" size={13} />Economiza ~{route.savedKm.toFixed(1)} km vs. ordem de chegada dos pedidos.
        </div>
      )}
      <div style={{ padding: "4px 6px" }}>
        {route.stops.map((stop, index) => {
          const order = orders.find((o) => o.id === stop.orderId) || null;
          return (
            <DeliveryStopRow
              key={stop.id} index={index + 1} color={color} bordered={index > 0}
              customer={stop.customer} address={stop.address} district={stop.district} cep={stop.cep}
              dist={stop.dist} priority={order && order.priority} orderStatus={order && order.status}
              lat={stop.lat} lng={stop.lng} hub={hub}
              active={activeStopId === stop.id}
              onMouseEnter={() => setActiveStopId(stop.id)}
              onMouseLeave={() => setActiveStopId(null)}
              onOpen={() => stop.orderId && openOrder(stop.orderId)}
              onChat={order ? () => openChatFor(order) : undefined}
            />
          );
        })}
        {route.stops.length === 0 && <EmptyState icon="truck" title="Nenhuma parada nesta rota" />}
      </div>
    </div>
  );
}

function DeliveriesScreen({ ctx }) {
  /** Render the deliveries route page and actions. */

  const { orders, openOrder, openChatFor, dispatchRoute, deliveryRoutes = [], driverLivePositions = {}, assignRouteDriver, planDeliveryRoutes, fetchDeliveryDrivers } = ctx;
  const hub = ctx.hub || { name: "", addr: "", lat: null, lng: null };
  const [activeStopId, setActiveStopId] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [assigningRouteId, setAssigningRouteId] = useState("");
  const [selectedDriverIds, setSelectedDriverIds] = useState([]);
  const [planning, setPlanning] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const members = fetchDeliveryDrivers ? await fetchDeliveryDrivers() : [];
      if (alive) setDrivers(members || []);
    })();
    return () => { alive = false; };
  }, []);

  const handleAssignDriver = async (routeId, driverUserId) => {
    setAssigningRouteId(routeId);
    try {
      await assignRouteDriver(routeId, driverUserId);
    } finally {
      setAssigningRouteId("");
    }
  };

  const toggleSelectedDriver = (driverId) => {
    setSelectedDriverIds((prev) => (prev.includes(driverId) ? prev.filter((id) => id !== driverId) : [...prev, driverId]));
  };

  const handlePlanRoutes = async () => {
    setPlanning(true);
    try {
      await planDeliveryRoutes(selectedDriverIds);
      setSelectedDriverIds([]);
    } catch {
      // erro já mostrado via toast por planDeliveryRoutes
    } finally {
      setPlanning(false);
    }
  };

  const activeDeliveryOrders = orders.filter((order) => order.fulfillment === "delivery" && isActiveOrderStatus(order.status));
  const readyCount = activeDeliveryOrders.filter((order) => order.status === "ready").length;
  const plannedOrderIds = new Set(deliveryRoutes.flatMap((route) => route.stops.map((stop) => stop.orderId)));
  const unplannedOrders = activeDeliveryOrders.filter((order) => !plannedOrderIds.has(order.id));

  const coloredRoutes = deliveryRoutes.map((route, index) => ({ ...route, color: routeColor(index) }));

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Atendimento" title="Entregas & rota"
        desc={`${activeDeliveryOrders.length} entregas pendentes · ${readyCount} prontas para sair · ${deliveryRoutes.length} rota${deliveryRoutes.length === 1 ? "" : "s"} ativa${deliveryRoutes.length === 1 ? "" : "s"}`}
      />

      <div className="grid" style={{ gridTemplateColumns: "1.35fr 1fr", gap: 20, alignItems: "start" }}>
        <div>
          <RouteMap hub={hub} routes={coloredRoutes} activeStopId={activeStopId} driverLivePositions={driverLivePositions} />
          <button className="btn btn-primary" style={{ marginTop: 16, width: "100%", justifyContent: "center" }} disabled={readyCount === 0} onClick={dispatchRoute}>
            <Icon name="nav" size={18} />Despachar entregas prontas ({readyCount})
          </button>
        </div>

        <div>
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span className="stat-icon"><Icon name="route" size={18} /></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>Planejar rotas simultâneas</div>
                <div className="cell-muted">{unplannedOrders.length} pedido{unplannedOrders.length === 1 ? "" : "s"} aguardando entrar numa rota</div>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {drivers.map((driver) => (
                <button
                  key={driver.id} type="button" className="btn btn-sm"
                  style={selectedDriverIds.includes(driver.id)
                    ? { background: "var(--accent)", color: "var(--accent-contrast)", border: "1px solid var(--accent)" }
                    : { background: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border-strong)" }}
                  onClick={() => toggleSelectedDriver(driver.id)}
                >
                  <Icon name="truck" size={13} />{driver.name}
                </button>
              ))}
              {drivers.length === 0 && <span className="cell-muted">Nenhum entregador cadastrado na equipe.</span>}
            </div>
            <button
              className="btn btn-primary btn-sm" style={{ width: "100%", justifyContent: "center" }}
              disabled={planning || selectedDriverIds.length === 0 || unplannedOrders.length === 0}
              onClick={handlePlanRoutes}
            >
              <Icon name="sparkle" size={14} />
              {planning ? "Planejando..." : `Planejar ${selectedDriverIds.length > 0 ? selectedDriverIds.length + " " : ""}rota${selectedDriverIds.length === 1 ? "" : "s"}`}
            </button>
          </div>

          {unplannedOrders.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-head"><h3>Aguardando planejamento</h3></div>
              <div style={{ padding: "4px 6px" }}>
                {unplannedOrders.map((order, index) => (
                  <DeliveryStopRow
                    key={order.id} index={index + 1} color="var(--text-muted)" bordered={index > 0}
                    customer={order.customer} address={order.address} district={order.district} cep={order.cep}
                    dist={order.dist} priority={order.priority} orderStatus={order.status}
                    lat={order.lat} lng={order.lng} hub={hub}
                    active={false} onOpen={() => openOrder(order.id)} onChat={() => openChatFor(order)}
                  />
                ))}
              </div>
            </div>
          )}

          {coloredRoutes.map((route) => (
            <RouteCard
              key={route.id} route={route} color={route.color} orders={orders} openOrder={openOrder} openChatFor={openChatFor}
              drivers={drivers} assigningRouteId={assigningRouteId} onAssignDriver={handleAssignDriver}
              activeStopId={activeStopId} setActiveStopId={setActiveStopId} hub={hub} driverLivePosition={driverLivePositions[route.id]}
            />
          ))}

          {coloredRoutes.length === 0 && unplannedOrders.length === 0 && (
            <div className="card"><EmptyState icon="truck" title="Nenhuma entrega pendente" /></div>
          )}
        </div>
      </div>
    </div>
  );
}

export { DeliveriesScreen, RouteMap };
