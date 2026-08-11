#Event Registration & Ticketing System-HOME-IN PRISON FOUNDATION 

A serverless REST API built with **AWS SAM** for Home-in Prison
Foundation's annual fundraising campaign, replacing Microsoft Forms +
Excel for event sign-ups. Attendees can browse events, register, and
manage their own booking by email; Foundation staff get a protected
admin dashboard to review and manage every registration. This README is
written someone new to AWS and they can build the
whole thing themselves, phase by phase, exactly the way the project
brief lays it out..

**Stack:** API Gateway → Lambda (Python 3.12) → DynamoDB, with CloudWatch
alarms and a GitHub Actions CI/CD pipeline.

---

## 01.Install these 3 things

| Tool | Why | Check it worked |
|---|---|---|
| [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) | talks to your AWS account | `aws --version` |
| [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) | builds & deploys this project | `sam --version` |
| Python 3.12 | the Lambda runtime we're using | `python3 --version` |

Then connect the CLI to your AWS account (use a free-tier / sandbox account
if you have one):
```bash
aws configure
# AWS Access Key ID, Secret Access Key, region (e.g. eu-west-1), output format (json)
```

---

## Project structure

```
event-registration-system/
├── template.yaml              # SAM template: defines EVERY AWS resource
├── src/handlers/
│   ├── register.py            # POST /register
│   ├── list_events.py         # GET /events
│   ├── get_registrations.py   # GET /registrations/{email}
│   ├── cancel_registration.py # DELETE /registration/{id}
│   └── utils/response.py      # shared response/CORS helper
├── scripts/seed_events.py     # adds 2 sample events after deploy
├── tests/test_handlers.py     # unit tests (mocked AWS, no real account needed)
├── .github/workflows/deploy.yml  # CI/CD pipeline
├── README.md                  # you are here
└── frontend/                  # browser dashboard (no build step)
```

---

## Frontend dashboard

`frontend/` contains a lightweight, dependency-free HTML/CSS/JavaScript
dashboard for **Home-in Prison Foundation Annual Fundraising**. It calls
the deployed API Gateway directly to list events, create registrations, find
registrations by email, and cancel registrations.

1. Deploy the SAM stack and copy the `ApiUrl` stack output.
2. Open `frontend/index.html` in a browser (or serve the project with a static
   web server). For the current deployment, use the API Gateway URL ending in
   `/Prod` (the API stage name), not the DynamoDB environment suffix `/dev`.
3. Expand **API connection settings**, paste the `ApiUrl`, and select **Save
   and load events**. The URL is saved only in that browser's local storage.

For a simple local static server, run this from the project root:

```bash
python -m http.server 8000 --directory frontend
```

Then open `http://localhost:8000`. API Gateway CORS is already configured in
`template.yaml` for these browser requests.

### Admin dashboard

The protected staff dashboard is at `frontend/admin/index.html`. It lists every
registration, provides search and CSV export, and lets authorised staff cancel
a booking. It calls **only** the Cognito-protected admin API routes:

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/registrations` | List all registrations |
| DELETE | `/admin/registration/{id}` | Cancel a registration |

After deploying the updated stack, copy these CloudFormation outputs into the
**Admin connection settings** panel:

- `ApiUrl`
- `AdminUserPoolId`
- `AdminUserPoolClientId`

Create your first staff account, set a permanent password, and add it to the
`Admins` group (replace the placeholders with stack outputs and your email):

```bash
aws cognito-idp admin-create-user \
  --user-pool-id USER_POOL_ID \
  --username admin@example.com \
  --user-attributes Name=email,Value=admin@example.com Name=email_verified,Value=true \
  --region us-east-1

aws cognito-idp admin-set-user-password \
  --user-pool-id USER_POOL_ID \
  --username admin@example.com \
  --password 'Use-A-Strong-Unique-Password1!' \
  --permanent \
  --region us-east-1

aws cognito-idp admin-add-user-to-group \
  --user-pool-id USER_POOL_ID \
  --username admin@example.com \
  --group-name Admins \
  --region us-east-1
```

Use your deployment region in every command. The public attendee dashboard
continues to use the existing `/events`, `/register`, `/registrations/{email}`
and `/registration/{id}` routes; the new staff routes require an `Admins`
group token.

---

## Phase 1: Infrastructure Foundation

**Goal:** understand *why* each piece exists before you deploy anything.

- **API Gateway** — the "front door". Turns HTTP requests into events that
  trigger Lambda functions.
- **Lambda** — your business logic, running only when called (no server to
  patch or pay for while idle).
- **DynamoDB** — a NoSQL table. We use two: `Events` and `Registrations`.
- **IAM** — every Lambda function gets *only* the permissions it needs
  (e.g. the function that lists events can only *read* the Events table,
  never write or delete). This is the "principle of least privilege."

All of this is declared in **`template.yaml`** — one file, the whole
infrastructure. Open it and read through the `Resources:` section; every
AWS service in the diagram from the brief maps to a block in there.

Table design:
- `Events` table → key: `eventId` (string)
- `Registrations` table → key: `registrationId` (string), plus a
  **Global Secondary Index** on `email` so `GET /registrations/{email}` is a
  fast, cheap *query* instead of a full table *scan*.

### Architecture diagram

![Architecture](diagrams/architecture%20diagram.png)

#### Architecture skeleton

```text
[Event Attendee / Web Frontend]
              |
              | sign in / sign up
              v
     [Amazon Cognito User Pool]
              |
              | JWT access token
              v
      [Amazon API Gateway]
              |
              | authorised HTTPS requests
              v
  +-----------------------------+
  |        AWS Lambda           |
  |  - Register registration    |
  |  - List events              |
  |  - Get registrations        |
  |  - Cancel registration      |
  +-----------------------------+
         |                 |
         |                 +--------------------> [CloudWatch Logs & Alarms]
         v
  +-----------------------------+
  |          DynamoDB           |
  |  - Events table             |
  |  - Registrations table      |
  |    (EmailIndex GSI)         |
  +-----------------------------+

[GitHub Actions] ---- deploys ----> [AWS SAM stack]
[Register Lambda] --- optional ---> [SNS] ---> [Email recipient]

```
**Authentication note:** Cognito is shown as the recommended authentication
layer for a production version. The frontend signs users in with a Cognito
User Pool and sends its JWT in the `Authorization` header; API Gateway then
validates that token before invoking a Lambda function. Cognito is not yet
defined in `template.yaml`, so the current API remains publicly accessible
until a Cognito authorizer is added.

```
    SNS -. email .-> Email[Notification email recipient]
    GitHub[GitHub Actions] -. build and deploy .-> AWS
```

**Draw.io layout:** draw a large **AWS Cloud / SAM Stack** container in the
centre. Place Cognito between the user/frontend on the left and API Gateway
inside the container, including a return arrow for the JWT token. Arrange the
four Lambda functions in a vertical column, with the two DynamoDB tables to
their right. Place CloudWatch below the Lambdas, SNS below the tables, the
notification recipient outside the container on the right, and GitHub Actions
above it. Label arrows with the HTTP method/path or operation above; use solid
arrows for request/data paths and dashed arrows for deployment, monitoring,
optional email, and proposed authentication paths.

---

## Phase 2: API Development


| Method | Path | File | What it does |
|---|---|---|---|
| POST | `/register` | `register.py` | validates email, confirms event exists, writes registration |
| GET | `/events` | `list_events.py` | scans + returns all events, sorted by date |
| GET | `/registrations/{email}` | `get_registrations.py` | queries the EmailIndex GSI |
| DELETE | `/registration/{id}` | `cancel_registration.py` | deletes one registration, 404 if it's already gone |

Each handler:
- validates its inputs before touching DynamoDB
- returns clean JSON with proper HTTP status codes (400/404/500) via the
  shared `utils/response.py` helper
- includes CORS headers so a web frontend can call it directly

### Build & deploy it

```bash
cd event-registration-system
sam build
sam deploy --guided
```

`--guided` walks you through naming the stack, picking a region, and saving
those choices to `samconfig.toml` so future deploys are just `sam deploy`.
When it finishes, copy the `ApiUrl` value from the Outputs — that's your
base URL for everything below.

### Seed sample events

```bash
# grab the real table name from your stack outputs, then:
python scripts/seed_events.py events-dev
```

### Try it with curl

```bash
# List events
curl https://YOUR_API_URL/events

# Register
curl -X POST https://YOUR_API_URL/register \
  -H "Content-Type: application/json" \
  -d '{"eventId":"evt-001","email":"friend@example.com","name":"Kwame"}'

# View a person's registrations
curl https://YOUR_API_URL/registrations/friend@example.com

# Cancel (use the registrationId returned above)
curl -X DELETE https://YOUR_API_URL/registration/REGISTRATION_ID
```

---

## Phase 3: Automation & CI/CD

`.github/workflows/deploy.yml` does two things:

1. **On every push/PR** → installs deps, runs `pytest tests/` (these use
   `moto` to fake AWS, so no real credentials or costs are involved).
2. **On push to `main` only** → runs `sam build` + `sam deploy` for real.

To wire this up in your own GitHub repo:

1. To wire this up in your own GitHub repo:

1. Create an IAM user with the managed policies `sam deploy` needs
   (CloudFormation, IAM, API Gateway, Lambda, DynamoDB, Cognito, SNS,
   CloudWatch, S3), then generate an access key for it.
2. Add two repo secrets: `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.
   *(An OIDC role is the more secure long-term option — no long-lived keys
   stored in GitHub — but takes more IAM setup to wire up correctly.)*
3. Push to `main` — check the **Actions** tab to watch it run..

Branching strategy for a small team: work on feature branches, open a PR
into `main` (this triggers the *test* job only), merge once green (this
triggers *test + deploy*).

---

## Phase 4: Monitoring & Security

Already built into `template.yaml`:

- **CloudWatch Logs** — every Lambda invocation is logged automatically
  under `/aws/lambda/<function-name>`.
- **CloudWatch Alarm** — `RegisterErrorRateAlarm` uses a metric-math
  expression (`Errors / Invocations * 100`) to fire when the error rate
  passes **5%**, matching the brief exactly. You can duplicate this alarm
  block for the other 3 functions the same way.
- **Input validation** — every handler rejects malformed input (bad email,
  missing fields) *before* it reaches DynamoDB.
- **Least privilege IAM** — look at the `Policies:` under each function in
  `template.yaml`; each one only grants exactly what that function touches.
- **SNS confirmation emails** (optional) — deploy with
  `sam deploy --parameter-overrides Stage=dev NotificationEmail=you@example.com`
  and you'll get an email to confirm the subscription, then a confirmation
  email on every registration and an alert if the error alarm fires.

**AWS Budgets** (manual, one-time, console or CLI — not part of SAM):
```bash
aws budgets create-budget --account-id YOUR_ACCOUNT_ID --budget file://budget.json
```
Simplest path for a student project: AWS Console → Billing → Budgets →
"Create a budget" → Zero spend budget → alert at $1.

---

## Phase 5: Deployment and Optimization

- **Cost:** everything here (Lambda, API Gateway, DynamoDB on-demand,
  CloudWatch) has a generous AWS Free Tier — a class project running for a
  few weeks should cost close to $0.
- **Resource lifecycle:** set the CloudWatch Logs retention (already done —
  see `AllFunctionsLogGroupRetention`, 14 days) so logs don't accumulate
  forever.
- **Tearing down when you're done:**
  ```bash
  sam delete
  ```
  This removes every resource the stack created — no leftover charges.

## Frontend hosting (AWS Amplify)

The `frontend/` folder is hosted separately via AWS Amplify Hosting, connected directly to this repo's `main` branch. Every push to `main` triggers an automatic rebuild and redeploy of the site — no manual steps needed.

**Live URL:** https://main.drwcl4jf8ulhs.amplifyapp.com

**Amplify build settings (`amplify.yml`):**
```yaml
version: 1
frontend:
  phases:
    build:
      commands: []
  artifacts:
    baseDirectory: frontend
    files:
      - '**/*'
  cache:
    paths: []
```

The backend (API Gateway, Lambda, DynamoDB) still deploys separately via `sam deploy`, triggered by the GitHub Actions workflow in `.github/workflows/deploy.yml`. `frontend/config.js` holds the deployed API URL and Cognito IDs that connect this hosted frontend to that backend — update it manually whenever the backend stack's outputs change.

 

---

## Running tests locally (do this first, before any AWS deploy)

```bash
pip install -r tests/requirements-test.txt
pytest tests/ -v
```

All 5 tests should pass — they cover successful registration, an
unknown-event rejection, invalid-email rejection, listing events, and the
full register → look-up → cancel → cancel-again(404) flow. Green tests here
mean your business logic is correct *before* you spend a single AWS credit.

## Troubleshooting

1. **GitHub Actions deploy failing: "Could not load credentials from any providers"**

    Symptom: every push to main triggered Test and Deploy, but the deploy job failed immediately with a credentials error.

    Cause: .github/workflows/deploy.yml was written for OIDC-based AWS authentication
    (role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}), but no IAM role or repo secret had
    actually been created for it yet — the secret was empty.

    Fix: switched the workflow to plain IAM access-key authentication
    (aws-access-key-id / aws-secret-access-key), backed by an IAM user with the managed
    policies sam deploy needs (CloudFormation, IAM, API Gateway, Lambda, DynamoDB, Cognito,
    SNS, CloudWatch, S3). Added AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY as GitHub repo
    secrets. OIDC remains the more secure long-term option if this gets revisited later.

2. **A duplicate nested project folder, twice**

    Symptom: git status reported the whole project folder as a "modified, untracked
    submodule," and git push failed with non-fast-forward errors that didn't make sense.

    Cause: at two separate points, a full duplicate copy of the project folder ended up
    nested one level inside itself, with its own .git folder — Git then treated it as a
    broken submodule reference rather than normal files.

    Fix: deleted the stray inner folder, then git rm -r --cached the leftover tracked
    entries so Git stopped watching it. The second occurrence traced back to OneDrive creating
    a "conflict copy" (see #5).

3. **.gitignore silently not working**

    Symptom: .aws-sam-new/ and build.toml kept showing up as untracked files even
    though they were listed in .gitignore.

    Cause: the file had been partly written in UTF-16 (visible as null bytes between
    characters when inspected), likely from a PowerShell >> redirect, which defaults to
    UTF-16. Git couldn't parse the corrupted lines as valid ignore patterns.

    Fix: rewrote .gitignore from scratch in plain UTF-8.

4. **A frontend bug that kept reappearing after being fixed**

    Symptom: registering for an event threw Cannot read properties of null (reading 'reset') in the browser console — fixed, tested, confirmed working, then reappeared after
    the next deploy, more than once.

    Cause: event.currentTarget.reset() was being called after an await inside an
    async event handler. By the time the awaited request resolved, the browser had already
    reset event.currentTarget to null — standard DOM behavior, not a typo. The fix itself
    also kept vanishing from main due to #5 below.

    Fix: capture the form element into its own variable before the await, then call
    .reset() on that captured reference instead of event.currentTarget.

5. **Fixes silently reverting — the project lived inside a OneDrive-synced folder**

    Symptom: committed, pushed, merged fixes sometimes didn't appear in the next deploy;
    git pull occasionally failed with a permission error on .git/FETCH_HEAD; OneDrive once
    prompted to delete 225 files — including Git's own internal MERGE_MSG — after a
    routine git pull.

    Cause: the repository lived under OneDrive\Documents\.... OneDrive continuously
    syncs and locks files in the background, directly conflicting with Git's own rapid file
    writes during pulls, merges, and checkouts.

    Fix: moved the entire project to a plain local folder outside any sync tool
    (C:\Projects\...). This class of problem stopped entirely afterward. Lesson: never run
    a Git repository inside a OneDrive/Dropbox/Google Drive–synced folder.

6. **Silent email-lookup failures — the trickiest bug**

    Symptom: GET /registrations/{email} always returned zero results — even for emails
    confirmed to have just registered successfully. No errors anywhere.

    Investigation, ruling out one layer at a time: the DynamoDB record existed with the
    correct email; the EmailIndex GSI was active with the correct key; a direct
    aws dynamodb query from the CLI found the item successfully; the Lambda's table
    environment variable was correct; the deployed code matched the repo. A temporary debug
    line added directly in the Lambda console (later overwritten by the next automatic CI/CD
    deploy) revealed the actual raw value the function received: 'jakestamps2%40gmail.com'
    — still URL-encoded.

    Cause: API Gateway was passing the path parameter through to Lambda without decoding
    %40 back to @. The function queried DynamoDB for the literal encoded string, which
    never matched the stored, unencoded email.

    Fix: wrapped the email in Python's urllib.parse.unquote() before querying.

7. **Admin login failing with "Incorrect username or password" — despite correct credentials**

    Symptom: the admin dashboard rejected a login independently verified as correct via
    aws cognito-idp initiate-auth, which succeeded and returned a valid token.

    Investigation: ruled out account status, app client auth flow settings, password
    policy, and the frontend's request code, which matched the working CLI call exactly. The
    browser showed a genuine 400 from Cognito itself, not a frontend bug.

    Cause: unrelated to Cognito entirely — three separate python -m http.server
    processes from earlier sessions were still running in the background on port 8000,
    including one started from the wrong folder. The browser was intermittently served by a
    stale, wrongly-located server instance.

    Fix: netstat -ano | findstr :8000 to find every process on the port, taskkill /PID <pid> /F on each, then start one fresh server. Lesson: when local behavior seems
    impossible given the code, check for zombie background processes before re-reading the
    code again.
