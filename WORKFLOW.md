# Agentic Workflow — Kompletní dokumentace

Automatický pipeline: Jira ticket → orchestrátor → sub-agenti → GitHub PR.

---

## Obsah

1. [Celkový flow](#celkový-flow)
2. [Předpoklady a účty](#předpoklady-a-účty)
3. [GitHub nastavení](#github-nastavení)
4. [Jira nastavení](#jira-nastavení)
5. [Langfuse nastavení](#langfuse-nastavení)
6. [Struktura projektu](#struktura-projektu)
7. [Jak fungují GitHub Actions workflows](#jak-fungují-github-actions-workflows)
8. [Jak fungují skripty](#jak-fungují-skripty)
9. [Orchestrátor a agenti](#orchestrátor-a-agenti)
10. [Langfuse Dashboard](#langfuse-dashboard)

---

## Celkový flow

```
1. Vytvoříš/upravíš Jira ticket
        ↓
2. Jira Automation zachytí změnu → pošle HTTP POST na GitHub API
        ↓
3. GitHub Actions spustí workflow "jira-implement"
        ↓
4. scripts/orchestrate.mjs:
   - Načte ticket z Jira REST API
   - Ověří že reporter = ty (bezpečnostní filtr)
   - Zavolá Claude API → dostane plán (které agenty použít a co mají dělat)
   - Napíše plán jako komentář do Jira ticketu
        ↓
5a. Napíšeš "feedback: <připomínka>" do komentáře
        ↓ Jira Automation → "jira-feedback" workflow → orchestrate.mjs s feedbackem → nový plán
        ↓
5b. Napíšeš "approve" do komentáře
        ↓ Jira Automation → "jira-approved" workflow
        ↓
6. scripts/implement-ticket.mjs:
   - Načte ticket znovu
   - Zavolá Claude (orchestrátor) → dostane plán agentů
   - Pro každého agenta zavolá Claude zvlášť → dostane změny souborů
   - Zapíše všechny soubory do repozitáře
        ↓
7. GitHub Action "peter-evans/create-pull-request" vytvoří nebo aktualizuje PR
```

---

## Předpoklady a účty

Pro spuštění tohoto projektu potřebuješ:

| Služba | K čemu | Kde získat |
|---|---|---|
| **GitHub** | Repozitář + Actions + PR | github.com |
| **Jira Cloud** | Tickety + Automation | atlassian.net |
| **Anthropic API** | Claude API pro agenty | console.anthropic.com |
| **Langfuse** | Observability, sledování runů | cloud.langfuse.com |

---

## GitHub nastavení

### 1. Repozitář

Vytvoř repozitář na GitHubu. V tomto projektu: `DanielLedvina/agentic-workflow`.

### 2. Povolit GitHub Actions vytvářet PR

Jdi do: **Settings → Actions → General → Workflow permissions**
- Zaškrtni **"Allow GitHub Actions to create and approve pull requests"**

Bez tohoto nastavení Actions nemůže vytvořit PR a workflow selže.

### 3. Personal Access Token (pro Jira Automation)

Jira potřebuje token aby mohla volat GitHub API.

1. Jdi na **github.com → Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. Klikni **"Generate new token (classic)"**
3. Zaškrtni scope: `repo` (celý)
4. Zkopíruj token — použiješ ho v Jira Automation jako `Bearer <token>`

### 4. GitHub Secrets

Jdi do repozitáře → **Settings → Secrets and variables → Actions → New repository secret**.

Přidej tyto secrets:

| Secret | Hodnota |
|---|---|
| `JIRA_BASE_URL` | `https://signosofts.atlassian.net` |
| `JIRA_EMAIL` | tvůj Jira email |
| `JIRA_API_TOKEN` | Atlassian API token (viz níže) |
| `ANTHROPIC_API_KEY` | Claude API key z console.anthropic.com |
| `LANGFUSE_PUBLIC_KEY` | Langfuse public key |
| `LANGFUSE_SECRET_KEY` | Langfuse secret key |
| `LANGFUSE_BASE_URL` | `https://cloud.langfuse.com` |

---

## Jira nastavení

### 1. Atlassian API Token

1. Jdi na **id.atlassian.com → Security → API tokens**
2. Klikni **"Create API token"**
3. Zkopíruj token → ulož jako GitHub Secret `JIRA_API_TOKEN`

Tento token se používá v skriptech pro čtení ticketů a psaní komentářů přes Jira REST API.

### 2. Jira Automation pravidla

Jdi do: **Jira projekt → Project settings → Automation → Create rule**

Potřebuješ tři pravidla:

---

#### Pravidlo 1 — Ticket upraven → spustit orchestrátora

**Trigger:** `Požadavek byl aktualizován`

**Podmínka:** Podmínka `{{smart values}}`
- První hodnota: `{{issue.reporter.emailAddress}}`
- Podmínka: rovná se
- Druhá hodnota: `daniel.ledvina@signosoft.com`

**Akce:** `Odeslat webový požadavek`
- URL: `https://api.github.com/repos/DanielLedvina/agentic-workflow/dispatches`
- Metoda: `POST`
- Hlavičky:
  - `Authorization`: `Bearer <github_token>`
  - `Accept`: `application/vnd.github+json`
  - `Content-Type`: `application/json`
- Tělo (Vlastní data):
```json
{
  "event_type": "jira-implement",
  "client_payload": { "ticket_key": "{{issue.key}}" }
}
```

---

#### Pravidlo 2 — Komentář "approve" → spustit implementaci

**Trigger:** `Požadavek byl okomentován` → typ: `Komentář je hlavní akce`

**Podmínka 1:** `{{comment.body}}` rovná se `approve`

**Podmínka 2:** `{{issue.reporter.emailAddress}}` rovná se `daniel.ledvina@signosoft.com`

**Akce:** `Odeslat webový požadavek` (stejné hlavičky jako pravidlo 1)
```json
{
  "event_type": "jira-approved",
  "client_payload": { "ticket_key": "{{issue.key}}" }
}
```

---

#### Pravidlo 3 — Komentář "feedback: ..." → přeplánovat

**Trigger:** `Požadavek byl okomentován` → typ: `Komentář je hlavní akce`

**Podmínka 1:** `{{comment.body}}` začíná na `feedback:`

**Podmínka 2:** `{{issue.reporter.emailAddress}}` rovná se `daniel.ledvina@signosoft.com`

**Akce:** `Odeslat webový požadavek` (stejné hlavičky)
```json
{
  "event_type": "jira-feedback",
  "client_payload": {
    "ticket_key": "{{issue.key}}",
    "feedback": "{{comment.body}}"
  }
}
```

---

### Proč Jira Automation a ne obyčejný webhook?

Jira má dva způsoby jak posílat HTTP requesty:
- **Webhook** (Project settings → Webhooks) — neumí custom hlavičky, nelze přidat `Authorization`
- **Automation** (Send web request akce) — podporuje custom hlavičky → nutné pro GitHub API auth

---

## Langfuse nastavení

Langfuse slouží k sledování každého agentic runu — kolik tokenů spotřeboval každý agent, jaký byl vstup/výstup, zda run proběhl úspěšně.

### 1. Vytvoření projektu

1. Jdi na **cloud.langfuse.com** → vytvoř účet
2. Vytvoř nový projekt
3. Jdi do **Settings → API Keys** → zkopíruj `Public Key` a `Secret Key`
4. Ulož jako GitHub Secrets `LANGFUSE_PUBLIC_KEY` a `LANGFUSE_SECRET_KEY`

### 2. Credentials v Angular aplikaci

Pro lokální dashboard jsou credentials nastaveny přímo v `src/index.html`:

```html
<script>
  window.__LANGFUSE_PUBLIC_KEY__ = 'pk-lf-...';
  window.__LANGFUSE_SECRET_KEY__ = 'sk-lf-...';
</script>
```

Dashboard je dostupný na `http://localhost:4200/dashboard` při spuštěném `npm start`.

---

## Struktura projektu

```
agentic-workflow/
├── .github/
│   └── workflows/
│       ├── jira-to-pr.yml       # Trigger: jira-implement → spustí orchestrátora
│       ├── jira-feedback.yml    # Trigger: jira-feedback → přeplánuje orchestrátor
│       └── jira-approved.yml    # Trigger: jira-approved → spustí agenty + PR
├── scripts/
│   ├── orchestrate.mjs          # Orchestrátor: analyzuje ticket, napíše plán do Jiry
│   └── implement-ticket.mjs     # Agenti: implementují kód, zapisují soubory
├── src/
│   └── app/
│       ├── app.ts / app.html / app.scss   # Kanban board
│       ├── app.routes.ts                  # Routing
│       └── dashboard/
│           ├── dashboard.ts / .html / .scss   # Langfuse dashboard
│           └── langfuse.service.ts            # Volání Langfuse API
├── proxy.conf.json              # Dev proxy: /langfuse → cloud.langfuse.com
└── WORKFLOW.md                  # Tato dokumentace
```

---

## Jak fungují GitHub Actions workflows

GitHub Actions jsou automatické CI/CD pipelines definované jako YAML soubory v `.github/workflows/`.

### Trigger `repository_dispatch`

Standardní triggery jako `push` nebo `pull_request` nespustí workflow z externího systému. Proto se používá `repository_dispatch` — speciální event který GitHub přijme přes REST API:

```
POST https://api.github.com/repos/<owner>/<repo>/dispatches
Authorization: Bearer <token>
Body: { "event_type": "jira-implement", "client_payload": { ... } }
```

Každý workflow naslouchá na jiný `event_type`:

```yaml
on:
  repository_dispatch:
    types: [jira-implement]
```

Data z `client_payload` jsou dostupná v workflow jako:
```yaml
${{ github.event.client_payload.ticket_key }}
```

### Workflow struktura

Každý workflow má stejnou základní strukturu:
1. **Checkout** — stáhne kód repozitáře na runner
2. **Setup Node.js** — nainstaluje Node 20
3. **npm ci** — nainstaluje závislosti
4. **Spustí skript** — předá env vars ze secrets
5. *(volitelně)* **create-pull-request** — vytvoří nebo aktualizuje PR

### Permissions

`jira-approved.yml` potřebuje explicitní permissions pro vytváření PR:
```yaml
permissions:
  contents: write
  pull-requests: write
```

---

## Jak fungují skripty

Oba skripty jsou ESM moduly (`.mjs`) s top-level `await` — běží přímo v Node.js bez build kroku.

### orchestrate.mjs — co dělá krok za krokem

1. Načte env vars (`TICKET_KEY`, `JIRA_*`, `ANTHROPIC_API_KEY`, `LANGFUSE_*`, volitelně `FEEDBACK_COMMENT`)
2. Inicializuje Langfuse trace pro sledování runu
3. Zavolá Jira REST API → načte ticket (summary, description, reporter)
4. Ověří že `reporter.emailAddress === JIRA_EMAIL` → jinak přeskočí
5. Načte existující komentáře → pokud plán už existuje a není feedback, přeskočí (deduplication)
6. Zavolá Claude API jako orchestrátor → dostane JSON `{ agents: [...], summary: "..." }`
7. Pokud je `FEEDBACK_COMMENT`, předá ho Claudovi spolu s předchozím plánem → přeplánuje
8. Zapíše plán jako Jira komentář ve formátu ADF (Atlassian Document Format)

### implement-ticket.mjs — co dělá krok za krokem

1. Stejné načtení ticketu a ověření reportera
2. Načte stromovou strukturu repozitáře (`find src -type f`)
3. Zavolá Claude (orchestrátor) → dostane plán agentů
4. Pro každého agenta v plánu:
   - Načte relevantní soubory ze `agent.files`
   - Předá i soubory změněné předchozími agenty (jako aktuální baseline)
   - Zavolá Claude jako specializovaného agenta → dostane JSON `[{ path, content }]`
   - Uloží změny do `Map<path, content>`
5. Zapíše všechny soubory do repozitáře (jen cesty začínající `src/`)

### Proč `Map<path, content>` pro merge změn?

Pokud dva agenti změní stejný soubor, poslední agent vyhraje. To je záměrné — agenti dostávají změny předchozích agentů jako kontext, takže každý další agent staví na výsledku předchozího.

### Extrakce JSON z Claude odpovědi

Claude někdy předřadí text před JSON. Proto se JSON extrahuje regexem:
```js
const match = rawResponse.match(/\[[\s\S]*\]/);   // pro pole
const match = rawResponse.match(/\{[\s\S]*\}/);   // pro objekt
```

---

## Orchestrátor a agenti

### Jak orchestrátor rozhoduje

Orchestrátor dostane ticket + strukturu repozitáře a vrátí minimální sadu agentů potřebných pro implementaci:

| Případ | Agenti |
|---|---|
| CSS fix | `[styles]` |
| Text/label změna | `[frontend]` |
| Bug v komponentě | `[frontend]` |
| Nová stránka, statická | `[architect, frontend, styles]` |
| Nová stránka s daty | `[architect, backend, frontend, styles]` |
| Nová služba/API | `[backend]` |

### Zodpovědnosti agentů

| Agent | Co dělá | Kdy se použije |
|---|---|---|
| `architect` | Nové moduly, routes v `app.routes.ts`, config soubory | Nová feature area v projektu |
| `backend` | Angular services, HTTP volání, data modely | Fetching dat, business logika |
| `frontend` | Komponenty (`.ts` + `.html`), routing, konzumace services | Jakákoliv UI změna |
| `styles` | SCSS soubory | Výrazné stylingové změny |

### Feedback smyčka

Pokud plán nevyhovuje, napíšeš do Jira komentáře:
```
feedback: nechci backend agenta, použij jen frontend a styles
```

Orchestrátor dostane:
- původní ticket
- předchozí plán
- tvůj feedback

A vygeneruje revidovaný plán. Můžeš iterovat kolikrát chceš, pak napíšeš `approve`.

---

## Langfuse Dashboard

Dashboard na `/dashboard` volá Langfuse API přes Angular dev proxy (aby se obešel CORS).

### Dev proxy

`proxy.conf.json` přesměruje všechny requesty `/langfuse/*` na `https://cloud.langfuse.com`:
```json
{
  "/langfuse": {
    "target": "https://cloud.langfuse.com",
    "changeOrigin": true,
    "pathRewrite": { "^/langfuse": "" }
  }
}
```

Takže `GET /langfuse/api/public/traces` → `GET https://cloud.langfuse.com/api/public/traces`.

### Co dashboard zobrazuje

Každý run (trace) obsahuje kroky (spans/generations):

| Krok | Typ | Co ukazuje |
|---|---|---|
| `fetch-jira-ticket` | span | Načtení ticketu, reporter, summary |
| `orchestrator-plan` | generation | Vstup/výstup orchestrátora, tokeny |
| `agent-architect` | generation | Co architect implementoval, tokeny |
| `agent-backend` | generation | Co backend implementoval, tokeny |
| `agent-frontend` | generation | Co frontend implementoval, tokeny |
| `agent-styles` | generation | Co styles implementoval, tokeny |

Status runu (Success/Failed/Skipped) se odvozuje z `trace.metadata`:
- `metadata.error` → Failed
- `metadata.skipped` → Skipped
- jinak → Success
