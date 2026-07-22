import React, { useState } from "react";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { AnCard } from "./analytics-screen.jsx";
import { Topbar } from "../core/internal-shell.jsx";

/* FARMAURA Console — Minhas entregas: rota do entregador autenticado. */

function DriverStopRow({ stop, onDeliver, busy }) {
  const delivered = stop.status === 'delivered';
  const mapsUrl = stop.navigationUrl || (stop.lat != null && stop.lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`
    : '');
  return (
    <div className="ph-routestep" style={{ opacity: delivered ? 0.6 : 1 }}>
      <span className="ph-routenum">{delivered ? <Icon name="check" size={14} /> : <Icon name="pin" size={14} />}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{stop.customer || 'Cliente'}</div>
        <div className="ph-cell-sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stop.address}</div>
        <div className="ph-cell-sub">{stop.district} · {stop.cep}{stop.orderCode ? ' · ' + stop.orderCode : ''}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
        {mapsUrl && (
          <a className="fa-iconbtn" style={{ width: 34, height: 34 }} href={mapsUrl} target="_blank" rel="noreferrer" title="Abrir navegação">
            <Icon name="nav" size={15} />
          </a>
        )}
        {!delivered && (
          <button className="fa-btn fa-btn-primary fa-btn-sm" disabled={busy} onClick={() => onDeliver(stop.id)}>
            <Icon name="check" size={14} />Entregue
          </button>
        )}
      </div>
    </div>
  );
}

function DriverRouteScreen({ ctx }) {
  const { myDeliveryRoutes = [], deliverRouteStop, locationSharing, toggleLocationSharing, onLogout } = ctx;
  const [busyStopId, setBusyStopId] = useState('');

  const handleDeliver = async (stopId) => {
    setBusyStopId(stopId);
    try {
      await deliverRouteStop(stopId);
    } finally {
      setBusyStopId('');
    }
  };

  const pendingStops = myDeliveryRoutes.flatMap((route) => route.stops.filter((stop) => stop.status !== 'delivered'));

  return (
    <>
      <Topbar title="Minhas entregas" sub={`${pendingStops.length} parada(s) pendente(s)`} onLogout={onLogout} ctx={ctx} />
      <div className="ph-content">
        <AnCard icon="pin" title="Compartilhamento de localização" sub="Ative para que a farmácia acompanhe sua posição em tempo real durante a rota">
          <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className={locationSharing ? 'fa-btn fa-btn-primary' : 'fa-btn fa-btn-soft'}
              onClick={toggleLocationSharing}
            >
              <Icon name={locationSharing ? 'check' : 'pin'} size={16} />
              {locationSharing ? 'Compartilhando localização' : 'Compartilhar minha localização'}
            </button>
            {locationSharing && <span className="ph-cell-sub">Atualizando automaticamente enquanto esta tela estiver aberta.</span>}
          </div>
        </AnCard>

        {myDeliveryRoutes.length === 0 && (
          <AnCard icon="route" title="Nenhuma rota atribuída" sub="Assim que a farmácia atribuir uma rota a você, ela aparecerá aqui">
            <div style={{ padding: 16 }} className="ph-cell-sub">Aguardando atribuição de rota.</div>
          </AnCard>
        )}

        {myDeliveryRoutes.map((route) => (
          <AnCard key={route.id} icon="truck" title={`Rota ${route.code}`} sub={route.hubName ? `Saída de ${route.hubName}` : ''}>
            <div style={{ padding: '4px 16px' }}>
              {route.stops.map((stop) => (
                <DriverStopRow key={stop.id} stop={stop} onDeliver={handleDeliver} busy={busyStopId === stop.id} />
              ))}
              {route.stops.length === 0 && <div className="ph-cell-sub" style={{ padding: '16px 0' }}>Nenhuma parada nesta rota.</div>}
            </div>
          </AnCard>
        ))}
      </div>
    </>
  );
}

export { DriverRouteScreen };
