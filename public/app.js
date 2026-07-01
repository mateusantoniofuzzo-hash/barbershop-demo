(() => {
  'use strict';

  const root = document.getElementById('app');
  const toastEl = document.getElementById('toast');
  const TOKEN_KEY = 'prime_token';
  const statuses = ['Agendado', 'Confirmado', 'Concluído', 'Cancelado', 'Não compareceu'];
  const weekdayShort = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const weekdayLong = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  const state = {
    token: localStorage.getItem(TOKEN_KEY) || '',
    user: null,
    settings: null,
    barbers: [],
    appointments: [],
    admin: null,
    view: 'home',
    authMode: 'login',
    registerRole: 'client',
    selectedBarberId: '',
    selectedDate: todayKey(),
    selectedTime: '',
    availability: [],
    rescheduleId: '',
    lastAppointmentId: '',
    modal: null,
    barberAgendaDate: todayKey(),
    barberView: 'day',
    adminTab: 'dashboard',
    editBarberId: '',
    adminScheduleBarberId: '',
    editAppointmentId: '',
    busy: false
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[char]);
  }

  function money(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
  }

  function todayKey() {
    const now = new Date();
    const shifted = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return shifted.toISOString().slice(0, 10);
  }

  function addDays(dateKey, amount) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0);
    date.setDate(date.getDate() + amount);
    return date.toISOString().slice(0, 10);
  }

  function dateObj(dateKey) {
    const [year, month, day] = String(dateKey).split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  function formatDate(dateKey, options = { day: '2-digit', month: 'short' }) {
    if (!dateKey) return '';
    return dateObj(dateKey).toLocaleDateString('pt-BR', options).replace('.', '');
  }

  function fullDate(dateKey) {
    return formatDate(dateKey, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }

  function statusClass(status) {
    return String(status || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
  }

  function isTerminal(appointment) {
    return ['Cancelado', 'Concluído', 'Não compareceu'].includes(appointment.status);
  }

  function roleLabel(role) {
    return { client: 'Cliente', barber: 'Barbeiro', admin: 'Admin' }[role] || role;
  }

  function sortAppointments(items) {
    return [...items].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  }

  function getBarber(id) {
    return state.barbers.find((barber) => barber.id === id) || state.admin?.barbers?.find((barber) => barber.id === id) || null;
  }

  function getAppointment(id) {
    return state.appointments.find((appointment) => appointment.id === id) || state.admin?.appointments?.find((appointment) => appointment.id === id) || null;
  }

  function cleanPhone(phone) {
    return String(phone || '').replace(/\D/g, '');
  }

  function whatsappNumber(phone) {
    const digits = cleanPhone(phone);
    if (!digits) return '';
    return digits.startsWith('55') ? digits : `55${digits}`;
  }

  function toast(message, type = 'success') {
    toastEl.textContent = message;
    toastEl.className = `toast show ${type}`;
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => {
      toastEl.className = 'toast';
    }, 3200);
  }

  async function api(path, options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    const config = { ...options, headers };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    if (config.body && typeof config.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(config.body);
    }
    const response = await fetch(path, config);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Não foi possível concluir a ação.');
    }
    return data;
  }

  async function refreshAll() {
    const data = await api('/api/bootstrap');
    state.settings = data.settings;
    state.user = data.user;
    state.barbers = data.barbers || [];
    state.appointments = data.appointments || [];
    if (state.token && !state.user) {
      state.token = '';
      localStorage.removeItem(TOKEN_KEY);
      state.view = 'home';
    }
    if (state.user?.role === 'admin') await loadAdmin(false);
  }

  async function loadAdmin(shouldRender = true) {
    if (state.user?.role !== 'admin') return;
    state.admin = await api('/api/admin/dashboard');
    if (!state.adminScheduleBarberId && state.admin.barbers?.length) {
      state.adminScheduleBarberId = state.admin.barbers[0].id;
    }
    if (shouldRender) render();
  }

  async function refreshAppointments() {
    const data = await api('/api/appointments');
    state.appointments = data.appointments || [];
    if (state.user?.role === 'admin') await loadAdmin(false);
  }

  function routeAfterLogin() {
    if (!state.user) {
      state.view = 'home';
      return;
    }
    if (state.user.role === 'client') state.view = 'client-dashboard';
    if (state.user.role === 'barber') state.view = 'barber-dashboard';
    if (state.user.role === 'admin') state.view = 'admin-dashboard';
  }

  function formData(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    form.querySelectorAll('input[type="checkbox"][name]').forEach((input) => {
      data[input.name] = input.checked;
    });
    return data;
  }

  async function login(email, password) {
    const data = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    state.token = data.token;
    localStorage.setItem(TOKEN_KEY, data.token);
    await refreshAll();
    routeAfterLogin();
    toast(`Bem-vindo, ${state.user.name}.`);
    render();
  }

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      // Session cleanup should happen locally even if the server token is gone.
    }
    state.token = '';
    state.user = null;
    state.admin = null;
    state.appointments = [];
    state.view = 'home';
    localStorage.removeItem(TOKEN_KEY);
    render();
  }

  async function loadAvailability() {
    if (!state.selectedBarberId || !state.selectedDate) return;
    state.availability = [];
    render();
    const data = await api(`/api/barbers/${state.selectedBarberId}/availability?date=${encodeURIComponent(state.selectedDate)}`);
    state.availability = data.slots || [];
    render();
  }

  function appointmentMessage(appointment) {
    const clientName = appointment.clientName || state.user?.name || '';
    return `Olá! Gostaria de confirmar meu agendamento na barbearia.\n\nNome: ${clientName}\nBarbeiro: ${appointment.barberName}\nData: ${fullDate(appointment.date)}\nHorário: ${appointment.time}\nValor: ${money(appointment.value)}\n\nObrigado!`;
  }

  function barberContactMessage(appointment) {
    return `Olá, ${appointment.clientName}! Aqui é da ${state.settings?.shopName || 'barbearia'} sobre seu agendamento de ${fullDate(appointment.date)} às ${appointment.time}.`;
  }

  function whatsappLink(appointment, target = 'barber') {
    const phone = target === 'client' ? appointment.clientPhone : (appointment.barberWhatsapp || state.settings?.whatsapp);
    const message = target === 'client' ? barberContactMessage(appointment) : appointmentMessage(appointment);
    return `https://wa.me/${whatsappNumber(phone)}?text=${encodeURIComponent(message)}`;
  }

  async function confirmBooking() {
    if (!state.selectedBarberId || !state.selectedDate || !state.selectedTime) {
      toast('Escolha data e horário para continuar.', 'error');
      return;
    }
    state.busy = true;
    render();
    try {
      const payload = {
        barberId: state.selectedBarberId,
        date: state.selectedDate,
        time: state.selectedTime
      };
      const data = state.rescheduleId
        ? await api(`/api/appointments/${state.rescheduleId}/reschedule`, { method: 'PATCH', body: payload })
        : await api('/api/appointments', { method: 'POST', body: payload });
      await refreshAll();
      state.lastAppointmentId = data.appointment.id;
      state.rescheduleId = '';
      state.selectedTime = '';
      state.view = 'confirmation';
      state.modal = { type: 'whatsapp', appointmentId: data.appointment.id };
      toast('Agendamento salvo com sucesso.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      state.busy = false;
      render();
    }
  }

  function renderHome() {
    return `
      <section class="home">
        <div class="hero">
          <img class="hero-media" src="/assets/barbershop-photo.png" onerror="this.onerror=null;this.src='/assets/hero-barbershop.svg';" alt="Interior moderno de barbearia" />
          <div class="hero-shade"></div>
          <div class="hero-content">
            <span class="eyebrow">Agenda inteligente</span>
            <h1>Barbearia Prime</h1>
            <p>Cortes, barba e manutenção com horários organizados para clientes, barbeiros e administração.</p>
            <div class="hero-actions">
              <button class="btn primary" data-action="start-booking">Agendar horário</button>
              <button class="btn ghost" data-action="show-login">Entrar</button>
            </div>
          </div>
        </div>
        <div class="home-strip">
          <div class="metric-tile"><strong>${state.barbers.length || 3}</strong><span>barbeiros disponíveis</span></div>
          <div class="metric-tile"><strong>WhatsApp</strong><span>confirmação pronta para envio</span></div>
          <div class="metric-tile"><strong>Mobile</strong><span>fluxo curto para agendar no celular</span></div>
        </div>
      </section>
    `;
  }

  function renderAuth() {
    const isLogin = state.authMode === 'login';
    return `
      <section class="auth-page">
        <div class="auth-wrap">
          <div class="auth-brand">
            <div class="brand">
              <span class="brand-mark">BP</span>
              <div class="brand-text"><strong>Barbearia Prime</strong><span>${isLogin ? 'Entrar' : 'Criar conta'}</span></div>
            </div>
            <button class="btn slim ghost" data-action="go-home">Início</button>
          </div>
          <div class="auth-card">
            <div class="tabs">
              <button class="tab ${isLogin ? 'active' : ''}" data-action="auth-mode" data-mode="login">Login</button>
              <button class="tab ${!isLogin ? 'active' : ''}" data-action="auth-mode" data-mode="register">Cadastro</button>
            </div>
            ${isLogin ? renderLoginForm() : renderRegisterForm()}
          </div>
        </div>
      </section>
    `;
  }

  function renderLoginForm() {
    return `
      <form class="form-grid" data-form="login">
        <label>E-mail<input name="email" type="email" autocomplete="email" required placeholder="voce@email.com" /></label>
        <label>Senha<input name="password" type="password" autocomplete="current-password" required placeholder="Sua senha" /></label>
        <button class="btn primary full" type="submit">Entrar</button>
        <button class="btn ghost full" type="button" data-action="show-register">Criar cadastro</button>
        <div class="auth-demo">
          <button class="btn slim" type="button" data-action="demo-login" data-email="cliente@barbearia.local" data-password="Cliente123!">Cliente demo</button>
          <button class="btn slim" type="button" data-action="demo-login" data-email="marcos@barbearia.local" data-password="Barber123!">Barbeiro demo</button>
          <button class="btn slim" type="button" data-action="demo-login" data-email="admin@barbearia.local" data-password="Admin123!">Admin demo</button>
        </div>
        <span class="small-muted">Recuperação de senha pode ser conectada ao provedor de e-mail na próxima etapa.</span>
      </form>
    `;
  }

  function renderRegisterForm() {
    const isBarber = state.registerRole === 'barber';
    return `
      <form class="form-grid" data-form="register">
        <label>Nome<input name="name" required minlength="3" autocomplete="name" placeholder="Seu nome" /></label>
        <label>E-mail<input name="email" type="email" required autocomplete="email" placeholder="voce@email.com" /></label>
        <label>Telefone<input name="phone" required inputmode="tel" autocomplete="tel" placeholder="(11) 99999-9999" /></label>
        <label>Tipo de conta
          <select name="role" data-action="register-role">
            <option value="client" ${state.registerRole === 'client' ? 'selected' : ''}>Cliente</option>
            <option value="barber" ${isBarber ? 'selected' : ''}>Barbeiro</option>
          </select>
        </label>
        ${isBarber ? `
          <label>Valor do corte<input name="price" type="number" min="1" step="1" value="55" /></label>
          <label>WhatsApp<input name="whatsapp" inputmode="tel" placeholder="(11) 99999-9999" /></label>
          <label>Especialidade<textarea name="description" placeholder="Cortes clássicos, barba, degradê..."></textarea></label>
        ` : ''}
        <div class="form-grid two">
          <label>Senha<input name="password" type="password" required minlength="6" autocomplete="new-password" /></label>
          <label>Confirmar senha<input name="confirmPassword" type="password" required minlength="6" autocomplete="new-password" /></label>
        </div>
        <button class="btn primary full" type="submit">Cadastrar</button>
      </form>
    `;
  }

  function renderShell(title, subtitle, content, active = '') {
    const role = state.user ? roleLabel(state.user.role) : '';
    return `
      <section class="app-shell">
        <header class="topbar">
          <div class="brand">
            <span class="brand-chip">BP</span>
            <div class="brand-text"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle || role)}</span></div>
          </div>
          <div class="user-actions">
            <span class="user-pill">${escapeHtml(state.user?.name || '')}</span>
            <button class="btn slim ghost" data-action="logout">Sair</button>
          </div>
        </header>
        <div class="content">${content}</div>
        ${renderBottomNav(active)}
        ${renderModal()}
      </section>
    `;
  }

  function renderBottomNav(active) {
    if (!state.user) return '';
    if (state.user.role === 'client') {
      return `
        <nav class="bottom-nav">
          <button class="${active === 'client' ? 'active' : ''}" data-action="client-nav" data-view="client-dashboard">Agenda</button>
          <button class="${active === 'barbers' ? 'active' : ''}" data-action="client-nav" data-view="client-dashboard" data-focus="barbers">Barbeiros</button>
          <button class="${active === 'history' ? 'active' : ''}" data-action="client-nav" data-view="client-history">Histórico</button>
        </nav>
      `;
    }
    if (state.user.role === 'barber') {
      return `
        <nav class="bottom-nav">
          <button class="${state.barberView === 'day' ? 'active' : ''}" data-action="barber-view" data-view="day">Dia</button>
          <button class="${state.barberView === 'week' ? 'active' : ''}" data-action="barber-view" data-view="week">Semana</button>
          <button data-action="barber-today">Hoje</button>
        </nav>
      `;
    }
    return '';
  }

  function renderPageHead(title, text, action = '') {
    return `
      <div class="page-head">
        <div class="page-title"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p></div>
        ${action}
      </div>
    `;
  }

  function renderClientDashboard() {
    const upcoming = sortAppointments(state.appointments).filter((item) => item.date >= todayKey() && !isTerminal(item));
    const content = `
      ${renderPageHead('Seu horário', 'Escolha um barbeiro, veja os horários livres e confirme pelo WhatsApp.', '<button class="btn primary" data-action="scroll-barbers">Agendar</button>')}
      <div class="section-title"><h3>Próximos agendamentos</h3><span>${upcoming.length}</span></div>
      <div class="grid two">
        ${upcoming.length ? upcoming.slice(0, 4).map((item) => renderAppointmentCard(item, 'client')).join('') : '<div class="empty">Nenhum horário marcado.</div>'}
      </div>
      <div class="section-title" id="barbers-section"><h3>Barbeiros disponíveis</h3><span>${state.barbers.length}</span></div>
      <div class="grid three">
        ${state.barbers.map(renderBarberCard).join('')}
      </div>
    `;
    return renderShell('Painel do cliente', state.settings?.shopName || 'Barbearia', content, 'client');
  }

  function renderClientHistory() {
    const history = sortAppointments(state.appointments).filter((item) => item.date < todayKey() || isTerminal(item));
    const content = `
      ${renderPageHead('Histórico', 'Todos os seus atendimentos ficam salvos aqui.')}
      <div class="grid two">
        ${history.length ? history.map((item) => renderAppointmentCard(item, 'client')).join('') : '<div class="empty">Seu histórico ainda está vazio.</div>'}
      </div>
    `;
    return renderShell('Histórico', state.user.name, content, 'history');
  }

  function renderBarberCard(barber) {
    const days = barber.workingDays?.slice(0, 4).map((day) => `<span class="pill">${escapeHtml(day)}</span>`).join('') || '';
    return `
      <article class="barber-card">
        <img class="avatar" src="${escapeHtml(barber.avatar || '/assets/avatar-diego.svg')}" alt="Avatar de ${escapeHtml(barber.name)}" />
        <div>
          <h3 class="card-title">${escapeHtml(barber.name)}</h3>
          <p class="card-text">${escapeHtml(barber.description || 'Barbeiro da equipe')}</p>
          <div class="pills"><span class="pill price">${money(barber.price)}</span>${days}</div>
          <div class="row-actions">
            <button class="btn slim" data-action="open-barber" data-id="${barber.id}">Perfil</button>
            <button class="btn slim primary" data-action="open-booking" data-id="${barber.id}">Agendar</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderBarberProfile() {
    const barber = getBarber(state.selectedBarberId) || state.barbers[0];
    if (!barber) return renderShell('Barbeiros', 'Nenhum barbeiro ativo', '<div class="empty">Cadastre um barbeiro no painel admin.</div>', 'barbers');
    state.selectedBarberId = barber.id;
    const schedule = barber.schedules.filter((item) => item.active).map((item) => `<span class="pill">${item.day} · ${item.start}-${item.end}</span>`).join('');
    const content = `
      <button class="btn slim ghost" data-action="client-nav" data-view="client-dashboard">Voltar</button>
      <section class="profile-hero">
        <img class="avatar large" src="${escapeHtml(barber.avatar || '/assets/avatar-diego.svg')}" alt="Avatar de ${escapeHtml(barber.name)}" />
        <div>
          <span class="eyebrow">${money(barber.price)}</span>
          <h2>${escapeHtml(barber.name)}</h2>
          <p class="card-text">${escapeHtml(barber.description || 'Atendimento da equipe')}</p>
          <div class="pills">${schedule || '<span class="pill">Sem agenda ativa</span>'}</div>
          <div class="row-actions"><button class="btn primary" data-action="open-booking" data-id="${barber.id}">Agendar com ${escapeHtml(barber.name.split(' ')[0])}</button></div>
        </div>
      </section>
    `;
    return renderShell('Perfil do barbeiro', state.settings?.shopName || '', content, 'barbers');
  }

  function renderBooking() {
    const barber = getBarber(state.selectedBarberId);
    if (!barber) return renderClientDashboard();
    const dates = Array.from({ length: 14 }, (_, index) => addDays(todayKey(), index));
    const appointment = state.rescheduleId ? getAppointment(state.rescheduleId) : null;
    const content = `
      <button class="btn slim ghost" data-action="open-barber" data-id="${barber.id}">Voltar</button>
      ${renderPageHead(state.rescheduleId ? 'Remarcar horário' : 'Escolha o horário', `${barber.name} · ${money(barber.price)}`)}
      ${appointment ? `<div class="appointment-card"><strong>Horário atual</strong><span class="small-muted">${fullDate(appointment.date)} às ${appointment.time}</span></div>` : ''}
      <div class="section-title"><h3>Data</h3><span>${fullDate(state.selectedDate)}</span></div>
      <div class="date-strip">
        ${dates.map((date) => `
          <button class="date-chip ${date === state.selectedDate ? 'active' : ''}" data-action="select-date" data-date="${date}">
            <span>${weekdayShort[dateObj(date).getDay()]}</span><strong>${formatDate(date, { day: '2-digit', month: '2-digit' })}</strong>
          </button>
        `).join('')}
      </div>
      <div class="section-title"><h3>Horários</h3><span>${state.availability.filter((slot) => slot.available).length} livres</span></div>
      <div class="slot-grid">
        ${state.availability.length ? state.availability.map((slot) => `
          <button class="slot-btn ${state.selectedTime === slot.time ? 'active' : ''} ${slot.available ? '' : 'busy'}" ${slot.available ? '' : 'disabled'} data-action="select-time" data-time="${slot.time}">
            <strong>${slot.time}</strong><span>${escapeHtml(slot.reason)}</span>
          </button>
        `).join('') : '<div class="empty">Sem horários para esta data.</div>'}
      </div>
      <div class="confirm-bar">
        <button class="btn primary full" data-action="confirm-booking" ${state.selectedTime && !state.busy ? '' : 'disabled'}>${state.busy ? 'Salvando...' : state.rescheduleId ? 'Confirmar remarcação' : 'Confirmar agendamento'}</button>
      </div>
    `;
    return renderShell('Agendamento', barber.name, content, 'barbers');
  }

  function renderConfirmation() {
    const appointment = getAppointment(state.lastAppointmentId) || state.appointments[0];
    if (!appointment) return renderClientDashboard();
    const content = `
      ${renderPageHead('Agendamento confirmado', 'Seu card está pronto para envio pelo WhatsApp.')}
      <div class="grid two">
        ${renderAppointmentCard(appointment, 'client')}
      </div>
      <div class="row-actions">
        <button class="btn primary" data-action="whatsapp-modal" data-id="${appointment.id}">Abrir WhatsApp</button>
        <button class="btn ghost" data-action="client-nav" data-view="client-dashboard">Voltar ao painel</button>
      </div>
    `;
    return renderShell('Confirmação', state.settings?.shopName || '', content, 'client');
  }

  function renderAppointmentCard(appointment, context) {
    const terminal = isTerminal(appointment);
    const date = `${fullDate(appointment.date)} · ${appointment.time}`;
    const status = `<span class="status ${statusClass(appointment.status)}">${escapeHtml(appointment.status)}</span>`;
    let actions = '';
    if (context === 'client') {
      actions = `
        <button class="btn slim success" data-action="open-whatsapp" data-id="${appointment.id}" data-target="barber">WhatsApp</button>
        ${!terminal ? `<button class="btn slim" data-action="reschedule-appointment" data-id="${appointment.id}">Remarcar</button><button class="btn slim danger" data-action="cancel-appointment" data-id="${appointment.id}">Cancelar</button>` : ''}
      `;
    }
    if (context === 'barber') {
      actions = renderStatusButtons(appointment, 'barber');
    }
    if (context === 'admin') {
      actions = `
        <button class="btn slim" data-action="admin-edit-appointment" data-id="${appointment.id}">Editar</button>
        <button class="btn slim danger" data-action="admin-status" data-id="${appointment.id}" data-status="Cancelado">Cancelar</button>
      `;
    }
    return `
      <article class="appointment-card">
        <div class="appointment-main">
          <strong>${escapeHtml(appointment.barberName)}</strong>
          <span class="small-muted">${escapeHtml(date)}</span>
          <div class="appointment-meta"><span>${escapeHtml(appointment.service)}</span><span>${money(appointment.value)}</span>${status}</div>
          ${context !== 'client' ? `<span class="small-muted">${escapeHtml(appointment.clientName)} · ${escapeHtml(appointment.clientPhone)}</span>` : ''}
        </div>
        <div class="card-actions">${actions}</div>
      </article>
    `;
  }

  function renderStatusButtons(appointment, context) {
    const common = `data-id="${appointment.id}" data-context="${context}"`;
    return `
      <button class="btn slim success" data-action="open-whatsapp" data-target="client" data-id="${appointment.id}">WhatsApp</button>
      <button class="btn slim" data-action="barber-status" ${common} data-status="Confirmado">Confirmar</button>
      <button class="btn slim success" data-action="barber-status" ${common} data-status="Concluído">Concluir</button>
      <button class="btn slim danger" data-action="barber-status" ${common} data-status="Cancelado">Cancelar</button>
      <button class="btn slim danger" data-action="barber-status" ${common} data-status="Não compareceu">Não compareceu</button>
    `;
  }

  function renderBarberDashboard() {
    const items = sortAppointments(state.appointments);
    const dayItems = items.filter((item) => item.date === state.barberAgendaDate);
    const content = `
      ${renderPageHead('Agenda do barbeiro', 'Acompanhe cada atendimento como uma lista do dia.', `
        <div class="row-actions">
          <button class="btn slim ghost" data-action="barber-shift" data-days="-1">Anterior</button>
          <input type="date" value="${state.barberAgendaDate}" data-action="barber-date" aria-label="Data da agenda" />
          <button class="btn slim ghost" data-action="barber-shift" data-days="1">Próximo</button>
        </div>
      `)}
      <div class="segmented">
        <button class="segment ${state.barberView === 'day' ? 'active' : ''}" data-action="barber-view" data-view="day">Dia</button>
        <button class="segment ${state.barberView === 'week' ? 'active' : ''}" data-action="barber-view" data-view="week">Semana</button>
      </div>
      ${state.barberView === 'week' ? renderBarberWeek(items) : renderTodoList(dayItems, state.barberAgendaDate)}
    `;
    return renderShell('Agenda pessoal', state.user.name, content, 'barber');
  }

  function renderBarberWeek(items) {
    const dates = Array.from({ length: 7 }, (_, index) => addDays(state.barberAgendaDate, index));
    return `
      <div class="grid two">
        ${dates.map((date) => {
          const dayItems = items.filter((item) => item.date === date);
          return `<section class="panel"><h3>${formatDate(date, { weekday: 'short', day: '2-digit', month: '2-digit' })}</h3>${renderTodoList(dayItems, date, true)}</section>`;
        }).join('')}
      </div>
    `;
  }

  function renderTodoList(items, date, compact = false) {
    if (!items.length) return `<div class="empty">Nenhum atendimento em ${formatDate(date, { day: '2-digit', month: '2-digit' })}.</div>`;
    return `
      <div class="todo-list">
        ${items.map((appointment) => `
          <article class="todo-item">
            <div class="todo-top">
              <span class="time-badge">${appointment.time}</span>
              <div>
                <strong>${escapeHtml(appointment.clientName)}</strong>
                <span class="small-muted">${escapeHtml(appointment.clientPhone)} · ${escapeHtml(appointment.service)} · ${money(appointment.value)}</span>
              </div>
              <span class="status ${statusClass(appointment.status)}">${escapeHtml(appointment.status)}</span>
            </div>
            ${compact ? '' : `<div class="todo-actions">${renderStatusButtons(appointment, 'barber')}</div>`}
          </article>
        `).join('')}
      </div>
    `;
  }

  function renderAdmin() {
    if (!state.admin) {
      return renderShell('Admin', state.user.name, '<div class="empty">Carregando dados administrativos...</div>', 'admin');
    }
    const tabs = [
      ['dashboard', 'Geral'],
      ['barbers', 'Barbeiros'],
      ['schedule', 'Horários'],
      ['appointments', 'Agenda'],
      ['clients', 'Clientes']
    ];
    const content = `
      ${renderPageHead('Painel admin', 'Gerencie barbeiros, horários, clientes e todos os agendamentos.')}
      <div class="admin-tabs">
        ${tabs.map(([key, label]) => `<button class="btn slim ${state.adminTab === key ? 'primary' : 'ghost'}" data-action="admin-tab" data-tab="${key}">${label}</button>`).join('')}
      </div>
      ${renderAdminTab()}
    `;
    return renderShell('Administração', state.settings?.shopName || 'Barbearia', content, 'admin');
  }

  function renderAdminTab() {
    if (state.adminTab === 'barbers') return renderAdminBarbers();
    if (state.adminTab === 'schedule') return renderAdminSchedule();
    if (state.adminTab === 'appointments') return renderAdminAppointments();
    if (state.adminTab === 'clients') return renderAdminClients();
    return renderAdminDashboard();
  }

  function renderAdminDashboard() {
    const stats = state.admin.stats;
    const todayAppointments = state.admin.appointments.filter((item) => item.date === todayKey() && item.status !== 'Cancelado');
    return `
      <div class="grid four">
        <div class="stat-tile"><strong>${stats.todayAppointments}</strong><span>agendamentos hoje</span></div>
        <div class="stat-tile"><strong>${stats.totalClients}</strong><span>clientes cadastrados</span></div>
        <div class="stat-tile"><strong>${stats.activeBarbers}</strong><span>barbeiros ativos</span></div>
        <div class="stat-tile"><strong>${money(stats.monthRevenue)}</strong><span>receita concluída no mês</span></div>
      </div>
      <div class="admin-layout two-col" style="margin-top:14px">
        ${renderSettingsForm()}
        <section class="list-panel"><h3>Hoje</h3>${todayAppointments.length ? todayAppointments.map((item) => renderAppointmentCard(item, 'admin')).join('') : '<div class="empty">Agenda livre hoje.</div>'}</section>
      </div>
    `;
  }

  function renderSettingsForm() {
    const settings = state.admin.settings || state.settings || {};
    return `
      <form class="form-panel" data-form="admin-settings">
        <h3>Barbearia</h3>
        <div class="form-grid two">
          <label>Nome<input name="shopName" value="${escapeHtml(settings.shopName || '')}" required /></label>
          <label>WhatsApp<input name="whatsapp" value="${escapeHtml(settings.whatsapp || '')}" required /></label>
          <label>Endereço<input name="address" value="${escapeHtml(settings.address || '')}" /></label>
          <label>Serviço padrão<input name="serviceName" value="${escapeHtml(settings.serviceName || 'Corte masculino')}" /></label>
        </div>
        <button class="btn primary full" type="submit">Salvar dados</button>
      </form>
    `;
  }

  function renderAdminBarbers() {
    const editing = state.admin.barbers.find((barber) => barber.id === state.editBarberId);
    return `
      <div class="admin-layout two-col">
        ${renderBarberAdminForm(editing)}
        <section class="list-panel">
          <div class="section-title"><h3>Lista de barbeiros</h3><button class="btn slim ghost" data-action="admin-new-barber">Novo</button></div>
          <div class="grid">
            ${state.admin.barbers.map((barber) => `
              <article class="barber-card">
                <img class="avatar" src="${escapeHtml(barber.avatar || '/assets/avatar-diego.svg')}" alt="Avatar de ${escapeHtml(barber.name)}" />
                <div>
                  <h3 class="card-title">${escapeHtml(barber.name)}</h3>
                  <p class="card-text">${barber.active ? 'Ativo' : 'Inativo'} · ${money(barber.price)} · ${escapeHtml(barber.whatsapp || '')}</p>
                  <div class="card-actions">
                    <button class="btn slim" data-action="admin-edit-barber" data-id="${barber.id}">Editar</button>
                    <button class="btn slim danger" data-action="admin-remove-barber" data-id="${barber.id}">Remover</button>
                  </div>
                </div>
              </article>
            `).join('')}
          </div>
        </section>
      </div>
    `;
  }

  function renderBarberAdminForm(barber) {
    const isEdit = Boolean(barber);
    return `
      <form class="form-panel" data-form="admin-barber">
        <h3>${isEdit ? 'Editar barbeiro' : 'Cadastrar barbeiro'}</h3>
        <input type="hidden" name="id" value="${escapeHtml(barber?.id || '')}" />
        <div class="form-grid two">
          <label>Nome<input name="name" value="${escapeHtml(barber?.name || '')}" required /></label>
          <label>E-mail<input name="email" type="email" value="${escapeHtml(findUserEmail(barber?.userId) || '')}" required /></label>
          <label>Telefone<input name="phone" value="${escapeHtml(findUserPhone(barber?.userId) || barber?.whatsapp || '')}" required /></label>
          <label>Senha<input name="password" type="password" ${isEdit ? '' : 'required'} placeholder="${isEdit ? 'Deixe vazio para manter' : 'Senha inicial'}" /></label>
          <label>Valor<input name="price" type="number" min="1" step="1" value="${escapeHtml(barber?.price || 55)}" /></label>
          <label>WhatsApp<input name="whatsapp" value="${escapeHtml(barber?.whatsapp || '')}" /></label>
        </div>
        <label>Avatar
          <select name="avatar">
            ${['/assets/avatar-marcos.svg', '/assets/avatar-rafael.svg', '/assets/avatar-diego.svg'].map((avatar) => `<option value="${avatar}" ${barber?.avatar === avatar ? 'selected' : ''}>${avatar.split('/').pop().replace('.svg', '')}</option>`).join('')}
          </select>
        </label>
        <label>Descrição<textarea name="description">${escapeHtml(barber?.description || '')}</textarea></label>
        <label class="checkbox-row"><input type="checkbox" name="active" ${barber?.active === false ? '' : 'checked'} /> Ativo</label>
        <button class="btn primary full" type="submit">${isEdit ? 'Salvar barbeiro' : 'Cadastrar barbeiro'}</button>
      </form>
    `;
  }

  function findUserEmail(userId) {
    const barber = state.admin?.barbers?.find((item) => item.userId === userId);
    if (!barber) return '';
    const seed = {
      barber_marcos: 'marcos@barbearia.local',
      barber_rafael: 'rafael@barbearia.local',
      barber_diego: 'diego@barbearia.local'
    };
    return barber?.userEmail || seed[barber.id] || '';
  }

  function findUserPhone(userId) {
    const barber = state.admin?.barbers?.find((item) => item.userId === userId);
    return barber?.userPhone || barber?.whatsapp || '';
  }

  function renderAdminSchedule() {
    const selected = state.admin.barbers.find((barber) => barber.id === state.adminScheduleBarberId) || state.admin.barbers[0];
    if (!selected) return '<div class="empty">Cadastre um barbeiro primeiro.</div>';
    state.adminScheduleBarberId = selected.id;
    const blocks = state.admin.blockedSlots.filter((block) => block.barberId === selected.id).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    return `
      <div class="admin-layout two-col">
        <section class="form-panel">
          <h3>Disponibilidade</h3>
          <label>Barbeiro
            <select data-action="admin-schedule-select">
              ${state.admin.barbers.map((barber) => `<option value="${barber.id}" ${selected.id === barber.id ? 'selected' : ''}>${escapeHtml(barber.name)}</option>`).join('')}
            </select>
          </label>
          ${renderScheduleForm(selected)}
        </section>
        <section class="list-panel">
          <h3>Bloqueios</h3>
          ${renderBlockForm(selected)}
          <div class="grid" style="margin-top:12px">
            ${blocks.length ? blocks.map((block) => `<div class="block-row"><strong>${formatDate(block.date, { day: '2-digit', month: '2-digit', year: 'numeric' })} · ${block.time}</strong><span class="small-muted">${escapeHtml(block.reason)}</span><div class="row-actions"><button class="btn slim danger" data-action="admin-remove-block" data-id="${block.id}">Remover</button></div></div>`).join('') : '<div class="empty">Nenhum horário bloqueado.</div>'}
          </div>
        </section>
      </div>
    `;
  }

  function renderScheduleForm(barber) {
    const byDay = new Map((barber.schedules || []).map((item) => [Number(item.weekday), item]));
    return `
      <form class="form-grid" data-form="admin-schedule">
        <input type="hidden" name="barberId" value="${barber.id}" />
        ${[0, 1, 2, 3, 4, 5, 6].map((weekday) => {
          const row = byDay.get(weekday) || { weekday, start: '09:00', end: '18:00', duration: 45, active: false };
          return `
            <div class="schedule-row">
              <label class="checkbox-row"><input type="checkbox" name="day${weekday}_active" ${row.active ? 'checked' : ''} /> <strong>${weekdayLong[weekday]}</strong></label>
              <div class="form-grid two">
                <label>Início<input name="day${weekday}_start" type="time" value="${row.start}" /></label>
                <label>Fim<input name="day${weekday}_end" type="time" value="${row.end}" /></label>
                <label>Duração<input name="day${weekday}_duration" type="number" min="15" max="180" step="15" value="${row.duration || 45}" /></label>
              </div>
            </div>
          `;
        }).join('')}
        <button class="btn primary full" type="submit">Salvar horários</button>
      </form>
    `;
  }

  function renderBlockForm(barber) {
    return `
      <form class="form-grid" data-form="admin-block">
        <input type="hidden" name="barberId" value="${barber.id}" />
        <div class="form-grid two">
          <label>Data<input name="date" type="date" min="${todayKey()}" required /></label>
          <label>Horário<input name="time" type="time" required /></label>
        </div>
        <label>Motivo<input name="reason" placeholder="Folga, manutenção, intervalo..." /></label>
        <button class="btn full" type="submit">Bloquear horário</button>
      </form>
    `;
  }

  function renderAdminAppointments() {
    const editing = getAppointment(state.editAppointmentId);
    return `
      <div class="grid">
        ${editing ? renderAdminAppointmentForm(editing) : ''}
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Data</th><th>Cliente</th><th>Barbeiro</th><th>Serviço</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              ${sortAppointments(state.admin.appointments).map((item) => `
                <tr>
                  <td>${formatDate(item.date, { day: '2-digit', month: '2-digit', year: 'numeric' })}<br><span class="small-muted">${item.time}</span></td>
                  <td>${escapeHtml(item.clientName)}<br><span class="small-muted">${escapeHtml(item.clientPhone)}</span></td>
                  <td>${escapeHtml(item.barberName)}</td>
                  <td>${escapeHtml(item.service)}<br><span class="small-muted">${money(item.value)}</span></td>
                  <td><span class="status ${statusClass(item.status)}">${escapeHtml(item.status)}</span></td>
                  <td><div class="admin-actions"><button class="btn slim" data-action="admin-edit-appointment" data-id="${item.id}">Editar</button><button class="btn slim danger" data-action="admin-status" data-id="${item.id}" data-status="Cancelado">Cancelar</button></div></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderAdminAppointmentForm(appointment) {
    return `
      <form class="form-panel" data-form="admin-appointment">
        <h3>Editar agendamento</h3>
        <input type="hidden" name="id" value="${appointment.id}" />
        <div class="form-grid two">
          <label>Barbeiro
            <select name="barberId">
              ${state.admin.barbers.filter((barber) => barber.active).map((barber) => `<option value="${barber.id}" ${barber.id === appointment.barberId ? 'selected' : ''}>${escapeHtml(barber.name)}</option>`).join('')}
            </select>
          </label>
          <label>Status
            <select name="status">
              ${statuses.map((status) => `<option value="${status}" ${status === appointment.status ? 'selected' : ''}>${status}</option>`).join('')}
            </select>
          </label>
          <label>Data<input name="date" type="date" value="${appointment.date}" min="${todayKey()}" /></label>
          <label>Horário<input name="time" type="time" value="${appointment.time}" /></label>
          <label>Serviço<input name="service" value="${escapeHtml(appointment.service || '')}" /></label>
        </div>
        <label>Observações<textarea name="notes">${escapeHtml(appointment.notes || '')}</textarea></label>
        <div class="row-actions"><button class="btn primary" type="submit">Salvar edição</button><button class="btn ghost" type="button" data-action="admin-cancel-edit">Fechar</button></div>
      </form>
    `;
  }

  function renderAdminClients() {
    return `
      <div class="grid three">
        ${state.admin.clients.map((client) => `
          <article class="client-row">
            <strong>${escapeHtml(client.name)}</strong>
            <span class="small-muted">${escapeHtml(client.email)}</span>
            <span class="small-muted">${escapeHtml(client.phone)}</span>
            <div class="pills"><span class="pill">${client.appointmentsCount} agendamentos</span></div>
          </article>
        `).join('')}
      </div>
    `;
  }

  function renderModal() {
    if (!state.modal) return '';
    if (state.modal.type === 'whatsapp') {
      const appointment = getAppointment(state.modal.appointmentId) || state.appointments.find((item) => item.id === state.modal.appointmentId);
      if (!appointment) return '';
      return `
        <div class="modal-backdrop" data-action="close-modal">
          <div class="modal" role="dialog" aria-modal="true" aria-labelledby="whatsapp-title" data-stop="true">
            <h3 id="whatsapp-title">Mensagem de WhatsApp</h3>
            <div class="message-preview">${escapeHtml(appointmentMessage(appointment))}</div>
            <div class="row-actions">
              <button class="btn primary" data-action="open-whatsapp" data-id="${appointment.id}" data-target="barber">Enviar pelo WhatsApp</button>
              <button class="btn ghost" data-action="close-modal">Fechar</button>
            </div>
          </div>
        </div>
      `;
    }
    return '';
  }

  function render() {
    document.body.classList.toggle('modal-open', Boolean(state.modal));
    if (!state.user) {
      root.innerHTML = state.view === 'auth' ? renderAuth() : renderHome();
      return;
    }
    if (state.view === 'client-history') root.innerHTML = renderClientHistory();
    else if (state.view === 'barber-profile') root.innerHTML = renderBarberProfile();
    else if (state.view === 'booking') root.innerHTML = renderBooking();
    else if (state.view === 'confirmation') root.innerHTML = renderConfirmation();
    else if (state.user.role === 'barber') root.innerHTML = renderBarberDashboard();
    else if (state.user.role === 'admin') root.innerHTML = renderAdmin();
    else root.innerHTML = renderClientDashboard();
  }

  async function handleAction(action, element) {
    if (action === 'go-home') {
      state.view = 'home';
      render();
    }
    if (action === 'show-login') {
      state.view = 'auth';
      state.authMode = 'login';
      render();
    }
    if (action === 'show-register') {
      state.view = 'auth';
      state.authMode = 'register';
      render();
    }
    if (action === 'auth-mode') {
      state.authMode = element.dataset.mode;
      render();
    }
    if (action === 'start-booking') {
      if (!state.user) {
        state.view = 'auth';
        state.authMode = 'login';
      } else if (state.user.role === 'client') {
        state.view = 'client-dashboard';
      } else {
        routeAfterLogin();
      }
      render();
    }
    if (action === 'demo-login') await login(element.dataset.email, element.dataset.password);
    if (action === 'logout') await logout();
    if (action === 'client-nav') {
      state.view = element.dataset.view || 'client-dashboard';
      render();
      if (element.dataset.focus === 'barbers') setTimeout(() => document.getElementById('barbers-section')?.scrollIntoView({ behavior: 'smooth' }), 30);
    }
    if (action === 'scroll-barbers') document.getElementById('barbers-section')?.scrollIntoView({ behavior: 'smooth' });
    if (action === 'open-barber') {
      state.selectedBarberId = element.dataset.id;
      state.view = 'barber-profile';
      render();
    }
    if (action === 'open-booking') {
      if (!state.user) {
        state.view = 'auth';
        state.authMode = 'login';
        render();
        return;
      }
      if (state.user.role !== 'client') {
        toast('Use uma conta de cliente para agendar.', 'error');
        return;
      }
      state.selectedBarberId = element.dataset.id;
      state.selectedDate = todayKey();
      state.selectedTime = '';
      state.rescheduleId = '';
      state.view = 'booking';
      await loadAvailability();
    }
    if (action === 'select-date') {
      state.selectedDate = element.dataset.date;
      state.selectedTime = '';
      await loadAvailability();
    }
    if (action === 'select-time') {
      state.selectedTime = element.dataset.time;
      render();
    }
    if (action === 'confirm-booking') await confirmBooking();
    if (action === 'cancel-appointment') {
      if (!confirm('Cancelar este agendamento?')) return;
      await api(`/api/appointments/${element.dataset.id}`, { method: 'PATCH', body: { status: 'Cancelado' } });
      await refreshAll();
      toast('Agendamento cancelado.');
      render();
    }
    if (action === 'reschedule-appointment') {
      const appointment = getAppointment(element.dataset.id);
      if (!appointment) return;
      state.rescheduleId = appointment.id;
      state.selectedBarberId = appointment.barberId;
      state.selectedDate = appointment.date >= todayKey() ? appointment.date : todayKey();
      state.selectedTime = '';
      state.view = 'booking';
      await loadAvailability();
    }
    if (action === 'whatsapp-modal') {
      state.modal = { type: 'whatsapp', appointmentId: element.dataset.id };
      render();
    }
    if (action === 'open-whatsapp') {
      const appointment = getAppointment(element.dataset.id);
      if (!appointment) return;
      window.open(whatsappLink(appointment, element.dataset.target || 'barber'), '_blank', 'noopener');
    }
    if (action === 'close-modal') {
      state.modal = null;
      render();
    }
    if (action === 'barber-view') {
      state.barberView = element.dataset.view;
      render();
    }
    if (action === 'barber-today') {
      state.barberAgendaDate = todayKey();
      state.barberView = 'day';
      render();
    }
    if (action === 'barber-shift') {
      state.barberAgendaDate = addDays(state.barberAgendaDate, Number(element.dataset.days || 0));
      render();
    }
    if (action === 'barber-status') {
      await api(`/api/appointments/${element.dataset.id}`, { method: 'PATCH', body: { status: element.dataset.status } });
      await refreshAll();
      toast('Status atualizado.');
      render();
    }
    if (action === 'admin-tab') {
      state.adminTab = element.dataset.tab;
      await loadAdmin(false);
      render();
    }
    if (action === 'admin-new-barber') {
      state.editBarberId = '';
      render();
    }
    if (action === 'admin-edit-barber') {
      state.editBarberId = element.dataset.id;
      render();
    }
    if (action === 'admin-remove-barber') {
      if (!confirm('Remover este barbeiro da agenda ativa?')) return;
      await api(`/api/admin/barbers/${element.dataset.id}`, { method: 'DELETE' });
      await refreshAll();
      toast('Barbeiro removido da agenda ativa.');
      render();
    }
    if (action === 'admin-remove-block') {
      await api(`/api/admin/blocks/${element.dataset.id}`, { method: 'DELETE' });
      await refreshAll();
      toast('Bloqueio removido.');
      render();
    }
    if (action === 'admin-edit-appointment') {
      state.editAppointmentId = element.dataset.id;
      render();
    }
    if (action === 'admin-cancel-edit') {
      state.editAppointmentId = '';
      render();
    }
    if (action === 'admin-status') {
      await api(`/api/appointments/${element.dataset.id}`, { method: 'PATCH', body: { status: element.dataset.status } });
      await refreshAll();
      toast('Agendamento atualizado.');
      render();
    }
  }

  async function handleSubmit(form) {
    const name = form.dataset.form;
    const data = formData(form);

    if (name === 'login') {
      await login(data.email, data.password);
      return;
    }

    if (name === 'register') {
      if (data.password !== data.confirmPassword) throw new Error('As senhas não conferem.');
      const response = await api('/api/auth/register', { method: 'POST', body: data });
      state.token = response.token;
      localStorage.setItem(TOKEN_KEY, response.token);
      await refreshAll();
      routeAfterLogin();
      toast('Cadastro criado com sucesso.');
      render();
      return;
    }

    if (name === 'admin-settings') {
      await api('/api/admin/settings', { method: 'PUT', body: data });
      await refreshAll();
      toast('Dados da barbearia salvos.');
      render();
      return;
    }

    if (name === 'admin-barber') {
      const payload = { ...data, active: Boolean(data.active) };
      const barberId = data.id;
      if (barberId) {
        await api(`/api/admin/barbers/${barberId}`, { method: 'PUT', body: payload });
      } else {
        await api('/api/admin/barbers', { method: 'POST', body: payload });
      }
      state.editBarberId = '';
      await refreshAll();
      toast('Barbeiro salvo.');
      render();
      return;
    }

    if (name === 'admin-schedule') {
      const schedules = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        active: Boolean(data[`day${weekday}_active`]),
        start: data[`day${weekday}_start`],
        end: data[`day${weekday}_end`],
        duration: Number(data[`day${weekday}_duration`] || 45)
      }));
      await api(`/api/admin/barbers/${data.barberId}`, { method: 'PUT', body: { schedules } });
      await refreshAll();
      toast('Horários atualizados.');
      render();
      return;
    }

    if (name === 'admin-block') {
      await api('/api/admin/blocks', { method: 'POST', body: data });
      await refreshAll();
      toast('Horário bloqueado.');
      render();
      return;
    }

    if (name === 'admin-appointment') {
      await api(`/api/appointments/${data.id}`, { method: 'PATCH', body: data });
      state.editAppointmentId = '';
      await refreshAll();
      toast('Agendamento editado.');
      render();
    }
  }

  document.addEventListener('click', async (event) => {
    const stopBox = event.target.closest('[data-stop="true"]');
    if (stopBox) event.stopPropagation();
    const element = event.target.closest('[data-action]');
    if (!element) return;
    const action = element.dataset.action;
    if (action !== 'close-modal') event.preventDefault();
    try {
      await handleAction(action, element);
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    try {
      await handleSubmit(form);
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  document.addEventListener('change', async (event) => {
    const element = event.target.closest('[data-action]');
    if (!element) return;
    try {
      if (element.dataset.action === 'register-role') {
        state.registerRole = element.value;
        render();
      }
      if (element.dataset.action === 'barber-date') {
        state.barberAgendaDate = element.value || todayKey();
        render();
      }
      if (element.dataset.action === 'admin-schedule-select') {
        state.adminScheduleBarberId = element.value;
        render();
      }
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  async function init() {
    try {
      await refreshAll();
      if (state.user) routeAfterLogin();
    } catch (error) {
      state.token = '';
      localStorage.removeItem(TOKEN_KEY);
      state.view = 'home';
    }
    render();
  }

  init();
})();