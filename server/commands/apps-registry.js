import fs from 'node:fs';
import path from 'node:path';

const APP_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const BLOCKED_EXT = /\.(bat|cmd|ps1|js|vbs)$/i;

/** @param {unknown} app */
export function validateAppEntry(app) {
  if (!app || typeof app !== 'object') return { ok: false, error: 'INVALID_APP' };
  const id = String(/** @type {{ id?: string }} */ (app).id ?? '');
  const label = String(/** @type {{ label?: string }} */ (app).label ?? id);
  const executable = String(/** @type {{ executable?: string }} */ (app).executable ?? '');
  if (!APP_ID_RE.test(id)) return { ok: false, error: 'INVALID_APP_ID' };
  if (!executable || !path.isAbsolute(executable)) return { ok: false, error: 'INVALID_EXECUTABLE' };
  if (executable.startsWith('\\\\')) return { ok: false, error: 'INVALID_EXECUTABLE' };
  if (BLOCKED_EXT.test(executable)) return { ok: false, error: 'BLOCKED_EXECUTABLE' };
  if (!executable.toLowerCase().endsWith('.exe')) return { ok: false, error: 'INVALID_EXECUTABLE' };
  return {
    ok: true,
    app: {
      id,
      label: label.slice(0, 64),
      executable,
      args: Array.isArray(/** @type {{ args?: unknown }} */ (app).args)
        ? app.args.map(String)
        : [],
      allowStop: Boolean(/** @type {{ allowStop?: boolean }} */ (app).allowStop),
    },
  };
}

export class AppsRegistry {
  /** @param {string} [filePath] */
  constructor(filePath = path.join(process.cwd(), 'data', 'remote-apps.json')) {
    this.filePath = filePath;
    /** @type {object[]} */
    this.apps = [];
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed?.apps) ? parsed.apps : [];
      this.apps = list
        .map((a) => validateAppEntry(a))
        .filter((r) => r.ok)
        .map((r) => r.app);
    } catch {
      this.apps = [];
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ apps: this.apps }, null, 2), 'utf8');
  }

  listPublic() {
    return this.apps.map((a) => ({ id: a.id, label: a.label, allowStop: a.allowStop }));
  }

  /** @param {unknown[]} apps */
  replaceAll(apps) {
    if (!Array.isArray(apps) || apps.length > 20) {
      return { ok: false, error: 'INVALID_APPS_LIST' };
    }
    const next = [];
    const seen = new Set();
    for (const entry of apps) {
      const check = validateAppEntry(entry);
      if (!check.ok) return check;
      if (seen.has(check.app.id)) return { ok: false, error: 'DUPLICATE_APP_ID' };
      seen.add(check.app.id);
      next.push(check.app);
    }
    this.apps = next;
    this.save();
    return { ok: true, apps: this.listPublic() };
  }
}
