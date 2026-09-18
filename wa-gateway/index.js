// Мини-шлюз WhatsApp для Temart (аналог Green API на своём сервере).
//
// Одна WhatsApp-сессия на клинику: владелец сканирует QR со своего рабочего
// номера, и клиентам этой клиники сообщения уходят с него. Бэкенд ходит сюда
// по HTTP с общим секретом; наружу шлюз не публикуется.
//
//   POST /sessions/:id/start   создать сессию (или вернуть существующую) → статус с QR
//   GET  /sessions/:id/status  { connected, qr, me, error }
//   POST /sessions/:id/send    { phone, text }
//   POST /sessions/:id/logout  отвязать номер и удалить сессию
//   GET  /sessions             список сессий
//   GET  /healthz              без токена

import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import pino from "pino";
import QRCode from "qrcode";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";

const PORT = Number(process.env.PORT || 3001);
const TOKEN = process.env.GATEWAY_TOKEN;
const AUTH_DIR = process.env.AUTH_DIR || "/data/auth";
// Сессия без привязки закрывается, если QR не отсканировали за это время.
const PAIRING_TTL_MS = 5 * 60 * 1000;
// Пауза между сообщениями одной сессии: массовая пачка без пауз - путь к бану.
const SEND_GAP_MS = 1500;

if (!TOKEN) {
  console.error("GATEWAY_TOKEN is required");
  process.exit(1);
}

const log = pino({ level: process.env.LOG_LEVEL || "info" });
const baileysLog = pino({ level: "warn" });

/** @type {Map<string, Session>} */
const sessions = new Map();

class Session {
  constructor(id) {
    this.id = id;
    this.dir = path.join(AUTH_DIR, id);
    this.sock = null;
    this.connected = false;
    this.qr = null;
    this.me = null;
    this.lastError = null;
    this.closed = false;
    this.backoffMs = 2000;
    this.pairingTimer = null;
    // Очередь отправки: обещание последней отправки, к которому цепляется следующая.
    this.queue = Promise.resolve();
  }

  status() {
    return {
      id: this.id,
      connected: this.connected,
      qr: this.qr,
      me: this.me,
      error: this.lastError,
    };
  }

  async start() {
    if (this.closed) return;
    await fs.mkdir(this.dir, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(this.dir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: baileysLog,
      browser: Browsers.ubuntu("Temart"),
      printQRInTerminal: false,
      // Синхронизация истории нам не нужна - шлюз только отправляет.
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });
    this.sock = sock;

    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", (u) => this.onUpdate(u));

    // Пока не привязали - QR живёт ограниченно, потом сессию закрываем.
    if (!state.creds.registered) this.armPairingTimer();
  }

  armPairingTimer() {
    clearTimeout(this.pairingTimer);
    this.pairingTimer = setTimeout(() => {
      if (!this.connected) {
        log.info({ session: this.id }, "pairing timed out, closing session");
        this.destroy(true).catch(() => {});
      }
    }, PAIRING_TTL_MS);
  }

  async onUpdate(update) {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      try {
        this.qr = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
      } catch (e) {
        this.lastError = "qr: " + e.message;
      }
    }
    if (connection === "open") {
      this.connected = true;
      this.qr = null;
      this.lastError = null;
      this.backoffMs = 2000;
      clearTimeout(this.pairingTimer);
      this.me = (this.sock?.user?.id || "").split(":")[0].split("@")[0];
      log.info({ session: this.id, me: this.me }, "connected");
    }
    if (connection === "close") {
      this.connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      log.warn({ session: this.id, code }, "connection closed");
      if (this.closed) return;
      if (loggedOut) {
        // Номер отвязали с телефона - сессия мертва, чистим и ждём новой привязки.
        this.lastError = "номер отвязан на телефоне";
        await this.destroy(true);
        return;
      }
      this.lastError = "переподключение…";
      const delay = this.backoffMs;
      this.backoffMs = Math.min(this.backoffMs * 2, 30000);
      setTimeout(() => this.start().catch((e) => (this.lastError = e.message)), delay);
    }
  }

  /** Отправка с очередью и паузой между сообщениями. */
  send(phone, text) {
    const run = async () => {
      if (!this.connected || !this.sock) {
        const err = new Error("not_connected");
        err.status = 503;
        throw err;
      }
      const digits = String(phone).replace(/\D/g, "");
      if (digits.length < 10) {
        const err = new Error("bad_phone");
        err.status = 400;
        throw err;
      }
      const jid = digits + "@s.whatsapp.net";
      const [info] = await this.sock.onWhatsApp(jid);
      if (!info?.exists) {
        const err = new Error("not_on_whatsapp");
        err.status = 404;
        throw err;
      }
      await this.sock.sendMessage(info.jid || jid, { text });
      await new Promise((r) => setTimeout(r, SEND_GAP_MS));
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  /** Закрыть сокет; wipe=true - удалить и креды (отвязка). */
  async destroy(wipe) {
    this.closed = true;
    clearTimeout(this.pairingTimer);
    try {
      if (wipe && this.sock && this.connected) await this.sock.logout();
    } catch {
      /* уже отвязан */
    }
    try {
      this.sock?.end(undefined);
    } catch {
      /* ignore */
    }
    this.sock = null;
    this.connected = false;
    this.qr = null;
    sessions.delete(this.id);
    if (wipe) await fs.rm(this.dir, { recursive: true, force: true });
  }
}

async function getOrStart(id) {
  let s = sessions.get(id);
  if (s) return s;
  s = new Session(id);
  sessions.set(id, s);
  await s.start();
  return s;
}

// При старте контейнера поднимаем все сессии с сохранёнными кредами.
async function restoreSessions() {
  await fs.mkdir(AUTH_DIR, { recursive: true });
  const entries = await fs.readdir(AUTH_DIR, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory() || !/^\d+$/.test(e.name)) continue;
    try {
      await fs.access(path.join(AUTH_DIR, e.name, "creds.json"));
      log.info({ session: e.name }, "restoring session");
      await getOrStart(e.name);
    } catch {
      // Каталог без creds.json - недоделанная привязка, чистим.
      await fs.rm(path.join(AUTH_DIR, e.name), { recursive: true, force: true });
    }
  }
}

const app = express();
app.use(express.json({ limit: "64kb" }));

app.get("/healthz", (_req, res) => res.json({ status: "ok", sessions: sessions.size }));

app.use((req, res, next) => {
  if (req.get("X-Gateway-Token") !== TOKEN) return res.status(401).json({ error: "unauthorized" });
  next();
});

const idOk = (id) => /^\d{1,18}$/.test(id);

app.get("/sessions", (_req, res) => {
  res.json([...sessions.values()].map((s) => s.status()));
});

app.post("/sessions/:id/start", async (req, res) => {
  const { id } = req.params;
  if (!idOk(id)) return res.status(400).json({ error: "bad_id" });
  try {
    const s = await getOrStart(id);
    // Если QR протух и сессия закрылась - getOrStart создаст новую; если
    // существующая ждёт сканирования, продлеваем ей время.
    if (!s.connected) s.armPairingTimer();
    // QR появляется через секунду-две после старта: подождём немного, чтобы
    // владелец сразу увидел код.
    for (let i = 0; i < 20 && !s.qr && !s.connected; i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
    res.json(s.status());
  } catch (e) {
    log.error({ err: e.message }, "start failed");
    res.status(500).json({ error: e.message });
  }
});

app.get("/sessions/:id/status", (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: "no_session", connected: false });
  res.json(s.status());
});

app.post("/sessions/:id/send", async (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s || !s.connected) return res.status(503).json({ error: "not_connected" });
  const { phone, text } = req.body || {};
  if (!phone || !text) return res.status(400).json({ error: "phone and text required" });
  try {
    await s.send(phone, String(text));
    res.json({ ok: true });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) log.error({ session: s.id, err: e.message }, "send failed");
    res.status(status).json({ error: e.message });
  }
});

app.post("/sessions/:id/logout", async (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) {
    // Сессии в памяти нет, но креды на диске могли остаться.
    await fs.rm(path.join(AUTH_DIR, req.params.id), { recursive: true, force: true });
    return res.status(404).json({ error: "no_session" });
  }
  await s.destroy(true);
  res.json({ ok: true });
});

restoreSessions()
  .catch((e) => log.error({ err: e.message }, "restore failed"))
  .finally(() => {
    app.listen(PORT, () => log.info({ port: PORT }, "wa-gateway listening"));
  });

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    log.info("shutting down");
    for (const s of sessions.values()) await s.destroy(false).catch(() => {});
    process.exit(0);
  });
}
