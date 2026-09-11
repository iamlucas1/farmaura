import React, { useState } from "react";
import { Icon, PageHead, EmptyState } from "../core/internal-ui.jsx";

/* FARMAURA Console — Minhas entregas: rota do entregador autenticado. */

function DriverSectionCard({ icon, title, sub, children }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px", borderBottom: "1px solid var(--border)" }}>
        <span className="stat-icon"><Icon name={icon} size={19} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14.5 }}>{title}</div>
          {sub && <div className="cell-muted">{sub}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function DriverStopRow({ stop, onDeliver, busy }) {
  const delivered = stop.status === "delivered";
  const mapsUrl = stop.navigationUrl || (stop.lat != null && stop.lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`
    : "");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", opacity: delivered ? 0.6 : 1 }}>
      <span className="stat-icon" style={{ width: 30, height: 30, flex: "none" }}>{delivered ? <Icon name="check" size={14} /> : <Icon name="pin" size={14} />}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{stop.customer || "Cliente"}</div>
        <div className="cell-muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{stop.address}</div>
        <div className="cell-muted">{stop.district} · {stop.cep}{stop.orderCode ? " · " + stop.orderCode : ""}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "none" }}>
        {mapsUrl && (
          <a className="btn btn-secondary btn-sm" style={{ width: 34, height: 34, padding: 0, justifyContent: "center" }} href={mapsUrl} target="_blank" rel="noreferrer" title="Abrir navegação">
            <Icon name="nav" size={15} />
          </a>
        )}
        {!delivered && (
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onDeliver(stop.id)}>
            <Icon name="check" size={14} />Entregue
          </button>
        )}
      </div>
    </div>
  );
}

function DriverRouteScreen({ ctx }) {
  const { myDeliveryRoutes = [], deliverRouteStop, locationSharing, toggleLocationSharing } = ctx;
  const [busyStopId, setBusyStopId] = useState("");

  const handleDeliver = async (stopId) => {
    setBusyStopId(stopId);
    try {
      await deliverRouteStop(stopId);
    } finally {
      setBusyStopId("");
    }
  };

  const pendingStops = myDeliveryRoutes.flatMap((route) => route.stops.filter((stop) => stop.status !== "delivered"));

  return (
    <div className="route-fade">
      <PageHead eyebrow="Atendimento" title="Minhas entregas" desc={`${pendingStops.length} parada(s) pendente(s)`} />

      <DriverSectionCard icon="pin" title="Compartilhamento de localização" sub="Ative para que a farmácia acompanhe sua posição em tempo real durante a rota">
        <div style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <button className={locationSharing ? "btn btn-primary" : "btn btn-secondary"} onClick={toggleLocationSharing}>
            <Icon name={locationSharing ? "check" : "pin"} size={16} />
            {locationSharing ? "Compartilhando localização" : "Compartilhar minha localização"}
          </button>
          {locationSharing && <span className="cell-muted">Atualizando automaticamente enquanto esta tela estiver aberta.</span>}
        </div>
      </DriverSectionCard>

      {myDeliveryRoutes.length === 0 && (
        <DriverSectionCard icon="route" title="Nenhuma rota atribuída" sub="Assim que a farmácia atribuir uma rota a você, ela aparecerá aqui">
          <div style={{ padding: 16 }} className="cell-muted">Aguardando atribuição de rota.</div>
        </DriverSectionCard>
      )}

      {myDeliveryRoutes.map((route) => (
        <DriverSectionCard key={route.id} icon="truck" title={`Rota ${route.code}`} sub={route.hubName ? `Saída de ${route.hubName}` : ""}>
          <div>
            {route.stops.map((stop) => (
              <DriverStopRow key={stop.id} stop={stop} onDeliver={handleDeliver} busy={busyStopId === stop.id} />
            ))}
            {route.stops.length === 0 && <EmptyState icon="route" title="Nenhuma parada nesta rota" />}
          </div>
        </DriverSectionCard>
      ))}
    </div>
  );
}

export { DriverRouteScreen };
