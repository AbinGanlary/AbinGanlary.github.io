/**
 * Resume site backend: turns this Google Sheet into a JSON API and a contact inbox.
 *
 * First run: Extensions > Apps Script, paste Code.gs + Seed.gs, run setup() once.
 * Deploy:    Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone.
 *            Paste the /exec URL into CONFIG.API_URL in index.html.
 *
 * GET  <exec url>            -> JSON of every tab (cached; cache clears on any edit)
 * GET  <exec url>?fresh=1    -> bypass cache
 * POST <exec url>  {name,email,message,website}  -> appends to Messages + emails you
 */

const TABS = {
  Profile:        ['key', 'value'],
  Highlights:     ['order', 'value', 'label', 'show'],
  Builds:         ['order', 'kind', 'title', 'blurb', 'examples', 'show'],
  Experience:     ['order', 'role', 'org', 'location', 'start', 'end', 'bullets', 'show'],
  Projects:       ['repo', 'title', 'blurb', 'tags', 'link', 'group', 'featured', 'hide'],
  Recognition:    ['order', 'title', 'role', 'source', 'year', 'link', 'show'],
  Skills:         ['order', 'category', 'items', 'show'],
  Education:      ['order', 'title', 'school', 'dates', 'note', 'show'],
  Certifications: ['order', 'name', 'issuer', 'date', 'show'],
  Languages:      ['language', 'level', 'show'],
};
const MESSAGES_TAB = 'Messages';
const CACHE_KEY = 'site-v1';
const CACHE_SECONDS = 600;

// ---------- Web app ----------

function doGet(e) {
  const params = (e && e.parameter) || {};
  const cache = CacheService.getScriptCache();
  let json = params.fresh ? null : cache.get(CACHE_KEY);
  if (!json) {
    json = JSON.stringify(readAll_());
    try { cache.put(CACHE_KEY, json, CACHE_SECONDS); } catch (_) { /* >100KB: skip cache */ }
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.website) return reply_({ ok: true });            // honeypot: bots fill hidden field
    const name = clean_(body.name, 100);
    const email = clean_(body.email, 200);
    const message = clean_(body.message, 4000);
    if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply_({ ok: false, error: 'Please fill in your name, a valid email and a message.' });
    }
    // Global rate limit: 10 messages per 10 minutes.
    const cache = CacheService.getScriptCache();
    const count = Number(cache.get('msg-count') || 0);
    if (count >= 10) return reply_({ ok: false, error: 'Too many messages right now. Please try again later.' });
    cache.put('msg-count', String(count + 1), 600);

    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName(MESSAGES_TAB) || ss.insertSheet(MESSAGES_TAB);
    if (sheet.getLastRow() === 0) sheet.appendRow(['timestamp', 'name', 'email', 'message']);
    // Prefix with ' so text like =HYPERLINK(...) is never run as a formula.
    sheet.appendRow([new Date(), "'" + name, "'" + email, "'" + message]);

    const to = privateSetting_('_notify_email') || Session.getEffectiveUser().getEmail();
    if (to) {
      MailApp.sendEmail({
        to: to,
        replyTo: email,
        subject: 'Website message from ' + name,
        body: message + '\n\n— ' + name + ' <' + email + '>\n(Saved in the Messages tab of your site sheet.)',
      });
    }
    return reply_({ ok: true });
  } catch (err) {
    console.error(err);
    return reply_({ ok: false, error: 'Something went wrong. Please email me directly.' });
  }
}

// ---------- Sheet reading ----------

function readAll_() {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const out = {};
  Object.keys(TABS).forEach(function (tab) {
    const sheet = ss.getSheetByName(tab);
    const rows = sheet ? rowsOf_(sheet, tz) : [];
    if (tab === 'Profile') {
      const profile = {};
      rows.forEach(function (r) {
        const key = String(r.key || '').trim();
        if (key && key.charAt(0) !== '_') profile[key] = r.value;   // "_" keys stay private
      });
      out.profile = profile;
      return;
    }
    let list = rows.filter(function (r) { return truthy_(r.show, true); });
    if (TABS[tab].indexOf('order') >= 0) {
      list.sort(function (a, b) { return (Number(a.order) || 999) - (Number(b.order) || 999); });
    }
    out[tab.toLowerCase()] = list;
  });
  out.updated = new Date().toISOString();
  return out;
}

function rowsOf_(sheet, tz) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  return values.slice(1)
    .filter(function (row) { return row.some(function (v) { return v !== '' && v !== null; }); })
    .map(function (row) {
      const obj = {};
      headers.forEach(function (h, i) {
        if (!h) return;
        let v = row[i];
        if (v instanceof Date) v = Utilities.formatDate(v, tz, 'MMM yyyy');
        obj[h] = v;
      });
      return obj;
    });
}

function privateSetting_(key) {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Profile');
  if (!sheet) return '';
  const hit = sheet.getDataRange().getValues().filter(function (r) { return String(r[0]).trim() === key; })[0];
  return hit ? String(hit[1]).trim() : '';
}

function truthy_(v, dflt) {
  if (v === '' || v === null || v === undefined) return dflt;
  if (typeof v === 'boolean') return v;
  return !/^(false|no|0|n|hide)$/i.test(String(v).trim());
}

function clean_(v, max) { return String(v || '').trim().slice(0, max); }

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Sheet UI ----------

/** Simple trigger: any edit clears the cache so the site shows changes on next load. */
function onEdit() { CacheService.getScriptCache().remove(CACHE_KEY); }

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Website')
    .addItem('Refresh site now', 'refreshCache')
    .addItem('Set up / repair tabs', 'setup')
    .addToUi();
}

function refreshCache() {
  CacheService.getScriptCache().remove(CACHE_KEY);
  SpreadsheetApp.getActive().toast('The site will show your latest edits on next load.');
}

/** Creates every tab with headers and fills empty tabs from SEED (Seed.gs). Never overwrites data. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(TABS).forEach(function (tab) {
    const headers = TABS[tab];
    const sheet = ss.getSheetByName(tab) || ss.insertSheet(tab);
    if (sheet.getLastRow() > 1) return;                 // already has data
    let rows;
    if (tab === 'Profile') {
      rows = Object.keys(SEED.profile).map(function (k) { return [k, SEED.profile[k]]; });
      rows.push(['_notify_email', '']);                 // private: where contact messages go
    } else {
      rows = (SEED[tab.toLowerCase()] || []).map(function (o) {
        return headers.map(function (h) {
          if (h === 'show') return o.show === undefined ? true : o.show;
          return o[h] === undefined ? '' : o[h];
        });
      });
    }
    const all = [headers].concat(rows);
    const range = sheet.getRange(1, 1, all.length, headers.length);
    range.setNumberFormat('@');                          // keep "Feb 2026" as text, not a date
    range.setValues(all.map(function (r) { return r.map(function (v) { return typeof v === 'boolean' ? v : String(v); }); }));
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#efe9df');
    sheet.setFrozenRows(1);
    sheet.getRange(2, 1, Math.max(all.length - 1, 1), headers.length).setWrap(true).setVerticalAlignment('top');
    sheet.autoResizeColumns(1, headers.length);
    headers.forEach(function (h, i) {
      if (/bullets|summary|blurb|items|value/.test(h)) sheet.setColumnWidth(i + 1, 480);
    });
  });
  const msgs = ss.getSheetByName(MESSAGES_TAB) || ss.insertSheet(MESSAGES_TAB);
  if (msgs.getLastRow() === 0) {
    msgs.appendRow(['timestamp', 'name', 'email', 'message']);
    msgs.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#efe9df');
    msgs.setFrozenRows(1);
  }
  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  refreshCache();
}
