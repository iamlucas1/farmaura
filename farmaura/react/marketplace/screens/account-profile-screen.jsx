/*
farmaura/react/marketplace/screens/account-profile-screen.jsx

Marketplace account profile screens for Farmaura.

Responsibilities:
- manage customer profile, saved addresses, privacy settings, and saved cards;
- standardize address capture with masked CEP and ViaCEP autofill;
- preserve existing account management flows with normalized address data;

Observations:
- legacy saved addresses are normalized before edit or display;
- ViaCEP only fills public locality data and never replaces house number or complement;
*/

import React, { useEffect, useRef, useState } from "react";
import { Toggle } from "../core/marketplace-components.jsx";
import {
  buildAddressLine,
  buildAddressSecondaryLine,
  createEmptyAddress,
  fetchViaCepAddress,
  formatCep,
  normalizeAddress,
} from "../core/marketplace-address.js";
import { Icon } from "../core/marketplace-icons.jsx";
import { initials } from "./account-shared.jsx";
import { TwoFactorModal } from "../../shared/two-factor-modal.jsx";


function Block({ icon, title, sub, action, children, bodyStyle }) {
  /** Render one account settings block wrapper. */

  return (
    <div className="fa-block">
      <div className="fa-block-head">
        {icon && <Icon name={icon} size={19} style={{ color: 'var(--fa-primary)' }} />}
        <div style={{ flex: 1 }}>
          <div className="fa-block-title">{title}</div>
          {sub && <div className="fa-block-sub">{sub}</div>}
        </div>
        {action}
      </div>
      <div className="fa-block-body" style={bodyStyle}>{children}</div>
    </div>
  );
}

function SavedTag({ show }) {
  /** Render the saved badge when a section was persisted. */

  if (!show) return null;
  return <span className="fa-badge fa-badge-health" style={{ marginLeft: 10 }}><Icon name="check" size={12} stroke={2.6} />Salvo</span>;
}

function AddressForm({ initial, onSave, onCancel }) {
  /** Render the saved-address form with ViaCEP-assisted autofill. */

  const [address, setAddress] = useState(() => normalizeAddress(initial || createEmptyAddress()));
  const [cepStatus, setCepStatus] = useState({ loading: false, error: "", hint: "" });
  const lastLookupCepRef = useRef("");

  const setField = (field, value) => {
    setAddress((current) => ({ ...current, [field]: value }));
  };

  const lookupCep = async (cepValue) => {
    /** Resolve the current CEP and merge the result into the form. */

    const maskedCep = formatCep(cepValue);
    const digits = maskedCep.replace(/\D/g, "");
    if (digits.length !== 8 || digits === lastLookupCepRef.current) {
      return;
    }

    setCepStatus({ loading: true, error: "", hint: "" });
    try {
      const result = await fetchViaCepAddress(maskedCep);
      lastLookupCepRef.current = digits;
      setAddress((current) => ({
        ...current,
        cep: result.cep,
        street: result.street || current.street,
        district: result.district || current.district,
        city: result.city || current.city,
        state: result.state || current.state,
      }));
      setCepStatus({ loading: false, error: "", hint: "Rua, bairro, cidade e UF preenchidos automaticamente." });
    } catch (error) {
      setCepStatus({ loading: false, error: error && error.message ? error.message : "Nao foi possivel buscar o CEP.", hint: "" });
    }
  };

  useEffect(() => {
    /** Trigger ViaCEP lookup as soon as the CEP becomes complete. */

    const digits = address.cep.replace(/\D/g, "");
    if (digits.length === 8) {
      void lookupCep(address.cep);
      return;
    }
    lastLookupCepRef.current = "";
    setCepStatus((current) => current.loading ? current : { loading: false, error: "", hint: "" });
  }, [address.cep]);

  return (
    <div style={{ background: 'var(--fa-mist-2)', borderRadius: 'var(--fa-r-card)', padding: 18, marginTop: 14 }}>
      <div className="fa-form2">
        <div className="fa-field"><label>Apelido</label><input className="fa-input" value={address.label} onChange={(event) => setField('label', event.target.value)} placeholder="Casa, Trabalho…" /></div>
        <div className="fa-field">
          <label>CEP</label>
          <input className="fa-input" value={address.cep} onChange={(event) => setField('cep', formatCep(event.target.value))} placeholder="00000-000" inputMode="numeric" />
          {cepStatus.loading ? <div className="fa-faint" style={{ fontSize: 12, marginTop: 6 }}>Buscando endereço...</div> : null}
          {!cepStatus.loading && cepStatus.hint ? <div style={{ fontSize: 12, marginTop: 6, color: 'var(--fa-success)' }}>{cepStatus.hint}</div> : null}
          {!cepStatus.loading && cepStatus.error ? <div style={{ fontSize: 12, marginTop: 6, color: 'var(--fa-error)' }}>{cepStatus.error}</div> : null}
        </div>
        <div className="fa-field fa-span2"><label>Rua</label><input className="fa-input" value={address.street} onChange={(event) => setField('street', event.target.value)} placeholder="Rua, avenida ou logradouro" /></div>
        <div className="fa-field"><label>Número</label><input className="fa-input" value={address.number} onChange={(event) => setField('number', event.target.value)} placeholder="123" /></div>
        <div className="fa-field"><label>Complemento</label><input className="fa-input" value={address.complement} onChange={(event) => setField('complement', event.target.value)} placeholder="Apto, bloco, casa..." /></div>
        <div className="fa-field"><label>Bairro</label><input className="fa-input" value={address.district} onChange={(event) => setField('district', event.target.value)} placeholder="Bairro" /></div>
        <div className="fa-field"><label>Cidade</label><input className="fa-input" value={address.city} onChange={(event) => setField('city', event.target.value)} placeholder="Cidade" /></div>
        <div className="fa-field"><label>UF</label><input className="fa-input" value={address.state} onChange={(event) => setField('state', event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))} placeholder="UF" /></div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button className="fa-btn fa-btn-primary" onClick={() => onSave(normalizeAddress(address))}><Icon name="check" size={16} stroke={2.4} />Salvar endereço</button>
        <button className="fa-btn fa-btn-soft" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

async function buildProfilePhotoDataUrl(file) {
  /** Convert one selected image into a compressed profile-photo data URL. */

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error('Nao foi possivel ler a imagem selecionada.'));
      nextImage.src = objectUrl;
    });
    const maxSide = 512;
    const scale = Math.min(1, maxSide / Math.max(image.width || 1, image.height || 1));
    const width = Math.max(1, Math.round((image.width || 1) * scale));
    const height = Math.max(1, Math.round((image.height || 1) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Nao foi possivel preparar a foto para envio.');
    }
    context.drawImage(image, 0, 0, width, height);
    let quality = 0.86;
    let output = canvas.toDataURL('image/jpeg', quality);
    while (output.length > 350_000 && quality > 0.45) {
      quality -= 0.08;
      output = canvas.toDataURL('image/jpeg', quality);
    }
    if (output.length > 450_000) {
      throw new Error('A imagem ainda ficou muito grande. Escolha uma foto menor ou mais leve.');
    }
    return output;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function ProfileManage({ ctx, acct }) {
  /** Render the profile management tab. */

  const { profile, setProfile } = acct;
  const addresses = ctx.addresses;
  const [draft, setDraft] = useState(profile);
  const [savedInfo, setSavedInfo] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [savedPass, setSavedPass] = useState(false);
  const [editingAddr, setEditingAddr] = useState(null);
  const [addrError, setAddrError] = useState('');
  const [twoFactorModalMode, setTwoFactorModalMode] = useState('');
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const fileRef = useRef(null);
  const setDraftField = (field, value) => { setDraft((current) => ({ ...current, [field]: value })); setSavedInfo(false); setInfoError(''); };
  const maskCpfInput = (value) => {
    const digits = (value || '').replace(/\D/g, '').slice(0, 11);
    if (digits.length > 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    if (digits.length > 6) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    if (digits.length > 3) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    return digits;
  };

  const applyTwoFactorState = (enabled) => {
    setDraft((current) => ({ ...current, twoFactor: !!enabled }));
    setProfile((current) => ({ ...current, twoFactor: !!enabled }));
  };

  const normalizedAddresses = addresses.map((address) => normalizeAddress(address));

  const onPhoto = async (event) => {
    /** Load the selected profile image into the local draft state. */

    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      setPhotoError('');
      setSavingPhoto(true);
      const nextPhoto = await buildProfilePhotoDataUrl(file);
      const nextProfile = await ctx.saveCustomerAvatar(nextPhoto);
      setProfile(nextProfile);
      setDraft(nextProfile);
    } catch (error) {
      setPhotoError(error && error.message ? error.message : 'Nao foi possivel salvar a foto de perfil.');
    } finally {
      setSavingPhoto(false);
      if (fileRef.current) {
        fileRef.current.value = '';
      }
    }
  };

  const saveInfo = async () => {
    /** Persist profile changes to the customer's real backend record. */

    try {
      setInfoError('');
      setSavingInfo(true);
      const nextProfile = await ctx.saveCustomerProfile(draft);
      setProfile(nextProfile);
      setDraft(nextProfile);
      setSavedInfo(true);
    } catch (error) {
      setInfoError(error && error.message ? error.message : 'Não foi possível salvar seus dados agora.');
    } finally {
      setSavingInfo(false);
    }
  };

  const setPrimaryAddr = async (id) => {
    /** Promote one address as the primary delivery location. */

    try {
      setAddrError('');
      await ctx.setPrimaryCustomerAddress(id);
    } catch (error) {
      setAddrError(error && error.message ? error.message : 'Não foi possível atualizar o endereço principal.');
    }
  };

  const removeAddr = async (id) => {
    /** Remove one saved address from the customer account. */

    try {
      setAddrError('');
      await ctx.deleteCustomerAddress(id);
    } catch (error) {
      setAddrError(error && error.message ? error.message : 'Não foi possível remover o endereço.');
    }
  };

  const saveAddr = async (data) => {
    /** Create or update one normalized saved address. */

    const normalized = normalizeAddress(data);
    try {
      setAddrError('');
      if (editingAddr === 'new') {
        await ctx.createCustomerAddress(normalized);
      } else {
        await ctx.updateCustomerAddress(editingAddr, normalized);
      }
      setEditingAddr(null);
    } catch (error) {
      setAddrError(error && error.message ? error.message : 'Não foi possível salvar o endereço.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1 className="fa-h2" style={{ marginBottom: 2 }}>Gerenciar perfil</h1>

      <Block icon="camera" title="Foto de perfil" sub="Use uma imagem nítida e recente.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <span className="fa-avatar">{draft.photo ? <img src={draft.photo} alt="" /> : initials(draft.name)}</span>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} style={{ display: 'none' }} />
            <button className="fa-btn fa-btn-primary" disabled={savingPhoto} onClick={() => fileRef.current && fileRef.current.click()}><Icon name="camera" size={16} />{savingPhoto ? 'Salvando foto...' : draft.photo ? 'Trocar foto' : 'Enviar foto'}</button>
            {draft.photo && <button className="fa-btn fa-btn-soft" disabled={savingPhoto} onClick={async () => {
              try {
                setPhotoError('');
                setSavingPhoto(true);
                const nextProfile = await ctx.saveCustomerAvatar('');
                setProfile(nextProfile);
                setDraft(nextProfile);
              } catch (error) {
                setPhotoError(error && error.message ? error.message : 'Nao foi possivel remover a foto de perfil.');
              } finally {
                setSavingPhoto(false);
                if (fileRef.current) {
                  fileRef.current.value = '';
                }
              }
            }}><Icon name="trash" size={16} />Remover</button>}
          </div>
        </div>
        {photoError ? <div style={{ marginTop: 12, color: 'var(--fa-error)', fontSize: 12.5 }}>{photoError}</div> : null}
      </Block>

      <Block icon="user" title="Informações pessoais" action={<SavedTag show={savedInfo} />}>
        <div className="fa-form2">
          <div className="fa-field fa-span2"><label>Nome completo</label><input className="fa-input" value={draft.name} onChange={(event) => setDraftField('name', event.target.value)} /></div>
          <div className="fa-field"><label>E-mail</label><input className="fa-input" type="email" value={draft.email} onChange={(event) => setDraftField('email', event.target.value)} /></div>
          <div className="fa-field"><label>Telefone</label><input className="fa-input" value={draft.phone} onChange={(event) => setDraftField('phone', event.target.value)} /></div>
          <div className="fa-field"><label>CPF</label><input className="fa-input fa-mono" inputMode="numeric" maxLength={14} placeholder="000.000.000-00" value={draft.cpf} onChange={(event) => setDraftField('cpf', maskCpfInput(event.target.value))} /></div>
          <div className="fa-field"><label>Data de nascimento</label><input className="fa-input" type="date" value={draft.birth} onChange={(event) => setDraftField('birth', event.target.value)} /></div>
          <div className="fa-field"><label>Gênero</label>
            <select className="fa-select" value={draft.gender} onChange={(event) => setDraftField('gender', event.target.value)}>
              {['Feminino', 'Masculino', 'Não-binário', 'Prefiro não informar'].map((gender) => <option key={gender}>{gender}</option>)}
            </select>
          </div>
        </div>
        {infoError ? <div style={{ marginTop: 12, color: 'var(--fa-error)', fontSize: 12.5 }}>{infoError}</div> : null}
        <div style={{ marginTop: 18 }}>
          <button className="fa-btn fa-btn-primary" disabled={savingInfo || !draft.name.trim() || draft.cpf.replace(/\D/g, '').length !== 11} onClick={saveInfo}><Icon name="check" size={16} stroke={2.4} />{savingInfo ? 'Salvando...' : 'Salvar alterações'}</button>
        </div>
      </Block>

      <Block icon="lock" title="Segurança" sub="Senha e autenticação de dois fatores." action={<SavedTag show={savedPass} />}>
        <div className="fa-form2">
          <div className="fa-field fa-span2"><label>Senha atual</label><input className="fa-input" type="password" defaultValue="••••••••" /></div>
          <div className="fa-field"><label>Nova senha</label><input className="fa-input" type="password" placeholder="Mínimo 8 caracteres" /></div>
          <div className="fa-field"><label>Confirmar nova senha</label><input className="fa-input" type="password" placeholder="Repita a nova senha" /></div>
        </div>
        <div style={{ marginTop: 16 }}>
          <button className="fa-btn fa-btn-ghost" onClick={() => { setSavedPass(true); setTimeout(() => setSavedPass(false), 2200); }}><Icon name="lock" size={16} />Atualizar senha</button>
        </div>
        <div className="fa-row" style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--fa-mist)', borderBottom: 'none' }}>
          <span className="fa-iconbox" style={{ width: 42, height: 42 }}><Icon name="shield" size={20} /></span>
          <div className="fa-row-main">
            <div className="fa-row-label">Autenticação de dois fatores</div>
            <div className="fa-row-desc">Use apenas um aplicativo autenticador para aprovar cada novo login com código temporário.</div>
          </div>
          <Toggle on={draft.twoFactor} onChange={(value) => setTwoFactorModalMode(value ? 'enable' : 'disable')} ariaLabel="autenticação de dois fatores" />
        </div>
        <TwoFactorModal
          open={!!twoFactorModalMode}
          mode={twoFactorModalMode}
          portalLabel="marketplace"
          onClose={() => setTwoFactorModalMode('')}
          onStartSetup={ctx.beginTwoFactorSetup}
          onEnable={ctx.enableTwoFactor}
          onDisable={ctx.disableTwoFactor}
          onStatusChange={applyTwoFactorState}
        />
      </Block>

      <Block icon="pin" title="Endereços" sub="Onde você quer receber seus pedidos." action={editingAddr == null && <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setEditingAddr('new')}><Icon name="plus" size={15} />Adicionar</button>}>
        {addrError ? <div style={{ marginBottom: 12, color: 'var(--fa-error)', fontSize: 12.5 }}>{addrError}</div> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {normalizedAddresses.map((address) => (
            <div key={address.id} style={{ border: '1px solid var(--fa-mist)', borderRadius: 'var(--fa-r-card)', padding: 16, display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap', background: address.primary ? 'var(--fa-rose-soft)' : 'var(--fa-surface)', borderColor: address.primary ? 'var(--fa-rose)' : 'var(--fa-mist)' }}>
              <Icon name="pin" size={20} style={{ color: 'var(--fa-primary)', marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 800, fontSize: 14.5 }}>{address.label}</span>
                  {address.primary && <span className="fa-badge fa-badge-rose">Principal</span>}
                </div>
                <div style={{ fontSize: 14 }}>{buildAddressLine(address) || 'Endereço não informado'}</div>
                <div className="fa-muted" style={{ fontSize: 13, marginTop: 2 }}>{buildAddressSecondaryLine(address)}{address.cep ? ` · CEP ${address.cep}` : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {!address.primary && <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setPrimaryAddr(address.id)}>Tornar principal</button>}
                <button className="fa-iconbtn" aria-label="editar" onClick={() => setEditingAddr(address.id)}><Icon name="edit" size={17} /></button>
                {normalizedAddresses.length > 1 && <button className="fa-iconbtn" aria-label="remover" onClick={() => removeAddr(address.id)}><Icon name="trash" size={17} /></button>}
              </div>
              {editingAddr === address.id && <div style={{ flexBasis: '100%' }}><AddressForm initial={address} onSave={saveAddr} onCancel={() => setEditingAddr(null)} /></div>}
            </div>
          ))}
          {editingAddr === 'new' && <AddressForm initial={createEmptyAddress()} onSave={saveAddr} onCancel={() => setEditingAddr(null)} />}
        </div>
      </Block>
    </div>
  );
}

function DataPrivacy({ ctx, acct }) {
  /** Render the privacy and communication preferences tab. */

  const { programs, setPrograms, channels, setChannels } = acct;
  const toggleProgram = (id, value) => setPrograms((list) => list.map((program) => program.id === id ? { ...program, on: value } : program));
  const setChannel = (id, value) => setChannels((list) => list.map((channel) => channel.id === id ? { ...channel, accept: value } : channel));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1 className="fa-h2" style={{ marginBottom: 2 }}>Privacidade de dados</h1>

      <Block icon="shield" title="Ofertas, comunicação e relacionamento" sub="Escolha como a Farmaura pode usar seus dados para personalizar sua experiência.">
        <div>
          {programs.map((program) => (
            <div className="fa-row" key={program.id}>
              <div className="fa-row-main">
                <div className="fa-row-label">{program.label}</div>
                <div className="fa-row-desc">{program.desc}</div>
              </div>
              <Toggle on={program.on} onChange={(value) => toggleProgram(program.id, value)} ariaLabel={program.label} />
            </div>
          ))}
        </div>
      </Block>

      <Block icon="bell" title="Por onde aceita receber comunicação?" sub="Defina os canais em que você quer (ou não) ser contatada.">
        <div>
          {channels.map((channel) => (
            <div className="fa-row" key={channel.id}>
              <span className="fa-iconbox" style={{ width: 42, height: 42 }}><Icon name={channel.icon} size={20} /></span>
              <div className="fa-row-main">
                <div className="fa-row-label">{channel.label}</div>
                <div className="fa-row-desc">{channel.desc}</div>
              </div>
              <div className="fa-segpill">
                <button data-on={channel.accept ? '1' : '0'} onClick={() => setChannel(channel.id, true)}>Aceito</button>
                <button data-on={!channel.accept ? '1' : '0'} data-no="1" onClick={() => setChannel(channel.id, false)}>Recuso</button>
              </div>
            </div>
          ))}
        </div>
      </Block>

      <p className="fa-faint" style={{ fontSize: 12.5, lineHeight: 1.6, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <Icon name="info" size={16} style={{ flex: 'none', marginTop: 1 }} />
        Suas preferências valem para toda a Farmaura e podem ser alteradas quando quiser. Tratamos seus dados conforme a LGPD.
      </p>
    </div>
  );
}

function CardForm({ onSave, onCancel }) {
  /** Render the saved-card creation form. */

  const [card, setCard] = useState({ number: '', holder: '', exp: '', cvv: '' });
  const setCardField = (field, value) => setCard((current) => ({ ...current, [field]: value }));
  const brandOf = (value) => value.startsWith('4') ? 'Visa' : value.startsWith('5') ? 'Mastercard' : value.startsWith('6') ? 'Elo' : 'Cartão';
  return (
    <div style={{ background: 'var(--fa-mist-2)', borderRadius: 'var(--fa-r-card)', padding: 18 }}>
      <div className="fa-form2">
        <div className="fa-field fa-span2"><label>Número do cartão</label><input className="fa-input" value={card.number} onChange={(event) => setCardField('number', event.target.value.replace(/[^0-9]/g, '').slice(0, 16))} placeholder="0000 0000 0000 0000" /></div>
        <div className="fa-field fa-span2"><label>Nome impresso no cartão</label><input className="fa-input" value={card.holder} onChange={(event) => setCardField('holder', event.target.value.toUpperCase())} placeholder="NOME COMPLETO" /></div>
        <div className="fa-field"><label>Validade</label><input className="fa-input" value={card.exp} onChange={(event) => setCardField('exp', event.target.value)} placeholder="MM/AA" /></div>
        <div className="fa-field"><label>CVV</label><input className="fa-input" value={card.cvv} onChange={(event) => setCardField('cvv', event.target.value.replace(/[^0-9]/g, '').slice(0, 4))} placeholder="000" /></div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button className="fa-btn fa-btn-primary" disabled={card.number.length < 4 || !card.holder} onClick={() => onSave({ brand: brandOf(card.number), last4: card.number.slice(-4).padStart(4, '0'), holder: card.holder, exp: card.exp || '00/00' })}><Icon name="check" size={16} stroke={2.4} />Adicionar cartão</button>
        <button className="fa-btn fa-btn-soft" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

function MyCards({ ctx }) {
  /** Render the saved-card management tab. */

  const cards = ctx.cards;
  const [adding, setAdding] = useState(false);
  const [cardError, setCardError] = useState('');
  const setPrimary = async (id) => {
    try {
      setCardError('');
      await ctx.setPrimaryCustomerPaymentMethod(id);
    } catch (error) {
      setCardError(error && error.message ? error.message : 'Não foi possível atualizar o cartão principal.');
    }
  };
  const remove = async (id) => {
    try {
      setCardError('');
      await ctx.deleteCustomerPaymentMethod(id);
    } catch (error) {
      setCardError(error && error.message ? error.message : 'Não foi possível remover o cartão.');
    }
  };
  const add = async (data) => {
    try {
      setCardError('');
      await ctx.createCustomerPaymentMethod(data);
      setAdding(false);
    } catch (error) {
      setCardError(error && error.message ? error.message : 'Não foi possível adicionar o cartão.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="fa-acct-head" style={{ marginBottom: 0 }}>
        <div style={{ flex: 1 }}><h1 className="fa-h2">Meus cartões</h1><p className="fa-muted" style={{ fontSize: 14, marginTop: 4 }}>{cards.length} {cards.length === 1 ? 'cartão salvo' : 'cartões salvos'}</p></div>
        {!adding && <button className="fa-btn fa-btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} />Adicionar cartão</button>}
      </div>

      {cardError ? <div style={{ color: 'var(--fa-error)', fontSize: 12.5 }}>{cardError}</div> : null}
      {adding && <CardForm onSave={add} onCancel={() => setAdding(false)} />}

      <div className="fa-grid" style={{ '--fa-grid-min': '300px' }}>
        {cards.map((card) => (
          <div key={card.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="fa-paycard" data-brand={card.brand}>
              {card.primary && <span className="fa-badge" style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,.2)', color: '#fff' }}>Principal</span>}
              <div style={{ fontWeight: 800, letterSpacing: '.04em' }}>{card.brand}</div>
              <div className="fa-mono" style={{ fontSize: 18, letterSpacing: '.14em' }}>•••• •••• •••• {card.last4}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, opacity: .85 }}><span>{card.holder}</span><span>val {card.exp}</span></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {!card.primary && <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ flex: 1 }} onClick={() => setPrimary(card.id)}>Tornar principal</button>}
              <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ flex: card.primary ? 1 : 'none', color: 'var(--fa-error)' }} onClick={() => remove(card.id)}><Icon name="trash" size={15} />Remover</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { AddressForm, Block, CardForm, DataPrivacy, MyCards, ProfileManage, TwoFactorModal };
