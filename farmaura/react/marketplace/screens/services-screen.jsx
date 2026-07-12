import React from "react";
import { AuraLayer, brl } from "../core/marketplace-components.jsx";
import { Icon } from "../core/marketplace-icons.jsx";

/* FARMAURA — Serviços de saúde: public page (outside "Minha conta"). */

const hsPriceP = (price) => price === 0 ? 'Gratuito' : brl(price);

function ServicesScreen({ ctx }) {
  const { healthServices, user, onNav, openChat } = ctx;
  const groups = healthServices.reduce((map, service) => {
    (map[service.group] = map[service.group] || []).push(service);
    return map;
  }, {});
  const schedule = () => onNav(user ? { name: 'account', tab: 'health' } : { name: 'login' });
  const highlights = [
    ['shield', 'Profissionais habilitados', 'Farmacêuticos treinados e ambiente preparado.'],
    ['clock', 'Sem espera', 'Agende online e seja atendida na hora marcada.'],
    ['pin', 'Pertinho de você', 'Disponível nas lojas Farmaura da sua região.'],
  ];

  return (
    <div className="fa-wrap fa-fadein" style={{ paddingTop: 28, paddingBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--fa-ink-3)', marginBottom: 16 }}>
        <a role="button" onClick={() => onNav({ name: 'home' })}>Início</a><Icon name="chevR" size={13} /><span style={{ color: 'var(--fa-ink-2)', fontWeight: 600 }}>Serviços de saúde</span>
      </div>
      <section className="fa-card" style={{ position: 'relative', overflow: 'hidden', background: 'var(--fa-primary)', color: '#fff', border: 'none', padding: 'clamp(28px,4vw,48px)', marginBottom: 28 }}>
        <AuraLayer tone="#fff" />
        <div style={{ position: 'relative', maxWidth: 620 }}>
          <span className="fa-eyebrow" style={{ color: '#fff', opacity: .85 }}>Cuidado ampliado</span>
          <h1 className="fa-h1" style={{ color: '#fff', marginTop: 10 }}>Serviços de saúde na sua farmácia</h1>
          <p className="fa-lead" style={{ marginTop: 14, color: '#fff', opacity: .92 }}>Vacinas, aplicações, testes rápidos e aferições com farmacêuticos habilitados — sem fila e pertinho de você.</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 22, flexWrap: 'wrap' }}>
            <button className="fa-btn fa-btn-vital fa-btn-lg" onClick={schedule}><Icon name="calendar" size={18} />Agendar um serviço</button>
            <button className="fa-btn fa-btn-lg" style={{ background: 'rgba(255,255,255,.16)', color: '#fff' }} onClick={() => openChat && openChat()}><Icon name="chat" size={18} />Falar com farmacêutico</button>
          </div>
        </div>
      </section>
      <div className="fa-grid" style={{ '--fa-grid-min': '260px', marginBottom: 32 }}>
        {highlights.map(([iconName, title, description]) => (
          <div key={title} className="fa-card" style={{ padding: 20, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <span className="fa-iconbox" style={{ width: 46, height: 46 }}><Icon name={iconName} size={22} /></span>
            <div><div style={{ fontWeight: 800, fontSize: 15 }}>{title}</div><p className="fa-muted" style={{ fontSize: 13, lineHeight: 1.45, marginTop: 4 }}>{description}</p></div>
          </div>
        ))}
      </div>
      {Object.keys(groups).map((group) => (
        <div key={group} style={{ marginBottom: 28 }}>
          <h2 className="fa-h3" style={{ fontSize: 20, marginBottom: 14 }}>{group}</h2>
          <div className="fa-grid" style={{ '--fa-grid-min': '320px' }}>
            {groups[group].map((service) => (
              <div key={service.id} className="fa-hs">
                <span className="fa-iconbox" style={{ width: 46, height: 46 }}><Icon name={service.icon} size={22} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14.5, lineHeight: 1.3 }}>{service.name}</div>
                  <p className="fa-muted" style={{ fontSize: 12.5, lineHeight: 1.45, margin: '5px 0 10px' }}>{service.desc}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span className="fa-faint" style={{ fontSize: 12.5, display: 'inline-flex', gap: 5, alignItems: 'center' }}><Icon name="clock" size={14} />{service.dur}</span>
                    <span style={{ fontWeight: 800, fontSize: 14, color: service.price === 0 ? 'var(--fa-success)' : 'var(--fa-ink)' }}>{hsPriceP(service.price)}</span>
                    <button className="fa-btn fa-btn-primary fa-btn-sm" style={{ marginLeft: 'auto' }} onClick={schedule}><Icon name="calendar" size={15} />Agendar</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <section className="fa-card fa-svc-cta" style={{ marginTop: 8, padding: 'clamp(24px,3vw,40px)', display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'center', background: 'var(--fa-rose-soft)', border: 'none' }}>
        <div>
          <h2 className="fa-h3" style={{ fontSize: 20, color: 'var(--fa-primary)' }}>Pronta para cuidar da sua saúde?</h2>
          <p className="fa-muted" style={{ fontSize: 14, marginTop: 6 }}>Agende em poucos toques e seja atendida por um farmacêutico.</p>
        </div>
        <button className="fa-btn fa-btn-primary fa-btn-lg" onClick={schedule}>Agendar agora<Icon name="arrowR" size={18} /></button>
      </section>
    </div>
  );
}

export { ServicesScreen, hsPriceP };
