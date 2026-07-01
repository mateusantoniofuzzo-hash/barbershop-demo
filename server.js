const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT || 3000);

const STATUS = ['Agendado', 'Confirmado', 'Concluído', 'Cancelado', 'Não compareceu'];
const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function localDate(date = new Date()) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 10);
}

function dateForWeekday(weekday, minDaysAhead = 1) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + minDaysAhead);
  while (date.getDay() !== weekday) date.setDate(date.getDate() + 1);
  return localDate(date);
}

function cleanEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function cleanPhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function whatsappNumber(phone) {
  const digits = cleanPhone(phone);
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[2], 'hex');
  const actual = crypto.scryptSync(String(password), parts[1], 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function scheduleRows(barberId, weekdays, start, end, duration) {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    id: id('slot'),
    barberId,
    weekday,
    start: weekdays.includes(weekday) ? start : '09:00',
    end: weekdays.includes(weekday) ? end : '18:00',
    duration: Number(duration || 45),
    active: weekdays.includes(weekday),
    createdAt: nowIso()
  }));
}

function seedDatabase() {
  const createdAt = nowIso();
  const adminId = 'user_admin';
  const clientId = 'user_client_demo';
  const clientProfileId = 'client_demo';
  const barberUser1 = 'user_barber_marcos';
  const barberUser2 = 'user_barber_rafael';
  const barberUser3 = 'user_barber_diego';
  const barber1 = 'barber_marcos';
  const barber2 = 'barber_rafael';
  const barber3 = 'barber_diego';

  const db = {
    settings: {
      shopName: 'Barbearia Prime',
      whatsapp: '5511999999999',
      address: 'Rua das Navalhas, 120',
      serviceName: 'Corte masculino',
      defaultDuration: 45
    },
    users: [
      { id: adminId, name: 'Admin Prime', email: 'admin@barbearia.local', phone: '11999999999', passwordHash: hashPassword('Admin123!'), role: 'admin', active: true, createdAt },
      { id: clientId, name: 'João Cliente', email: 'cliente@barbearia.local', phone: '11988887777', passwordHash: hashPassword('Cliente123!'), role: 'client', active: true, createdAt },
      { id: barberUser1, name: 'Marcos Silva', email: 'marcos@barbearia.local', phone: '11977776666', passwordHash: hashPassword('Barber123!'), role: 'barber', active: true, createdAt },
      { id: barberUser2, name: 'Rafael Costa', email: 'rafael@barbearia.local', phone: '11966665555', passwordHash: hashPassword('Barber123!'), role: 'barber', active: true, createdAt },
      { id: barberUser3, name: 'Diego Lima', email: 'diego@barbearia.local', phone: '11955554444', passwordHash: hashPassword('Barber123!'), role: 'barber', active: true, createdAt }
    ],
    clients: [
      { id: clientProfileId, userId: clientId, name: 'João Cliente', phone: '11988887777', email: 'cliente@barbearia.local', createdAt }
    ],
    barbers: [
      { id: barber1, userId: barberUser1, name: 'Marcos Silva', avatar: '/assets/avatar-marcos.svg', description: 'Cortes clássicos, degradê limpo e barba desenhada.', price: 55, whatsapp: '5511977776666', active: true, createdAt },
      { id: barber2, userId: barberUser2, name: 'Rafael Costa', avatar: '/assets/avatar-rafael.svg', description: 'Especialista em freestyle discreto, navalhado e acabamento premium.', price: 65, whatsapp: '5511966665555', active: true, createdAt },
      { id: barber3, userId: barberUser3, name: 'Diego Lima', avatar: '/assets/avatar-diego.svg', description: 'Atendimento rápido para corte social, barba e manutenção semanal.', price: 50, whatsapp: '5511955554444', active: true, createdAt }
    ],
    schedules: [
      ...scheduleRows(barber1, [1, 2, 3, 4, 5, 6], '09:00', '18:00', 45),
      ...scheduleRows(barber2, [2, 3, 4, 5, 6], '10:00', '19:00', 45),
      ...scheduleRows(barber3, [1, 3, 5, 6], '08:30', '17:30', 30)
    ],
    blockedSlots: [
      { id: 'block_lunch_marcos', barberId: barber1, date: dateForWeekday(3), time: '12:00', reason: 'Intervalo', createdAt }
    ],
    appointments: [
      { id: 'appt_demo_1', clientId: clientProfileId, barberId: barber1, date: dateForWeekday(2), time: '10:30', value: 55, service: 'Corte masculino', status: 'Confirmado', notes: 'Cliente demo', createdAt },
      { id: 'appt_demo_2', clientId: clientProfileId, barberId: barber2, date: dateForWeekday(5), time: '14:30', value: 65, service: 'Corte + barba', status: 'Agendado', notes: '', createdAt }
    ],
    sessions: []
  };

  return db;
}

function ensureDatabase() {
  ensureDir(DATA_DIR);
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(seedDatabase(), null, 2));
  }
}

function readDb() {
  ensureDatabase();
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDb(db) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function safeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt
  };
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function fail(res, status, message, details = {}) {
  return sendJson(res, status, { error: message, ...details });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Payload muito grande.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

function getToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  const cookie = req.headers.cookie || '';
  const tokenCookie = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('prime_token='));
  return tokenCookie ? decodeURIComponent(tokenCookie.split('=').slice(1).join('=')) : '';
}

function getAuth(req, db) {
  const token = getToken(req);
  if (!token) return null;
  const session = db.sessions.find((item) => item.token === token);
  if (!session) return null;
  const user = db.users.find((item) => item.id === session.userId && item.active !== false);
  if (!user) return null;
  return { token, session, user };
}

function requireAuth(req, res, db, roles = []) {
  const auth = getAuth(req, db);
  if (!auth) {
    fail(res, 401, 'Faça login para continuar.');
    return null;
  }
  if (roles.length && !roles.includes(auth.user.role)) {
    fail(res, 403, 'Você não tem permissão para acessar esta área.');
    return null;
  }
  return auth;
}

function clientForUser(db, userId) {
  return db.clients.find((client) => client.userId === userId);
}

function barberForUser(db, userId) {
  return db.barbers.find((barber) => barber.userId === userId);
}

function toMinutes(time) {
  const [hours, minutes] = String(time || '').split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  return hours * 60 + minutes;
}

function fromMinutes(value) {
  const hours = String(Math.floor(value / 60)).padStart(2, '0');
  const minutes = String(value % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime());
}

function weekdayForDate(date) {
  return new Date(`${date}T12:00:00`).getDay();
}

function isCanceled(status) {
  return status === 'Cancelado';
}

function generateSlots(db, barberId, date, ignoreAppointmentId = '') {
  if (!isDate(date)) return [];
  const barber = db.barbers.find((item) => item.id === barberId && item.active !== false);
  if (!barber) return [];
  const weekday = weekdayForDate(date);
  const schedules = db.schedules
    .filter((item) => item.barberId === barberId && item.weekday === weekday && item.active)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const slots = [];
  const seen = new Set();

  for (const schedule of schedules) {
    const start = toMinutes(schedule.start);
    const end = toMinutes(schedule.end);
    const duration = Number(schedule.duration || db.settings.defaultDuration || 45);
    if (start === null || end === null || duration < 15 || start >= end) continue;
    for (let minute = start; minute + duration <= end; minute += duration) {
      const time = fromMinutes(minute);
      if (seen.has(time)) continue;
      seen.add(time);
      const block = db.blockedSlots.find((item) => item.barberId === barberId && item.date === date && item.time === time);
      const appointment = db.appointments.find((item) => item.id !== ignoreAppointmentId && item.barberId === barberId && item.date === date && item.time === time && !isCanceled(item.status));
      slots.push({
        time,
        available: !block && !appointment,
        reason: block ? (block.reason || 'Bloqueado') : appointment ? 'Ocupado' : 'Livre'
      });
    }
  }

  return slots.sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
}

function slotIsAvailable(db, barberId, date, time, ignoreAppointmentId = '') {
  return generateSlots(db, barberId, date, ignoreAppointmentId).some((slot) => slot.time === time && slot.available);
}

function publicBarber(db, barber) {
  const schedules = db.schedules
    .filter((item) => item.barberId === barber.id)
    .sort((a, b) => a.weekday - b.weekday)
    .map((item) => ({
      id: item.id,
      weekday: item.weekday,
      day: WEEKDAYS[item.weekday],
      start: item.start,
      end: item.end,
      duration: item.duration,
      active: item.active
    }));
  return {
    id: barber.id,
    userId: barber.userId,
    name: barber.name,
    avatar: barber.avatar,
    description: barber.description,
    price: barber.price,
    whatsapp: barber.whatsapp,
    active: barber.active !== false,
    schedules,
    workingDays: schedules.filter((item) => item.active).map((item) => item.day)
  };
}

function enrichedAppointment(db, appointment) {
  const client = db.clients.find((item) => item.id === appointment.clientId);
  const barber = db.barbers.find((item) => item.id === appointment.barberId);
  return {
    ...appointment,
    clientName: client?.name || 'Cliente removido',
    clientPhone: client?.phone || '',
    clientEmail: client?.email || '',
    barberName: barber?.name || 'Barbeiro removido',
    barberAvatar: barber?.avatar || '',
    barberWhatsapp: barber?.whatsapp || db.settings.whatsapp,
    service: appointment.service || db.settings.serviceName || 'Corte masculino'
  };
}

function visibleAppointments(db, user) {
  if (user.role === 'admin') return db.appointments.map((item) => enrichedAppointment(db, item));
  if (user.role === 'barber') {
    const barber = barberForUser(db, user.id);
    if (!barber) return [];
    return db.appointments.filter((item) => item.barberId === barber.id).map((item) => enrichedAppointment(db, item));
  }
  const client = clientForUser(db, user.id);
  if (!client) return [];
  return db.appointments.filter((item) => item.clientId === client.id).map((item) => enrichedAppointment(db, item));
}

function validateUserFields(body, requirePassword = true) {
  const name = String(body.name || '').trim();
  const email = cleanEmail(body.email);
  const phone = cleanPhone(body.phone);
  const password = String(body.password || '');
  if (name.length < 3) return 'Informe um nome com pelo menos 3 letras.';
  if (!/^\S+@\S+\.\S+$/.test(email)) return 'Informe um e-mail válido.';
  if (phone.length < 10) return 'Informe um telefone válido com DDD.';
  if (requirePassword && password.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
  return '';
}

function normalizeSchedules(input, existing = []) {
  const incoming = Array.isArray(input) ? input : [];
  const byDay = new Map(existing.map((item) => [Number(item.weekday), item]));
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const source = incoming.find((item) => Number(item.weekday) === weekday) || byDay.get(weekday) || {};
    const start = /^\d{2}:\d{2}$/.test(String(source.start || '')) ? source.start : '09:00';
    const end = /^\d{2}:\d{2}$/.test(String(source.end || '')) ? source.end : '18:00';
    const duration = Math.max(15, Math.min(180, Number(source.duration || 45)));
    return {
      weekday,
      start,
      end,
      duration,
      active: Boolean(source.active)
    };
  });
}

function updateSchedules(db, barberId, incoming) {
  const existing = db.schedules.filter((item) => item.barberId === barberId);
  const normalized = normalizeSchedules(incoming, existing);
  db.schedules = db.schedules.filter((item) => item.barberId !== barberId);
  db.schedules.push(...normalized.map((item) => ({
    id: id('slot'),
    barberId,
    weekday: item.weekday,
    start: item.start,
    end: item.end,
    duration: item.duration,
    active: item.active,
    createdAt: nowIso()
  })));
}

function appointmentsSorted(items) {
  return [...items].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

async function handleApi(req, res, pathname, query) {
  let db = readDb();

  if (req.method === 'GET' && pathname === '/api/bootstrap') {
    const auth = getAuth(req, db);
    const user = auth ? safeUser(auth.user) : null;
    return sendJson(res, 200, {
      settings: db.settings,
      user,
      barbers: db.barbers.filter((item) => item.active !== false).map((item) => publicBarber(db, item)),
      appointments: auth ? appointmentsSorted(visibleAppointments(db, auth.user)) : []
    });
  }

  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const body = await readBody(req);
    const role = body.role === 'barber' ? 'barber' : 'client';
    const error = validateUserFields(body, true);
    if (error) return fail(res, 422, error);
    const email = cleanEmail(body.email);
    if (db.users.some((item) => item.email === email)) return fail(res, 409, 'Este e-mail já está cadastrado.');

    const user = {
      id: id('user'),
      name: String(body.name).trim(),
      email,
      phone: cleanPhone(body.phone),
      passwordHash: hashPassword(body.password),
      role,
      active: true,
      createdAt: nowIso()
    };
    db.users.push(user);

    if (role === 'barber') {
      const barberId = id('barber');
      db.barbers.push({
        id: barberId,
        userId: user.id,
        name: user.name,
        avatar: '/assets/avatar-diego.svg',
        description: String(body.description || 'Barbeiro da equipe').trim(),
        price: Number(body.price || 50),
        whatsapp: whatsappNumber(body.whatsapp || body.phone),
        active: true,
        createdAt: nowIso()
      });
      db.schedules.push(...scheduleRows(barberId, [2, 3, 4, 5, 6], '09:00', '18:00', 45));
    } else {
      db.clients.push({
        id: id('client'),
        userId: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        createdAt: nowIso()
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    db.sessions.push({ token, userId: user.id, createdAt: nowIso() });
    writeDb(db);
    return sendJson(res, 201, { token, user: safeUser(user) });
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await readBody(req);
    const email = cleanEmail(body.email);
    const user = db.users.find((item) => item.email === email && item.active !== false);
    if (!user || !verifyPassword(body.password, user.passwordHash)) return fail(res, 401, 'E-mail ou senha inválidos.');
    const token = crypto.randomBytes(32).toString('hex');
    db.sessions.push({ token, userId: user.id, createdAt: nowIso() });
    writeDb(db);
    return sendJson(res, 200, { token, user: safeUser(user) });
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const auth = getAuth(req, db);
    if (auth) {
      db.sessions = db.sessions.filter((item) => item.token !== auth.token);
      writeDb(db);
    }
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/me') {
    const auth = requireAuth(req, res, db);
    if (!auth) return;
    return sendJson(res, 200, { user: safeUser(auth.user), appointments: appointmentsSorted(visibleAppointments(db, auth.user)) });
  }

  if (req.method === 'GET' && pathname === '/api/barbers') {
    return sendJson(res, 200, { barbers: db.barbers.filter((item) => item.active !== false).map((item) => publicBarber(db, item)) });
  }

  const parts = pathname.split('/').filter(Boolean);

  if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'barbers' && parts[3] === 'availability') {
    const barberId = parts[2];
    const date = query.get('date') || localDate();
    const barber = db.barbers.find((item) => item.id === barberId && item.active !== false);
    if (!barber) return fail(res, 404, 'Barbeiro não encontrado.');
    return sendJson(res, 200, { barber: publicBarber(db, barber), date, slots: generateSlots(db, barberId, date) });
  }

  if (req.method === 'GET' && pathname === '/api/appointments') {
    const auth = requireAuth(req, res, db);
    if (!auth) return;
    return sendJson(res, 200, { appointments: appointmentsSorted(visibleAppointments(db, auth.user)) });
  }

  if (req.method === 'POST' && pathname === '/api/appointments') {
    const auth = requireAuth(req, res, db, ['client', 'admin']);
    if (!auth) return;
    const body = await readBody(req);
    const barber = db.barbers.find((item) => item.id === body.barberId && item.active !== false);
    if (!barber) return fail(res, 404, 'Barbeiro não encontrado ou inativo.');
    if (!isDate(body.date)) return fail(res, 422, 'Escolha uma data válida.');
    if (body.date < localDate()) return fail(res, 422, 'Escolha uma data atual ou futura.');
    if (!/^\d{2}:\d{2}$/.test(String(body.time || ''))) return fail(res, 422, 'Escolha um horário válido.');
    if (!slotIsAvailable(db, barber.id, body.date, body.time)) return fail(res, 409, 'Este horário não está disponível.');

    let client = clientForUser(db, auth.user.id);
    if (auth.user.role === 'admin' && body.clientId) client = db.clients.find((item) => item.id === body.clientId);
    if (!client) return fail(res, 422, 'Cliente não encontrado.');

    const appointment = {
      id: id('appt'),
      clientId: client.id,
      barberId: barber.id,
      date: body.date,
      time: body.time,
      value: Number(barber.price),
      service: String(body.service || db.settings.serviceName || 'Corte masculino').trim(),
      status: 'Agendado',
      notes: String(body.notes || '').trim(),
      createdAt: nowIso()
    };
    db.appointments.push(appointment);
    writeDb(db);
    return sendJson(res, 201, { appointment: enrichedAppointment(db, appointment) });
  }

  if (req.method === 'PATCH' && parts[0] === 'api' && parts[1] === 'appointments' && parts[3] === 'reschedule') {
    const auth = requireAuth(req, res, db, ['client', 'admin']);
    if (!auth) return;
    const appointment = db.appointments.find((item) => item.id === parts[2]);
    if (!appointment) return fail(res, 404, 'Agendamento não encontrado.');
    if (auth.user.role === 'client') {
      const client = clientForUser(db, auth.user.id);
      if (!client || appointment.clientId !== client.id) return fail(res, 403, 'Você só pode remarcar seus próprios agendamentos.');
    }
    if (['Concluído', 'Cancelado', 'Não compareceu'].includes(appointment.status)) return fail(res, 422, 'Este agendamento não pode ser remarcado.');
    const body = await readBody(req);
    const barberId = body.barberId || appointment.barberId;
    if (!isDate(body.date)) return fail(res, 422, 'Escolha uma data válida.');
    if (body.date < localDate()) return fail(res, 422, 'Escolha uma data atual ou futura.');
    if (!/^\d{2}:\d{2}$/.test(String(body.time || ''))) return fail(res, 422, 'Escolha um horário válido.');
    if (!slotIsAvailable(db, barberId, body.date, body.time, appointment.id)) return fail(res, 409, 'Este horário não está disponível.');
    const barber = db.barbers.find((item) => item.id === barberId && item.active !== false);
    if (!barber) return fail(res, 404, 'Barbeiro não encontrado.');
    appointment.barberId = barberId;
    appointment.date = body.date;
    appointment.time = body.time;
    appointment.value = Number(barber.price);
    appointment.status = 'Agendado';
    appointment.notes = String(body.notes ?? appointment.notes ?? '').trim();
    appointment.updatedAt = nowIso();
    writeDb(db);
    return sendJson(res, 200, { appointment: enrichedAppointment(db, appointment) });
  }

  if (req.method === 'PATCH' && parts[0] === 'api' && parts[1] === 'appointments' && parts.length === 3) {
    const auth = requireAuth(req, res, db);
    if (!auth) return;
    const appointment = db.appointments.find((item) => item.id === parts[2]);
    if (!appointment) return fail(res, 404, 'Agendamento não encontrado.');
    const body = await readBody(req);

    if (body.status) {
      if (!STATUS.includes(body.status)) return fail(res, 422, 'Status inválido.');
      if (auth.user.role === 'client') {
        const client = clientForUser(db, auth.user.id);
        if (!client || appointment.clientId !== client.id || body.status !== 'Cancelado') return fail(res, 403, 'Clientes só podem cancelar os próprios agendamentos.');
      }
      if (auth.user.role === 'barber') {
        const barber = barberForUser(db, auth.user.id);
        if (!barber || appointment.barberId !== barber.id) return fail(res, 403, 'Barbeiros só podem alterar a própria agenda.');
      }
      appointment.status = body.status;
    }

    if (auth.user.role === 'admin') {
      const barberId = body.barberId || appointment.barberId;
      if (body.date || body.time || body.barberId) {
        const date = body.date || appointment.date;
        const time = body.time || appointment.time;
        if (!isDate(date) || !/^\d{2}:\d{2}$/.test(String(time))) return fail(res, 422, 'Data ou horário inválido.');
        if (!slotIsAvailable(db, barberId, date, time, appointment.id)) return fail(res, 409, 'Este horário não está disponível.');
        const barber = db.barbers.find((item) => item.id === barberId && item.active !== false);
        if (!barber) return fail(res, 404, 'Barbeiro não encontrado.');
        appointment.barberId = barberId;
        appointment.date = date;
        appointment.time = time;
        appointment.value = Number(barber.price);
      }
      if (body.notes !== undefined) appointment.notes = String(body.notes || '').trim();
      if (body.service !== undefined) appointment.service = String(body.service || db.settings.serviceName).trim();
    }

    appointment.updatedAt = nowIso();
    writeDb(db);
    return sendJson(res, 200, { appointment: enrichedAppointment(db, appointment) });
  }

  if (req.method === 'GET' && pathname === '/api/admin/dashboard') {
    const auth = requireAuth(req, res, db, ['admin']);
    if (!auth) return;
    const today = localDate();
    const allAppointments = db.appointments.map((item) => enrichedAppointment(db, item));
    return sendJson(res, 200, {
      settings: db.settings,
      stats: {
        todayAppointments: allAppointments.filter((item) => item.date === today && !isCanceled(item.status)).length,
        totalClients: db.clients.length,
        activeBarbers: db.barbers.filter((item) => item.active !== false).length,
        monthRevenue: allAppointments.filter((item) => item.status === 'Concluído' && item.date.slice(0, 7) === today.slice(0, 7)).reduce((sum, item) => sum + Number(item.value || 0), 0)
      },
      barbers: db.barbers.map((item) => {
        const user = db.users.find((candidate) => candidate.id === item.userId);
        return { ...publicBarber(db, item), userEmail: user?.email || '', userPhone: user?.phone || '' };
      }),
      clients: db.clients.map((client) => ({
        ...client,
        appointmentsCount: db.appointments.filter((item) => item.clientId === client.id).length
      })),
      appointments: appointmentsSorted(allAppointments),
      blockedSlots: db.blockedSlots
    });
  }

  if (req.method === 'PUT' && pathname === '/api/admin/settings') {
    const auth = requireAuth(req, res, db, ['admin']);
    if (!auth) return;
    const body = await readBody(req);
    db.settings = {
      ...db.settings,
      shopName: String(body.shopName || db.settings.shopName).trim(),
      whatsapp: whatsappNumber(body.whatsapp || db.settings.whatsapp),
      address: String(body.address || db.settings.address || '').trim(),
      serviceName: String(body.serviceName || db.settings.serviceName || 'Corte masculino').trim(),
      defaultDuration: Number(body.defaultDuration || db.settings.defaultDuration || 45)
    };
    writeDb(db);
    return sendJson(res, 200, { settings: db.settings });
  }

  if (req.method === 'POST' && pathname === '/api/admin/barbers') {
    const auth = requireAuth(req, res, db, ['admin']);
    if (!auth) return;
    const body = await readBody(req);
    const error = validateUserFields(body, true);
    if (error) return fail(res, 422, error);
    const email = cleanEmail(body.email);
    if (db.users.some((item) => item.email === email)) return fail(res, 409, 'Este e-mail já está cadastrado.');
    const user = {
      id: id('user'),
      name: String(body.name).trim(),
      email,
      phone: cleanPhone(body.phone),
      passwordHash: hashPassword(body.password),
      role: 'barber',
      active: true,
      createdAt: nowIso()
    };
    const barber = {
      id: id('barber'),
      userId: user.id,
      name: user.name,
      avatar: String(body.avatar || '/assets/avatar-diego.svg').trim(),
      description: String(body.description || '').trim(),
      price: Number(body.price || 50),
      whatsapp: whatsappNumber(body.whatsapp || body.phone),
      active: body.active !== false,
      createdAt: nowIso()
    };
    db.users.push(user);
    db.barbers.push(barber);
    updateSchedules(db, barber.id, body.schedules || scheduleRows(barber.id, [2, 3, 4, 5, 6], '09:00', '18:00', 45));
    writeDb(db);
    return sendJson(res, 201, { barber: publicBarber(db, barber) });
  }

  if ((req.method === 'PUT' || req.method === 'DELETE') && parts[0] === 'api' && parts[1] === 'admin' && parts[2] === 'barbers') {
    const auth = requireAuth(req, res, db, ['admin']);
    if (!auth) return;
    const barber = db.barbers.find((item) => item.id === parts[3]);
    if (!barber) return fail(res, 404, 'Barbeiro não encontrado.');

    if (req.method === 'DELETE') {
      barber.active = false;
      const user = db.users.find((item) => item.id === barber.userId);
      if (user) user.active = false;
      barber.updatedAt = nowIso();
      writeDb(db);
      return sendJson(res, 200, { barber: publicBarber(db, barber) });
    }

    const body = await readBody(req);
    const user = db.users.find((item) => item.id === barber.userId);
    const name = String(body.name || barber.name).trim();
    const email = cleanEmail(body.email || user?.email || '');
    if (name.length < 3) return fail(res, 422, 'Informe um nome válido.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail(res, 422, 'Informe um e-mail válido.');
    if (db.users.some((item) => item.id !== barber.userId && item.email === email)) return fail(res, 409, 'Este e-mail já está cadastrado.');

    barber.name = name;
    barber.description = String(body.description || '').trim();
    barber.price = Number(body.price || barber.price || 50);
    barber.whatsapp = whatsappNumber(body.whatsapp || barber.whatsapp || user?.phone || '');
    barber.avatar = String(body.avatar || barber.avatar || '/assets/avatar-diego.svg').trim();
    barber.active = body.active !== false;
    barber.updatedAt = nowIso();
    if (user) {
      user.name = name;
      user.email = email;
      user.phone = cleanPhone(body.phone || user.phone || barber.whatsapp);
      user.active = barber.active;
      if (body.password) {
        if (String(body.password).length < 6) return fail(res, 422, 'A senha precisa ter pelo menos 6 caracteres.');
        user.passwordHash = hashPassword(body.password);
      }
    }
    if (Array.isArray(body.schedules)) updateSchedules(db, barber.id, body.schedules);
    writeDb(db);
    return sendJson(res, 200, { barber: publicBarber(db, barber) });
  }

  if (req.method === 'POST' && pathname === '/api/admin/blocks') {
    const auth = requireAuth(req, res, db, ['admin']);
    if (!auth) return;
    const body = await readBody(req);
    if (!db.barbers.some((item) => item.id === body.barberId)) return fail(res, 404, 'Barbeiro não encontrado.');
    if (!isDate(body.date) || !/^\d{2}:\d{2}$/.test(String(body.time || ''))) return fail(res, 422, 'Informe data e horário válidos.');
    if (db.blockedSlots.some((item) => item.barberId === body.barberId && item.date === body.date && item.time === body.time)) return fail(res, 409, 'Este horário já está bloqueado.');
    const block = { id: id('block'), barberId: body.barberId, date: body.date, time: body.time, reason: String(body.reason || 'Bloqueado').trim(), createdAt: nowIso() };
    db.blockedSlots.push(block);
    writeDb(db);
    return sendJson(res, 201, { block });
  }

  if (req.method === 'DELETE' && parts[0] === 'api' && parts[1] === 'admin' && parts[2] === 'blocks') {
    const auth = requireAuth(req, res, db, ['admin']);
    if (!auth) return;
    const before = db.blockedSlots.length;
    db.blockedSlots = db.blockedSlots.filter((item) => item.id !== parts[3]);
    if (db.blockedSlots.length === before) return fail(res, 404, 'Bloqueio não encontrado.');
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  return fail(res, 404, 'Rota não encontrada.');
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp'
  }[ext] || 'application/octet-stream';
}

function serveStatic(req, res, pathname) {
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  let filePath = path.normalize(path.join(PUBLIC_DIR, relative));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Acesso negado');
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (path.extname(filePath)) {
      res.writeHead(404);
      res.end('Arquivo não encontrado');
      return;
    }
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': contentType(filePath) });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url.pathname, url.searchParams);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || 'Erro interno do servidor.' });
  }
});

ensureDatabase();
server.listen(PORT, () => {
  console.log(`Barbearia Prime rodando em http://localhost:${PORT}`);
});