import React from "react";
import { AuraLayer } from "../core/marketplace-components.jsx";
import { Icon } from "../core/marketplace-icons.jsx";

/* FARMAURA — Cuidado hub (pharmacist chat, receita digital, assinatura, programa). */

function CareScreen({ ctx }) {
  const { onNav, openChat, openPrescription } = ctx;
  const services = [
    { icon: 'chat', t: 'Atendimento farmacêutico', d: 'Converse com um farmacêutico de verdade, 24h por dia, sobre dúvidas de uso, interações e sintomas.', cta: 'Abrir chat', tone: 'var(--fa-primary)', act: () => openChat() },
    { icon: 'rx', t: 'Receita digital', d: 'Envie a foto ou PDF da sua receita. Validamos e organizamos seus medicamentos de uso contínuo.', cta: 'Enviar receita', tone: 'var(--fa-info)', act: () => openPrescription() },
    { icon: 'repeat', t: 'Assinatura Farmaura', d: '15% off, reposição automática e lembretes de dose. Pausa e cancelamento quando quiser.', cta: 'Gerenciar assinaturas', tone: 'var(--fa-success)', act: () => onNav({ name: 'subscriptions' }) },
    { icon: 'heart', t: 'Programa de cuidado', d: 'Acompanhamento personalizado, aferição de pressão e glicemia e serviços de saúde na loja.', cta: 'Ver serviços de saúde', tone: 'var(--fa-vital)', act: () => onNav({ name: 'services' }) },
  ];

  return (
    <div className="fa-wrap fa-fadein" style={{ paddingTop: 28, paddingBottom: 20 }}>
      <section className="fa-card" style={{ position: 'relative', overflow: 'hidden', background: 'var(--fa-rose-soft)', border: 'none', padding: 'clamp(28px,4vw,48px)', marginBottom: 32 }}>
        <AuraLayer tone="var(--fa-primary)" />
        <div style={{ position: 'relative', maxWidth: 560 }}>
          <span className="fa-eyebrow">Cuidado ampliado</span>
          <h1 className="fa-h1" style={{ color: 'var(--fa-primary)', marginTop: 10 }}>Mais que uma farmácia, uma aura de cuidado</h1>
          <p className="fa-lead" style={{ marginTop: 14, color: 'var(--fa-primary-ink)' }}>Tecnologia e gente que cuida, juntas. Conheça os serviços que acompanham você muito além da compra.</p>
        </div>
      </section>
      <div className="fa-grid" style={{ '--fa-grid-min': '300px' }}>
        {services.map((service) => (
          <div key={service.t} className="fa-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span className="fa-iconbox" style={{ width: 52, height: 52, background: 'var(--fa-rose-soft)', color: service.tone }}><Icon name={service.icon} size={26} /></span>
            <div className="fa-h3" style={{ fontSize: 19 }}>{service.t}</div>
            <p className="fa-muted" style={{ fontSize: 14, lineHeight: 1.55, flex: 1 }}>{service.d}</p>
            <button className="fa-btn fa-btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={service.act}>{service.cta}<Icon name="arrowR" size={16} /></button>
          </div>
        ))}
      </div>
      <section className="fa-card fa-care-cta" style={{ marginTop: 32, padding: 'clamp(24px,3vw,40px)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'center', background: 'var(--fa-primary)', color: '#fff', border: 'none' }}>
        <div>
          <h2 className="fa-h2" style={{ color: '#fff' }}>Comece pelas ofertas e monte seu cuidado</h2>
          <p style={{ opacity: .9, marginTop: 10, fontSize: 15 }}>Produtos selecionados, entrega rápida e farmacêutico por perto.</p>
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="fa-btn fa-btn-vital fa-btn-lg" onClick={() => onNav({ name: 'offers' })}>Ver ofertas</button>
          <button className="fa-btn fa-btn-lg" style={{ background: 'rgba(255,255,255,.16)', color: '#fff' }} onClick={() => onNav({ name: 'home' })}>Explorar loja</button>
        </div>
      </section>
    </div>
  );
}

export { CareScreen };
