import React from "react";
import { Icon } from "../core/marketplace-icons.jsx";
import { CategoryRail, buildRailItems, categoryAccent } from "./shop-screen.jsx";

/* FARMAURA — Serviços de saúde: public page (outside "Minha conta"). Structure copied verbatim
   from the reference demo's `data-cat="servicos"` panel — crumb + two-tone masthead + the same
   category rail every catalog page shares, a single-column intro paragraph, a flat grid of
   `.cat-service` cards (no grouping, no price/duration — those surface at the real booking step
   in account-health-screen.jsx instead), and a closing "Falar com a equipe" chat button. */

function ServicesScreen({ ctx }) {
  const { cats, healthServices, user, onNav, openChat } = ctx;
  const schedule = () => onNav(user ? { name: 'account', tab: 'health' } : { name: 'login' });

  const railItems = buildRailItems(cats);
  const activeId = '__services__';
  const activeIndex = Math.max(0, railItems.findIndex((item) => item.id === activeId));
  const acc = categoryAccent(activeIndex, 'Serviços de saúde');

  return (
    <div className="fa-fadein">
      <div className="fa-wrap">
        <div className="fa-cat-crumb">
          <a role="button" onClick={() => onNav({ name: 'home' })}>Início</a>
          <Icon name="chevR" size={13} />
          <span className="fa-cat-crumb-current">Serviços de saúde</span>
        </div>
        <div className="fa-cat-masthead" style={{ '--acc': acc }}>
          <h1 className="fa-cat-title"><span className="fa-cat-title-mark">S</span><span className="fa-cat-title-rest">erviços de saúde</span></h1>
        </div>
        <CategoryRail items={railItems} activeId={activeId} onNav={onNav} />
        <p className="fa-cat-services-intro">Esses serviços acontecem presencialmente, na loja física da Drogaria Farmaura. Toque em um serviço para agendar, ou fale com a nossa equipe para tirar dúvidas.</p>
        {healthServices.length === 0 ? (
          <div className="fa-card" style={{ padding: 48, textAlign: 'center', marginBottom: 32 }}>
            <span className="fa-iconbox" style={{ margin: '0 auto 12px', width: 56, height: 56 }}><Icon name="activity" size={26} /></span>
            <div className="fa-h3">Nenhum serviço disponível ainda</div>
            <p className="fa-muted" style={{ marginTop: 6 }}>Volte em breve — estamos preparando nossos serviços de saúde.</p>
          </div>
        ) : (
          <div className="fa-cat-services-grid" style={{ marginBottom: 24 }}>
            {healthServices.map((service, index) => (
              <button key={service.id} type="button" className="fa-cat-service" style={{ '--acc': categoryAccent(index, '') }} onClick={schedule}>
                <span className="fa-cat-service-icon"><Icon name={service.icon} size={20} /></span>
                <div className="fa-cat-service-name">{service.name}</div>
                <p className="fa-cat-service-desc">{service.desc}</p>
                <span className="fa-cat-service-cta">Agendar<Icon name="chevR" size={13} stroke={2.4} /></span>
              </button>
            ))}
          </div>
        )}
        <button className="fa-btn fa-btn-primary" style={{ marginBottom: 40 }} onClick={() => openChat && openChat()}><Icon name="chat" size={18} />Falar com a equipe</button>
      </div>
    </div>
  );
}

export { ServicesScreen };
