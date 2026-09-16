/* FARMAURA — Legal: Termos de Uso + Política de Privacidade, mesmo shell de leitura. */
import React from "react";
import { Icon } from "../core/marketplace-icons.jsx";
import { resolveMarketplaceMeta, resolveStoreMeta } from "../core/marketplace-chrome.jsx";

const SUPPORT_WHATSAPP_URL = 'https://wa.me/5561996032094';

// Bloco de identificação da empresa: lê os mesmos campos reais que o rodapé já usa
// (portalData.marketplace / portalData.stores, configuráveis no console interno). Quando ainda
// não preenchidos (pré-lançamento), mostra um aviso honesto em vez de inventar CNPJ/endereço.
function LegalEntityBlock({ ctx }) {
  const meta = resolveMarketplaceMeta({ marketplace: ctx.paymentRules });
  const store = resolveStoreMeta({ stores: ctx.stores });
  const lines = [
    meta.cnpj && `CNPJ ${meta.cnpj}`,
    meta.stateRegistration && `IE ${meta.stateRegistration}`,
    store.address,
  ].filter(Boolean);
  return (
    <div className="fa-card fa-legal-entity">
      <span className="fa-legal-entity-bar" aria-hidden="true" />
      <span className="fa-iconbox" style={{ flex: 'none' }}><Icon name="pin" size={20} /></span>
      <div>
        <div className="fa-legal-entity-name">{meta.legalName || 'Farmaura'}</div>
        {lines.length
          ? <div className="fa-legal-entity-lines">{lines.join(' · ')}</div>
          : <div className="fa-legal-entity-lines fa-muted" style={{ margin: 0 }}>Dados cadastrais (CNPJ, inscrição estadual, endereço) aparecem aqui assim que configurados no portal — ainda não preenchidos nesta pré-operação.</div>}
      </div>
    </div>
  );
}

function LegalBody({ body }) {
  return body.map((block, i) => (
    typeof block === 'string'
      ? <p key={i}>{block}</p>
      : <ul key={i}>{block.list.map((item, j) => <li key={j}>{item}</li>)}</ul>
  ));
}

// Vitral: mesmo halo de dois tons da tela de login (--fa-aura), cartão de conteúdo em vidro
// fosco, e cada seção marcada por uma barra lateral colorida em vez de ícone — rosé, vermelho e
// bege revezando em ciclos de 3, como vitrais de farmácia antiga.
const VITRAL_BARS = ['var(--fa-rose)', 'var(--fa-primary)', 'var(--fa-beige)'];

function LegalDocShell({ ctx, eyebrow, title, updated, intro, sections, relatedLinks }) {
  return (
    <div className="fa-wrap fa-fadein fa-legal-vitral" style={{ paddingTop: 40, paddingBottom: 72, maxWidth: 1080 }}>
      <div className="fa-legal-vitral-bg" aria-hidden="true" />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="fa-legal-hero">
          <span className="fa-legal-kicker"><Icon name="shield" size={13} />{eyebrow}</span>
          <h1 className="fa-legal-title">{title}</h1>
          <span className="fa-legal-updated"><Icon name="clock" size={13} />Última atualização: {updated}</span>

          <LegalEntityBlock ctx={ctx} />

          <p className="fa-legal-intro">{intro}</p>
        </div>

        <div className="fa-legal-single">
          <div className="fa-legal-content fa-legal-glass">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="fa-legal-section">
                <span className="fa-legal-bar" style={{ background: VITRAL_BARS[i % 3] }} aria-hidden="true" />
                <div className="fa-legal-section-body">
                  <h2 className="fa-h3">{s.title}</h2>
                  <LegalBody body={s.body} />
                </div>
              </section>
            ))}

            <div className="fa-card fa-legal-contact">
              <h3 className="fa-h3" style={{ marginBottom: 6 }}>Ainda com dúvidas?</h3>
              <p className="fa-muted" style={{ marginBottom: 16 }}>Fale com a nossa equipe pelos canais reais de atendimento do app — inclusive para exercer os direitos descritos aqui (acesso, correção ou exclusão dos seus dados).</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <a className="fa-btn fa-btn-primary" href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={16} />Falar no WhatsApp</a>
                {relatedLinks.map((link) => (
                  <button key={link.label} type="button" className="fa-btn fa-btn-soft" onClick={() => ctx.onNav(link.route)}><Icon name={link.icon} size={16} />{link.label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const TERMS_SECTIONS = [
  {
    id: 'sobre', title: 'Sobre estes Termos', icon: 'info',
    body: [
      'Estes Termos de Uso regulam o acesso e o uso do marketplace Farmaura (site e futuros aplicativos) por qualquer pessoa que navegue, se cadastre ou faça pedidos — chamada aqui de "você" ou "cliente". A empresa responsável está identificada no topo desta página.',
      'Ao criar uma conta, fazer login ou finalizar um pedido, você confirma que leu e concorda com estes Termos e com a nossa Política de Privacidade. Se não concordar com algum ponto, pedimos que não utilize o marketplace.',
    ],
  },
  {
    id: 'quem-pode-usar', title: 'Quem pode usar a Farmaura', icon: 'user',
    body: [
      'O cadastro é destinado a pessoas maiores de 18 anos, capazes de contratar segundo a legislação brasileira. Cadastros feitos por ou para menores de idade devem ser conduzidos por um responsável legal, que assume integralmente as informações fornecidas.',
      'Você é responsável por manter seus dados de cadastro verdadeiros, completos e atualizados — inclusive endereço de entrega e telefone, usados para confirmar pedidos e comunicar problemas.',
    ],
  },
  {
    id: 'sua-conta', title: 'Sua conta e sua senha', icon: 'lock',
    body: [
      'Sua conta é pessoal e intransferível. A senha deve seguir nossa política de senha forte (mínimo de 8 caracteres, com letra maiúscula, minúscula, número e caractere especial) e não deve ser compartilhada com terceiros.',
      'Oferecemos verificação em duas etapas (2FA) opcional para reforçar a segurança da sua conta. Após várias tentativas de login com senha incorreta, bloqueamos o acesso por segurança e enviamos um link de desbloqueio para o seu e-mail cadastrado.',
      'Você é responsável por qualquer atividade realizada com a sua conta. Se suspeitar de acesso não autorizado, troque sua senha imediatamente e entre em contato com a gente.',
    ],
  },
  {
    id: 'pedidos-pagamento', title: 'Pedidos e formas de pagamento', icon: 'card',
    body: [
      'Os preços, a disponibilidade e as condições de parcelamento exibidos no marketplace podem mudar sem aviso prévio até a confirmação do pedido; depois de pago, o valor do pedido não muda.',
      'Aceitamos pagamento via Pix e cartão de crédito ou débito, processados pelo Asaas, nosso parceiro de pagamentos. Os dados completos do seu cartão (número e código de segurança) nunca são armazenados pela Farmaura — ficam em memória só durante a chamada de tokenização ao Asaas.',
      'Um pedido é considerado confirmado quando o pagamento é aprovado pelo Asaas. Pedidos com pagamento recusado ou não identificado não são processados.',
    ],
  },
  {
    id: 'receitas', title: 'Medicamentos sob prescrição', icon: 'rx',
    body: [
      'Para itens que exigem receita médica, é necessário enviar uma foto ou arquivo legível da prescrição no momento do pedido. Um farmacêutico da nossa equipe valida a receita antes da liberação do pagamento — pedidos com receita pendente, ilegível ou reprovada não são processados.',
      'Você é responsável pela autenticidade da receita enviada. O uso de receitas falsas, adulteradas ou de terceiros é proibido e pode ser reportado às autoridades competentes.',
    ],
  },
  {
    id: 'entrega', title: 'Entrega e retirada', icon: 'truck',
    body: [
      'O prazo e o valor da entrega são calculados com base na distância real entre a loja e o endereço informado. Você também pode optar por retirar o pedido diretamente na loja, dentro do prazo indicado na confirmação.',
      'Prazos de entrega são estimativas e podem variar por fatores fora do nosso controle (trânsito, clima, disponibilidade de entregador). Avisaremos sempre que houver atraso relevante.',
    ],
  },
  {
    id: 'cashback-assinaturas', title: 'Cashback e assinaturas', icon: 'gift',
    body: [
      'O programa de cashback credita um percentual do valor de compras elegíveis como saldo, utilizável em pedidos futuros dentro do limite exibido no checkout. Percentuais e regras do programa podem ser ajustados a qualquer momento, sem efeito retroativo sobre saldo já creditado.',
      'Assinaturas (compra recorrente) repetem automaticamente um pedido na frequência escolhida por você, que pode pausar, pular a próxima entrega ou cancelar a qualquer momento antes do próximo ciclo de cobrança.',
    ],
  },
  {
    id: 'cancelamento', title: 'Cancelamento, troca e arrependimento', icon: 'repeat',
    body: [
      'Como em qualquer compra online no Brasil, você tem até 7 dias corridos após o recebimento para desistir da compra sem motivo, conforme o Código de Defesa do Consumidor (direito de arrependimento).',
      'Esse direito tem exceções previstas em regulação sanitária para determinados medicamentos e produtos de saúde já abertos ou dispensados — nesses casos, a troca segue as regras específicas de cada categoria, informadas no atendimento.',
      'Produtos com defeito ou divergentes do pedido podem ser trocados ou reembolsados fora desse prazo, mediante contato com nossa equipe.',
    ],
  },
  {
    id: 'nota-fiscal', title: 'Nota fiscal', icon: 'receipt',
    body: [
      'A nota fiscal de cada pedido é emitida pelo Asaas em nosso nome, em até 7 dias após a confirmação do pagamento, e fica disponível na área "Meus pedidos" da sua conta.',
    ],
  },
  {
    id: 'conduta', title: 'Conduta esperada', icon: 'shield',
    body: [
      { list: [
        'Não usar o marketplace para fins ilícitos ou fraudulentos.',
        'Não tentar acessar contas de outras pessoas ou contornar mecanismos de segurança.',
        'Não enviar receitas médicas falsas, adulteradas ou de terceiros.',
        'Não automatizar acessos (bots, scraping) sem autorização prévia por escrito.',
      ] },
      'O descumprimento destas regras pode levar à suspensão ou ao encerramento da sua conta, sem prejuízo de outras medidas cabíveis.',
    ],
  },
  {
    id: 'propriedade', title: 'Propriedade intelectual', icon: 'star',
    body: [
      'A marca Farmaura, seu logotipo, layout, textos e demais elementos visuais do marketplace são protegidos por direitos de propriedade intelectual e não podem ser copiados ou reutilizados sem autorização.',
    ],
  },
  {
    id: 'responsabilidade', title: 'Limitação de responsabilidade', icon: 'info',
    body: [
      'Fazemos o possível para manter o catálogo, os preços e os prazos exibidos corretos e atualizados, mas não garantimos disponibilidade ininterrupta do serviço nem a ausência total de erros — falhas técnicas (nossas ou de parceiros como o Asaas e serviços de geolocalização) podem afetar pedidos pontualmente, e trabalhamos para resolver esses casos o quanto antes.',
    ],
  },
  {
    id: 'alteracoes', title: 'Alterações destes Termos', icon: 'edit',
    body: [
      'Podemos atualizar estes Termos para refletir mudanças no serviço ou na legislação. A data no topo desta página indica a versão vigente; mudanças relevantes serão comunicadas por e-mail ou aviso no marketplace.',
    ],
  },
  {
    id: 'contato', title: 'Contato', icon: 'mail',
    body: [
      'Dúvidas sobre estes Termos podem ser enviadas pelos canais de atendimento reais do app, indicados no fim desta página.',
    ],
  },
];

const PRIVACY_SECTIONS = [
  {
    id: 'quem-somos', title: 'Quem somos', icon: 'info',
    body: [
      'Esta Política de Privacidade explica quais dados pessoais a Farmaura coleta de quem usa o marketplace, para quê, com quem eventualmente compartilha e quais direitos você tem sobre eles, em conformidade com a Lei Geral de Proteção de Dados (LGPD). A empresa responsável pelo tratamento (controladora) está identificada no topo desta página.',
    ],
  },
  {
    id: 'dados-coletados', title: 'Quais dados coletamos', icon: 'user',
    body: [
      { list: [
        'Cadastro: nome, e-mail, telefone e senha (armazenada de forma criptografada, nunca em texto simples).',
        'Endereço: para calcular frete e realizar entregas.',
        'Pedido e pagamento: itens comprados, valor, status de pagamento processado pelo Asaas — nunca o número completo ou o código de segurança do seu cartão.',
        'Receitas médicas: quando você envia uma foto ou arquivo de prescrição para itens que exigem receita.',
        'Perfil pessoal (opcional): gênero, estado civil, número de filhos, seus nomes e idades — usados só para sugerir promoções e produtos mais relevantes para você e sua família.',
        'Uso do marketplace: páginas visitadas e eventos de navegação, coletados de forma agregada pelo Google Analytics.',
        'Preferências de comunicação: os canais e assuntos que você optou por receber, configuráveis na sua conta.',
      ] },
    ],
  },
  {
    id: 'por-que', title: 'Por que tratamos seus dados', icon: 'check',
    body: [
      'Tratamos seus dados com base em uma ou mais destas hipóteses legais, dependendo da finalidade: execução do contrato de compra e venda (processar e entregar seu pedido), cumprimento de obrigação legal ou regulatória (emissão de nota fiscal, dispensação de medicamentos controlados), consentimento (comunicações de marketing e personalização de ofertas com base no seu perfil pessoal e familiar — gênero, estado civil, filhos —, revogável a qualquer momento apagando esses campos do seu perfil) e legítimo interesse (segurança da conta, prevenção a fraude).',
    ],
  },
  {
    id: 'receitas-saude', title: 'Receitas e dados de saúde', icon: 'rx',
    body: [
      'Dados de saúde, incluindo o conteúdo das receitas médicas que você envia, são considerados dados pessoais sensíveis pela LGPD e recebem tratamento restrito: usados apenas para validar a dispensação do medicamento por um farmacêutico responsável, nunca para fins de marketing ou perfilamento comercial.',
    ],
  },
  {
    id: 'pagamento', title: 'Pagamento', icon: 'card',
    body: [
      'O processamento de Pix e cartão é feito pelo Asaas, nosso parceiro de pagamentos. O número completo e o código de segurança do seu cartão trafegam direto para o Asaas no momento da tokenização e não ficam armazenados nos nossos servidores — guardamos apenas um token seguro para cobranças futuras que você autorizar.',
    ],
  },
  {
    id: 'compartilhamento', title: 'Com quem compartilhamos', icon: 'shield',
    body: [
      'Compartilhamos dados pessoais apenas com prestadores estritamente necessários para operar o marketplace, cada um tratando os dados só para a finalidade abaixo:',
      { list: [
        'Asaas — processamento de pagamento (Pix, cartão) e emissão de nota fiscal.',
        'Serviço de geocodificação (Nominatim/OpenStreetMap) — converte o endereço de entrega em coordenadas para calcular distância e frete; recebe apenas o endereço, sem outros dados de cadastro.',
        'Google Analytics — estatísticas agregadas de navegação no marketplace.',
        'Transportadora, quando a entrega não é feita por entregador próprio.',
      ] },
      'Não vendemos dados pessoais a terceiros.',
    ],
  },
  {
    id: 'cookies', title: 'Cookies e analytics', icon: 'info',
    body: [
      'Usamos o Google Analytics (GA4) para entender, de forma agregada, como o marketplace é usado — não para identificar você individualmente. Hoje essa medição roda por padrão, sem uma central de preferências de cookies self-service dentro do site; se você preferir não ser incluído nessa medição, pode nos avisar pelos canais de contato ao fim desta página.',
    ],
  },
  {
    id: 'seguranca', title: 'Segurança', icon: 'lock',
    body: [
      'Senhas são armazenadas de forma criptografada. Oferecemos verificação em duas etapas (2FA) opcional, bloqueamos o acesso após várias tentativas de login incorretas e usamos conexão criptografada (HTTPS) em todo o marketplace. Nenhum sistema é 100% imune a incidentes; se algo relevante acontecer com seus dados, você será avisado conforme exige a LGPD.',
    ],
  },
  {
    id: 'retencao', title: 'Por quanto tempo guardamos seus dados', icon: 'clock',
    body: [
      'Mantemos seus dados de cadastro enquanto sua conta estiver ativa. Dados de pedidos e documentos fiscais são mantidos pelo prazo exigido pela legislação fiscal e de defesa do consumidor, mesmo após o encerramento da conta. Ao solicitar a exclusão da conta, removemos ou anonimizamos os demais dados que não precisem ser retidos por obrigação legal.',
      'Os prazos exatos por tipo de dado, e o passo a passo para pedir a exclusão da sua conta, estão detalhados na nossa Política de Exclusão e Retenção de Dados.',
    ],
  },
  {
    id: 'seus-direitos', title: 'Seus direitos', icon: 'star',
    body: [
      'Como titular dos dados, você pode a qualquer momento solicitar: confirmação de que tratamos seus dados, acesso aos dados que temos sobre você, correção de dados incompletos ou desatualizados, portabilidade, eliminação dos dados tratados com base no seu consentimento e revogação desse consentimento.',
      'Hoje esses pedidos são atendidos manualmente pela nossa equipe — ainda não há um botão de autoatendimento no site para exportar ou apagar a conta. Para exercer qualquer um desses direitos, fale com a gente pelos canais reais de atendimento ao fim desta página.',
    ],
  },
  {
    id: 'preferencias', title: 'Preferências de comunicação', icon: 'mail',
    body: [
      'Em "Minha conta → Configurações", você controla por quais canais (e-mail, WhatsApp) e para quais assuntos aceita ser contatado — essas escolhas ficam salvas e valem imediatamente.',
    ],
  },
  {
    id: 'alteracoes-privacidade', title: 'Alterações desta Política', icon: 'edit',
    body: [
      'Podemos atualizar esta Política para refletir mudanças no marketplace ou na legislação. A data no topo desta página indica a versão vigente; mudanças relevantes serão comunicadas por e-mail ou aviso no marketplace.',
    ],
  },
  {
    id: 'contato-privacidade', title: 'Contato', icon: 'mail',
    body: [
      'Dúvidas sobre esta Política ou pedidos relacionados aos seus dados podem ser enviados pelos canais de atendimento reais do app, indicados no fim desta página.',
    ],
  },
];

const RETENTION_SECTIONS = [
  {
    id: 'objetivo', title: 'Objetivo', icon: 'info',
    body: [
      'Este documento detalha, tipo de dado por tipo de dado, por quanto tempo a Farmaura mantém as informações pessoais tratadas no marketplace e como funciona o processo de exclusão — o detalhamento que a LGPD (art. 16) exige por trás do que a nossa Política de Privacidade já resume.',
    ],
  },
  {
    id: 'prazos', title: 'Por quanto tempo mantemos cada dado', icon: 'clock',
    body: [
      { list: [
        'Dados de cadastro (nome, e-mail, telefone, endereço, senha criptografada): enquanto sua conta estiver ativa.',
        'Pedidos e histórico de compra: durante a vigência da conta, e depois pelo prazo de garantia e defesa do consumidor previsto no Código de Defesa do Consumidor.',
        'Documentos fiscais (notas fiscais emitidas via Asaas): mínimo de 5 anos, prazo decadencial tributário do Código Tributário Nacional (art. 173) — mantidos mesmo após o encerramento da conta.',
        'Receitas médicas enviadas: mantidas apenas pelo tempo necessário para a validação farmacêutica do pedido correspondente.',
        'Dados de pagamento: a Farmaura não armazena o número nem o código de segurança do seu cartão (processados e tokenizados pelo Asaas); o token de cobrança salvo fica retido enquanto você mantiver o cartão cadastrado na conta, e é removido quando você o exclui.',
        'Dados de navegação agregados (Google Analytics): seguem o prazo de retenção padrão da própria ferramenta, configurado no nível da conta do Google Analytics, não individualmente pela Farmaura.',
        'Registros de segurança e acesso (tentativas de login, bloqueios): mantidos pelo tempo necessário para investigar incidentes e cumprir obrigações legais.',
      ] },
    ],
  },
  {
    id: 'como-excluimos', title: 'Como e quando excluímos os dados', icon: 'trash',
    body: [
      'Ao final de cada prazo acima, ou quando você solicita a exclusão da sua conta, apagamos ou anonimizamos os dados que não precisem mais ser retidos por obrigação legal — de forma que deixem de identificar você.',
    ],
  },
  {
    id: 'como-pedir', title: 'Como pedir a exclusão da sua conta', icon: 'user',
    body: [
      'Hoje esse pedido é feito manualmente: fale com a nossa equipe pelo WhatsApp ou pelo chat com o farmacêutico dentro do app, indicados no fim desta página, informando que deseja excluir sua conta. Ainda não existe um botão de autoexclusão dentro do site — quando esse fluxo automatizado existir, ele vai substituir esta etapa manual sem alterar os prazos e exceções descritos aqui.',
      'O mesmo canal serve para pedir a correção ou a portabilidade dos seus dados antes de uma eventual exclusão.',
    ],
  },
  {
    id: 'excecoes', title: 'O que continua sendo guardado mesmo depois da exclusão', icon: 'shield',
    body: [
      'Excluir sua conta não apaga documentos que a lei exige que guardemos por um prazo mínimo — principalmente notas fiscais (5 anos) e registros necessários para cumprir obrigação legal, regulatória ou para nossa defesa em eventual processo judicial ou administrativo. Esses dados ficam retidos só pelo prazo legal aplicável, isolados de qualquer uso comercial ou de marketing, e são eliminados ao final desse prazo.',
    ],
  },
  {
    id: 'contato-retencao', title: 'Contato', icon: 'mail',
    body: [
      'Dúvidas sobre prazos de retenção ou pedidos de exclusão podem ser enviados pelos canais de atendimento reais do app, indicados no fim desta página.',
    ],
  },
];

function TermsScreen({ ctx }) {
  return (
    <LegalDocShell
      ctx={ctx}
      eyebrow="LEGAL"
      title="Termos de Uso"
      updated="14 de setembro de 2026"
      intro="As regras de uso do marketplace Farmaura — cadastro, pedidos, pagamento, entrega e o que esperamos de quem compra com a gente."
      sections={TERMS_SECTIONS}
      relatedLinks={[
        { label: 'Ver Política de Privacidade', icon: 'lock', route: { name: 'privacy' } },
        { label: 'Ver Exclusão e Retenção de Dados', icon: 'trash', route: { name: 'data-retention' } },
      ]}
    />
  );
}

function PrivacyScreen({ ctx }) {
  return (
    <LegalDocShell
      ctx={ctx}
      eyebrow="LEGAL"
      title="Política de Privacidade"
      updated="14 de setembro de 2026"
      intro="Quais dados coletamos, por quê, com quem compartilhamos e como você exerce seus direitos sobre eles, em conformidade com a LGPD."
      sections={PRIVACY_SECTIONS}
      relatedLinks={[
        { label: 'Ver Termos de Uso', icon: 'info', route: { name: 'terms' } },
        { label: 'Ver Exclusão e Retenção de Dados', icon: 'trash', route: { name: 'data-retention' } },
      ]}
    />
  );
}

function DataRetentionScreen({ ctx }) {
  return (
    <LegalDocShell
      ctx={ctx}
      eyebrow="LEGAL"
      title="Exclusão e Retenção de Dados"
      updated="14 de setembro de 2026"
      intro="Por quanto tempo guardamos cada tipo de dado pessoal, o que acontece quando você pede a exclusão da sua conta e o que a lei ainda exige que a gente mantenha mesmo assim."
      sections={RETENTION_SECTIONS}
      relatedLinks={[
        { label: 'Ver Política de Privacidade', icon: 'lock', route: { name: 'privacy' } },
        { label: 'Ver Termos de Uso', icon: 'info', route: { name: 'terms' } },
      ]}
    />
  );
}

export { TermsScreen, PrivacyScreen, DataRetentionScreen };
