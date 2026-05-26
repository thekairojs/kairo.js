# THE KAIRO HANDBOOK
### *A Complete Guide to the Framework That Makes Security Inevitable*

---

> *"From the Greek kairos — not clock time, but the perfect decisive moment. The instant when conditions align and the right action must happen."*

---

This handbook is for everyone. The senior engineer who has shipped twelve production APIs and patched eight of them after a breach. The junior developer who just learned what a middleware is. The AI agent that was handed a task and told to build an API. The tech lead reviewing a pull request at midnight trying to figure out if the authentication logic is correct. The founder who doesn't write code but needs to understand what their team just adopted and why it matters.

You do not need a security background to read this. You need a willingness to think clearly about a problem that the industry has been solving incorrectly for fifteen years, and the patience to understand a different approach.

Read it like you are sitting in a lecture hall. Some parts will feel obvious in retrospect. Some will make you uncomfortable. A few will change how you think about writing software. That is the point.

Five chapters. Each one builds on the last. Do not skip ahead.

---

<br>

# CHAPTER ONE
## The Problem Nobody Wanted to Name

### *On why the internet is held together with duct tape, why that used to be acceptable, and why it is no longer acceptable at all*

---

### 1.1 — Let's start with a house

Imagine you are building a house.

You hire a contractor. The contractor builds you walls, a roof, floors, windows, a kitchen, three bedrooms. The house looks beautiful. You move in. Two months later you realize there are no locks on the doors. There are no latches on the windows. The front door has a glass panel that anyone could reach through to turn the handle. The basement has a crawlspace with no external facing.

You go back to the contractor. "Where are the locks?"

The contractor says, "Oh, locks aren't my department. You'll need to hire a locksmith for that. Also a security company for the alarm system. Also someone to install cameras. And probably someone to assess whether your windows are burglar-proof — there's a great specialist for that, very well reviewed. And there's this popular package called Helmet that puts reinforced glass on your front door, you should definitely install that."

You ask, "Why didn't you build this into the house from the start?"

The contractor says, "Because that's not how we've always done it. Also our customers never asked for it until after they got broken into."

That is the story of web framework security in twenty-first century software development. And the contractor's name is Express.js.

The analogy is more precise than it first appears. A house is a structure you build inside of. You do not rebuild the house for each family that moves in — you build it once and the structure serves everyone who lives there. A web framework is the same. You build your application inside of it. If the framework has no security, every application built inside it lacks security. If the framework has security built into its structure, every application inherits that security without asking for it.

The economics of this matter enormously. If a single developer installs locks on their own house, one house is secured. If the contractor builds locks into every house by default, millions of houses are secured. The leverage of making the right thing the default thing is one of the most powerful forces in software engineering, and it is almost never talked about in security discussions.

---

### 1.2 — Express did nothing wrong, and that's the problem

Let us be precise about something: Express.js is not a bad piece of software. It is, by most measures, one of the most influential pieces of JavaScript ever written. Released by TJ Holowaychuk in November 2010, it gave Node.js a usable routing layer, popularized the middleware pattern, and launched an ecosystem that today contains hundreds of thousands of packages.

TJ built Express with a specific philosophy that was deliberately minimalist: **give developers the absolute minimum and get out of the way.** Provide routing. Provide middleware composition. Provide a request and response abstraction. Everything else is the developer's problem.

In 2010 and 2011, this was exactly the right call. The web was simpler. Applications were smaller. Most web apps were CRUD interfaces backed by MySQL. A "security incident" usually meant someone forgot to hash a password or left a SQL query concatenated with user input. The threat surface was manageable. Developers were professionals who understood what they were building.

But the world changed. Here is a timeline worth sitting with:

**2010**: Express 1.0 ships. Node.js has been around for one year. There are roughly 500 npm packages. A "web app" typically means a server-rendered HTML page with a few API endpoints.

**2013**: The REST API becomes the dominant architectural pattern. Frontend frameworks begin to emerge. APIs are now the primary interface between frontend applications and backend data. The attack surface doubles.

**2015**: npm has 200,000 packages. The microservices architecture is mainstream. A single application might have fifty internal API endpoints and talk to a dozen external services. Every service is a potential entry point.

**2017**: JWT becomes the de-facto authentication standard. It is also, when misconfigured, one of the easiest authentication systems to bypass. The "alg: none" attack is documented. Thousands of production APIs are vulnerable because developers copy-pasted JWT examples without understanding the algorithm validation requirement.

**2019**: In a single year, Capital One loses 100 million customer records. Facebook loses 540 million user records. Elasticsearch instances with no authentication expose 2.7 billion records. These are not sophisticated attacks. They are misconfigurations, missing auth, and absent input validation.

**2021**: Supply chain attacks become mainstream. Log4Shell affects hundreds of millions of Java applications. The average Node.js application has 1,200 transitive dependencies. A vulnerability in any one of them is a vulnerability in your application.

**2023**: AI coding assistants generate more than 30% of the code at many companies. The code they generate is only as secure as the patterns they were trained on. The patterns they were trained on are Express patterns from Stack Overflow from 2015.

**2024**: There are over 6,000 CVEs related to npm packages. Automated vulnerability scanners probe every public IP address on the internet every few minutes. There are criminal organizations with full-time engineering teams whose business model is finding and exploiting unpatched Node.js APIs.

Express's philosophy did not evolve with any of this. The framework still gives you routing and middleware composition. Everything else is still your problem. The bolt-on approach — install helmet, install rate-limit, install cors, install passport — is still the standard.

This is not a criticism of Express. Express did what it was designed to do, and it did it brilliantly. The criticism is of the ecosystem that grew around Express without ever questioning the assumption that security is something you add afterward.

---

### 1.3 — The bolt-on model and why it fails

Let me describe what actually happens when a professional developer secures an Express API. Not what the tutorials say happens. What actually happens.

You start a new project. You `npm install express`. You write your first route. You think: I should add authentication. You `npm install jsonwebtoken`. You find an example online. You implement it. The example uses `verify()` without explicitly specifying the allowed algorithms. This is fine for most cases but vulnerable to algorithm confusion attacks in edge cases. You don't know this because the example doesn't mention it.

You think: I should add rate limiting. You `npm install express-rate-limit`. You add it. The default configuration limits by IP address. You are running behind a load balancer that adds an `X-Forwarded-For` header. You set `trustProxy: true`. Now your rate limiter trusts whatever IP the client puts in `X-Forwarded-For`. This is a known bypass. You don't know this because the default configuration doesn't warn you.

You think: I should add input validation. You look at your options. Joi? Zod? Yup? Express-validator? You spend an hour reading comparison articles. You pick Zod. You write schemas for some of your endpoints. Not all of them — you're in a hurry and the other endpoints "don't accept user input" (they do, they accept URL parameters, but you've stopped thinking of those as user input).

You think: I should add security headers. You `npm install helmet`. You add `app.use(helmet())`. Helmet adds a dozen security-relevant HTTP headers. The default configuration is reasonable. But the `Content-Security-Policy` header in default helmet allows `unsafe-inline` in some configurations. You don't know this. You feel safer because the helmet README says "Helmet helps you secure your Express apps by setting various HTTP headers."

You deploy. Your application has:
- A JWT implementation that is correct for the happy path but has edge cases
- A rate limiter that can be bypassed by clients who understand your proxy setup
- Input validation on 70% of your endpoints
- Security headers that are better than nothing but not optimal
- No PII scanning on outbound responses
- No behavioral analysis of incoming requests
- No anomaly detection
- No visibility into what a sophisticated attacker is doing to your endpoints right now

And here is the part that nobody talks about: **even if you had done all of this perfectly, you still wouldn't have security visibility.** You would have static guards. Guards that cannot adapt, cannot communicate with each other, and cannot tell you anything about what is happening at runtime.

This is the bolt-on model's fundamental failure. Security packages installed on top of an insecure framework are not integrated. They don't share state. Helmet doesn't know what rate-limit is doing. Rate-limit doesn't know what your JWT library is doing. Your JWT library doesn't know what Zod is doing. Each package exists in isolation, checking one thing, returning true or false, and stepping aside.

A sophisticated attacker does not work in one dimension. They probe your rate limiter's configuration. They test your JWT implementation's edge cases. They look for endpoints that your validation doesn't cover. They read the error messages your application returns when something goes wrong, because those error messages tell them what you're using and what version.

A pile of disconnected packages cannot defend against a multi-dimensional attack because the packages cannot see each other.

---

### 1.4 — The shape of a modern attack: a detailed walkthrough

Pull up a chair. Let me tell you exactly how a real automated attack on an Express API works.

It does not start with a human. It starts with a **scanner** — an automated tool that runs on cloud infrastructure and sends thousands of HTTP requests per hour to millions of IP addresses. The scanner has a list of patterns to check. It is not looking for a specific vulnerability in your specific application. It is casting a net, checking all the common things, noting which ones get interesting responses.

The scanner's first pass looks like this. It sends a GET request to your root path with User-Agent `Mozilla/5.0` — a real browser user agent, to avoid any basic bot detection. If your server responds with a 200, you're noted as an active server. Then it probes:

- `/.env` — looking for exposed environment files
- `/.git/config` — looking for exposed git configuration
- `/wp-admin`, `/wp-login.php` — checking if you're running WordPress
- `/api/v1`, `/api/v2`, `/api` — looking for REST API roots
- `/swagger.json`, `/openapi.json` — looking for API documentation that reveals your full endpoint surface
- `/health`, `/status`, `/ping` — looking for status endpoints that might reveal your stack and version

None of this hits your rate limiter because it's all spread across different IP addresses in the scanner's pool. It looks like normal traffic. Your logs show GET requests to those paths. You might not even notice.

The scanner gets a 404 on `/.env` and moves on. But here is what it noticed: your 404 response body says `Cannot GET /.env`. That string is characteristic of Express. The scanner now knows you're running Express, probably version 4.x.

Your `GET /api/v1` returns a response. The scanner notes the response headers. `X-Powered-By: Express` is present (you forgot to call `app.disable('x-powered-by')`). Now it knows for certain you're on Express. It also notices that your Content-Type header doesn't include a charset. Small detail. Noted.

The scanner tries a few Express-specific paths. `/api/v1/users`. Your application returns a 401 Unauthorized. The scanner notes that `/api/v1/users` exists and requires authentication. It also notices that the 401 response body includes `{"error":"No token provided"}` — now it knows you're using JWT and looking for a token.

The scanner starts testing your JWT implementation. It sends a request with `Authorization: Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6ImFkbWluIn0.` — a JWT with algorithm "none", a known bypass technique. If your JWT library isn't configured to reject this, you're compromised.

Your application rejects it. But the error message is revealing: `{"error":"jwt malformed"}`. The specific error string `jwt malformed` is from the `jsonwebtoken` package. The scanner now knows exactly which JWT library you're using.

Meanwhile, a different scanner in the pool has been probing `/api/v1/users` with varying query parameters. It discovered that `?id=1` returns a user object. It discovered that `?id=abc` returns `{"error":"invalid ID format"}` while `?id=1.5` returns `{"error":"user not found"}`. From these different error responses, it has inferred that your ID is a non-decimal integer. It's now enumerating users: `?id=1`, `?id=2`, `?id=3`...

Your rate limiter is set to 100 requests per minute per IP. The scanner is sending 1 request per minute from 100 different IP addresses. It is not hitting your rate limit.

Your application is leaking information through error messages, through response timing differences, through headers you forgot to remove. All of this is happening silently. Your logs show nothing unusual. You won't know anything went wrong until one of three things happens: you find the data on a forum, a security researcher contacts you, or your users start reporting unauthorized access to their accounts.

None of the bolt-on packages you installed protected you from this. Helmet set your HTTP headers correctly. Rate limit would have triggered if the attack came from one IP. JWT verification was correct. Zod validated the inputs you thought to validate. But none of them knew what the others were doing. None of them could see the pattern.

---

### 1.5 — What a security-aware request would have looked like

Let me replay the same attack but this time your API is built on KAIRO.

The scanner's first request hits the Request Membrane. The membrane checks the request headers. User-Agent is `Mozilla/5.0` — looks like a browser. But Accept header is absent. Accept-Language is absent. Accept-Encoding is absent. A real browser sends all three. The entropy score starts at `0.1`.

The path is `/.env`. KAIRO has a ghost route registered for `/.env`. Before the response is sent, the ghost route handler adds `0.4` to the IP's entropy score. The response is `200 OK` with an empty body. The scanner receives what looks like a positive result and notes it. KAIRO notes that this IP has a score of `0.5` after one request.

The scanner's second request comes from a different IP in the pool. It hits `/.git/config`. Another ghost route. That IP's score jumps to `0.5` immediately.

The scanner's third batch comes from a dozen IPs. They're probing `/api/v1/users`, `/api/v2/users`, `/api/users`. Each of these returns 404. But the membrane is tracking path diversity: these IPs are visiting many different paths very quickly. The IP behavior signal adds `0.2` to each score. Several of these IPs are now above `0.65`.

The scanner that found `/api/v1/users` sends its first legitimate probe with `Authorization: Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0...`. The hardening layer has a threshold of `0.75`. This IP's score is `0.72` after the ghost route hit and the path enumeration. The request reaches the JWT check, fails, and the validation failure adds `0.1` to the entropy score. Score is now `0.82`. Hardening blocks the next request from this IP with a plain rejection that reveals nothing.

The user enumeration attempt — `?id=1`, `?id=2` — never gets far because the first few requests from the scanner IPs have already elevated their entropy above the hardening threshold. The scanner is blocked before it accumulates enough data to be useful.

The attacker adjusts. They slow down the scan. They use fresh IPs. They try different tactics. Some requests get through. But KAIRO is tracking behavioral patterns, not just individual requests. The slower the attack, the more data KAIRO accumulates about the behavioral profile. Eventually the timing signal catches the unusual inter-request cadence. The entropy goes up.

None of this required you to configure anything beyond a threshold. You didn't write code to detect the "alg: none" bypass. You didn't write code to detect path enumeration. You didn't write code to detect scanner User-Agent patterns. The membrane did it because recognizing hostile behavior is part of what the framework does.

---

### 1.6 — The new variable: AI writes the code now

For the first twelve years of the Node.js ecosystem, the problems described above were, in a sense, manageable. Developers were professionals who could, if they chose to, learn about security and implement it carefully. The bolt-on approach was clunky but at least required a human decision at each step.

That calculus changed in 2022.

AI coding assistants — GitHub Copilot, Claude, GPT-4, Cursor, and the dozens of tools that followed — have fundamentally changed the way software is written. By most estimates in 2024, AI assists with 30% to 70% of production code at companies that have adopted these tools. At some companies, AI writes first drafts of entire modules and developers review and adjust.

This is not inherently bad. The productivity gains are real. The democratization of software development is real. The ability to ship faster, iterate faster, and focus human attention on architecture rather than boilerplate — these are genuine benefits.

The problem is what AI generates **by default**.

AI models are trained on code. The vast majority of Node.js code on the internet uses Express. The vast majority of Express code on the internet was written before modern security practices were common, and a significant fraction of it has security issues. So when you ask an AI agent to "build me a user authentication API in Node.js", you get:

```ts
const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const app = express()

app.use(express.json())

app.post('/login', async (req, res) => {
  const { username, password } = req.body
  const user = await User.findOne({ username })
  if (!user) return res.status(401).json({ error: 'Invalid credentials' })
  const valid = await bcrypt.compare(password, user.password)
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' })
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET)
  res.json({ token })
})
```

This code looks correct. It is mostly correct. It uses bcrypt. It uses JWT. It doesn't leak whether the username or password was wrong (good). But:

- The JWT has no expiration. Tokens live forever.
- The algorithm is not specified. Defaults to HS256 which is fine, but not explicit.
- There is no rate limiting. You can attempt passwords forever.
- There is no input validation. `username` and `password` could be objects, arrays, null, or 10 MB strings.
- The error response says "Invalid credentials" regardless of whether the user exists or the password is wrong — good! But the timing is different: the user lookup has database latency, but the password comparison only happens if the user exists. A timing attack can distinguish "user does not exist" from "wrong password."
- There is no CORS configuration.
- `X-Powered-By: Express` is still in the response headers.

None of this is the AI's fault. The AI generated code that matches patterns in its training data. The training data is mostly Express code from the internet. The internet's Express code has these patterns.

You have two choices when you understand this.

**Choice one: write a very detailed system prompt.** Before every coding session, before every new project, before every new AI agent, you prepend a 500-token security requirements specification:

> "When generating Node.js code, always use helmet() for security headers. Always use express-rate-limit for rate limiting. Always validate all inputs using zod. Always specify the JWT algorithm explicitly as HS256. Always set JWT expiration to 1 hour. Always disable X-Powered-By. Always configure CORS explicitly. Never log user passwords even in error cases. Always use parameterized queries for database operations. Never return stack traces in production error responses..."

Anyone who has tried this approach knows what happens. The tokens are expensive. The AI sometimes follows the instructions and sometimes doesn't. Context windows run out and the instructions are forgotten. A new agent is spun up without the system prompt. A new developer joins the team and doesn't know about the system prompt. The system prompt gets outdated when you change your validation library.

More fundamentally: security requirements specified as text instructions are not verifiable. You can tell the AI to use rate limiting, but the AI cannot verify that the rate limiting is configured correctly, that it will survive behind a proxy, that its configuration is consistent with the rest of the security setup. The AI generates code that looks like it implements the instruction, and it might, but you can't be certain without a careful review.

**Choice two: use a framework where the security is built in.**

When the framework is secure by default, you don't need a system prompt. You tell the agent "use KAIRO" and the agent generates:

```ts
import { createApp } from '@thekairojs/kairo'
import { createMembrane } from '@thekairojs/kairo-membrane'
import { createHardening } from '@thekairojs/kairo-hardening'

const app = createApp()
app.use(createMembrane())
app.use(createHardening({ threshold: 0.75 }))
```

And the application has entropy scoring, behavioral analysis, rate-limiting via entropy gates, and active blocking of hostile traffic. The agent didn't need to know about any of these things. The framework brought them.

This is the leverage that a security-substrate framework provides that a security-optional framework never can: **the security is in the dependency, not the instruction.**

---

### 1.7 — The four categories of security mistakes

Before we close this chapter, let's name the four categories of security mistakes that occur in production Node.js applications. Understanding these categories is the lens through which KAIRO's architecture will make sense.

**Category 1: Forgotten configurations**

Things that would have been secure if someone had remembered to configure them. Helmet installed but Content-Security-Policy not tightened. JWT library included but algorithm not specified. CORS configured for development origins in production. These mistakes are so common they are almost universal. They happen because security configuration requires expertise, time, and attention — all of which are scarce.

KAIRO's answer: sensible defaults. Every security mechanism has a default configuration that is correct and safe. You can tighten it, but the default does not leave you exposed.

**Category 2: Disconnected packages**

Security packages that work independently but cannot defend against attacks that span their responsibilities. The rate limiter doesn't know about JWT failures. The JWT library doesn't know about input validation failures. You need all four signals together to recognize a credential stuffing attack, but none of your packages can see each other's signals.

KAIRO's answer: the shared security context. `ctx.kairo` is readable by every middleware in the chain. Every signal accumulates in one place. Every layer can see everything the layers before it discovered.

**Category 3: Invisible failures**

Attacks that succeed without triggering any log entry or error response. The user enumeration attack from section 1.4. The slow-burn path enumeration. The scanner that hits two ghost routes and then goes quiet for an hour before resuming. None of these produce an error. None of them trigger an alert. You don't know they happened.

KAIRO's answer: behavioral tracking and the security event system. Every notable event is emitted as a structured event. The IP tracker builds a behavioral profile over time. A scanner that spreads its activity over an hour still accumulates entropy across that hour.

**Category 4: Output leaks**

Data that should never leave your application that exits silently through an API response. A query that accidentally returns too many rows. A PII field that was supposed to be excluded from the response but wasn't. A JWT that somehow ended up in a user record. A canary record that appears in an API response because a developer wrote an overly broad query.

KAIRO's answer: the Data Shield and canary records. Outbound responses are scanned before they hit the wire. Canary tokens are monitored across the lifetime of the application.

These four categories cover the vast majority of real-world API security failures. KAIRO addresses all four at the framework level, not the application level.

---

### 1.8 — What KAIRO is not

A framework is defined as much by what it excludes as by what it includes.

**KAIRO is not a WAF.** A Web Application Firewall sits in front of your application and blocks requests based on pattern matching. A WAF is a separate infrastructure component, usually managed by a security team. KAIRO is an application framework. It lives in your code, understands your application's structure, and makes security decisions based on the full context of a request — not just its surface properties.

**KAIRO is not a vulnerability scanner.** Tools like Snyk, Dependabot, and npm audit scan your dependencies for known CVEs. They are valuable and you should use them alongside KAIRO. KAIRO does not replace them. KAIRO addresses runtime security; dependency scanning addresses static security.

**KAIRO is not an intrusion prevention system.** An IPS operates at the network layer and blocks connections based on network-level patterns. KAIRO operates at the application layer and blocks requests based on behavioral signals. These are complementary approaches. KAIRO is not trying to replace network security infrastructure.

**KAIRO is not a compliance tool.** SOC 2, ISO 27001, HIPAA, PCI-DSS — these are compliance frameworks. KAIRO generates security events that are relevant to compliance, and future versions will include compliance export features. But implementing KAIRO does not by itself make you compliant with anything. Compliance requires policies, processes, and controls that extend far beyond your API framework.

**KAIRO is not magic.** It cannot protect you from a compromised developer account, a misconfigured cloud storage bucket, a social engineering attack, or a vulnerability in your database engine. It protects the request lifecycle — the path from HTTP request to HTTP response — and it does that job extremely well.

What KAIRO is: a Node.js application framework that treats security as a structural property of the application rather than a layer you add on top. In the same way that a compiled language treats type safety as a property of the program rather than something you check at runtime, KAIRO treats security as a property of the request lifecycle rather than something you check with external packages.

---

### 1.9 — The one rule

Before we go any further, there is one principle that governs every decision in KAIRO's design. Write it down. Read it again when something doesn't make sense.

> **KAIRO never says no to the developer. It says "yes, and here is how I made that safe."**

Security frameworks have historically worked through restriction. Don't do this. Block that. You cannot do X without first doing Y. The result is friction, workarounds, and developers who disable security features because they slow down development or prevent patterns the developer needs.

KAIRO doesn't restrict. It wraps. Whatever you build, KAIRO builds security around it. The developer's intent is always honored. The framework's job is to ensure that intent cannot be weaponized.

This is not idealism. It is engineering discipline. A security system that developers route around is worse than no security system, because it creates the illusion of protection without the substance. KAIRO is designed to be easy to build with, to stay out of your way, and to do its work silently and correctly without requiring you to think about it constantly.

In the next four chapters, we will see exactly how that principle manifests in architecture, features, code, and philosophy.

---

<br>
# CHAPTER TWO
## The Architecture
### *Seven layers, one philosophy, and why the order matters more than anything else*

---

### 2.1 — Two mental models for understanding KAIRO's architecture

Before we look at the layers individually, you need two mental models. One gives you the big picture. The other explains the internal mechanics. Hold both at the same time and the architecture will click.

**Mental model one: the water treatment plant.**

When water travels from a river to your tap, it does not take a straight path. It passes through a treatment plant that applies a series of processes in a specific order. In the first stage, large debris — leaves, branches, sediment — is filtered out with screens. In the second stage, chemicals are added to cause smaller suspended particles to clump together, a process called flocculation. In the third stage, the now-clumped particles settle to the bottom. In the fourth stage, the water is filtered through sand and gravel, removing the remaining fine particles. In the fifth stage, it is disinfected with chlorine or UV light. In the sixth stage, pH is adjusted. Finally, it is tested and enters the distribution network.

Notice several things about this process. First, each stage has a single, specific job. The flocculation stage does not also do disinfection. The testing stage does not also do filtration. Separation of concerns is structural, not optional.

Second, the stages have a defined order for a reason. You cannot disinfect water before you filter it, because the organic matter in unfiltered water would react with the disinfectant and create harmful byproducts. You cannot test the water before treatment, because the test would fail. The order is not arbitrary — it reflects dependencies between stages.

Third, each stage assumes the previous stage has done its job correctly. The sand filter assumes the flocculation stage has already clumped the large particles. If you skip a stage, the downstream stages will not compensate — they will simply fail to do their job correctly on inadequately prepared input.

KAIRO's pipeline has all of these properties. Each layer has a single job. The layers have a defined order with defined dependencies. Each layer assumes the layers before it have done their work.

**Mental model two: the border crossing.**

A border crossing is a good model for the authorization and identity aspects of KAIRO's pipeline. When a traveler crosses an international border, they don't interact with a single official who checks everything. They pass through multiple checkpoints, each with a specific mandate.

First checkpoint: document inspection. Is the passport real? Is it current? Is the person on a watchlist? This checkpoint does identity verification and flags.

Second checkpoint: customs declaration. Does the traveler have anything to declare? Are the declared items legal? This checkpoint is about what they're carrying.

Third checkpoint: secondary inspection (for flagged travelers). A deeper look — where have you traveled? What is the purpose of your visit? Who will you be staying with? This checkpoint runs only when earlier checkpoints flagged something.

Exit scan: leaving the country, there's a scan for items that can't be exported.

The border crossing model maps onto KAIRO as follows: the membrane is the document inspection. It doesn't know anything about your business logic — it just looks at the properties of the request and makes a preliminary assessment. The lattice is the customs declaration — it asks about intent and identity. The hardening layer is secondary inspection — it acts only on requests that earlier layers flagged. The shield is the exit scan — it looks at what's leaving.

---

### 2.2 — The seven layers at a glance

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  INBOUND REQUEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Layer 1: Request Membrane      @thekairojs/kairo-membrane
           Score, taint, HMAC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Layer 2: Intent Engine         @thekairojs/kairo-intent (v1.1)
           Pattern classification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Layer 3: Trust Lattice         @thekairojs/kairo-lattice
           none < low < medium < high
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Layer 4: Developer Code        Your handlers
           The application
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Layer 5: Data Shield           @thekairojs/kairo-shield
           PII scanning, redaction
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Layer 6: Runtime Sentinel      @thekairojs/kairo-sentinel
           Anomaly detection, canaries
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Layer 7: DX / Hardening        @thekairojs/kairo-dx
                                 @thekairojs/kairo-hardening
           Validation, blocking, logging
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  OUTBOUND RESPONSE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Each layer is a separate npm package that you opt into. The core package — `@thekairojs/kairo` — provides the router, the context object, and the app instance. Every security layer is optional. You can use none of them, some of them, or all of them.

The power is in the combination. A membrane without hardening scores every request but never acts on the scores. A hardening layer without a membrane has nothing to act on. The layers are designed to work together, and the full stack is the intended configuration for production.

---

### 2.3 — Layer 1: The Request Membrane (in depth)

The membrane is the first thing that runs on every request. Before any route matching, before any application middleware, before any authentication — the membrane processes the request and populates `ctx.kairo` with the initial security assessment.

Think of the membrane as a portrait artist who is also a forensic analyst. Within the first few seconds of meeting someone, they note everything: the quality of the handshake, the clarity of the eyes, the way the person is dressed, the words they choose, the cadence of their speech. They don't make a final judgment on these observations alone. But they note them. They form a preliminary impression that the rest of the conversation will either confirm or revise.

The membrane does four things:

**1. Header analysis.** The membrane reads every header in the incoming request and computes a header anomaly score. This is more sophisticated than checking a blocklist of bad User-Agents. It builds a model of what a normal browser request looks like:

- A real browser sends `Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8`
- A real browser sends `Accept-Language: en-US,en;q=0.5`
- A real browser sends `Accept-Encoding: gzip, deflate, br`
- A real browser sends a `Sec-Fetch-*` family of headers in modern versions
- A real browser does not send `Accept: */*` by itself
- A real browser does not send `Content-Type: application/x-www-form-urlencoded` with a GET request
- A real browser User-Agent string follows a recognizable pattern

The more a request deviates from this model, the higher its header anomaly score. A scanner sending only `User-Agent` and `Accept: */*` will have a significantly elevated header score.

The membrane also checks for injection characters in header values — null bytes, newlines, tab characters, SQL keywords in unusual positions, shell metacharacters. These are not common in legitimate requests.

**2. IP behavior tracking.** The membrane maintains an in-process IP tracker that records behavioral metrics for each IP address it has seen within a rolling window (default: 15 minutes). For each IP, it tracks:

- Total request count in the current window
- Number of distinct paths visited
- Number of ghost route hits
- Number of validation failures
- Timestamp of first and most recent request

From these metrics, the membrane computes an IP behavior score. An IP that has visited 40 different paths in 10 minutes is exhibiting enumeration behavior. An IP that has hit three ghost routes is exhibiting probing behavior. An IP that has generated ten validation failures in two minutes is exhibiting fuzzing behavior.

The IP tracker is configurable: you can set the window size, the maximum number of tracked IPs before older entries are pruned, and the weights for each signal.

**3. Payload analysis.** For requests with bodies, the membrane computes a payload score based on size anomalies and content type mismatches. If your API typically receives JSON payloads of 100–500 bytes and a request arrives with 50 KB of JSON, that's unusual. If a request declares `Content-Type: application/json` but the body starts with `<`, that's a mismatch worth noting.

The membrane does not parse the full body for entropy analysis — that would be expensive and would require buffering the entire request. It looks at the declared content type and the body size relative to a rolling average.

**4. Timing analysis.** The membrane records the timestamp of each request from each IP and computes the inter-request interval. The timing score captures whether requests are arriving at an inhuman cadence. A human browsing an API might send a few requests per minute. A scanner might send dozens per second, then pause, then send more. The cadence pattern is distinctive.

The membrane outputs a composite entropy score:

```
entropy = (header_score × 0.30) + (ip_behavior_score × 0.35) +
          (payload_score × 0.20) + (timing_score × 0.15)
```

This score, clamped to `[0.0, 1.0]`, is written to `ctx.kairo.entropy`. It is available to every subsequent middleware in the chain.

The membrane also performs **taint initialization**: it marks every incoming input path — `ctx.query.*`, `ctx.body.*`, `ctx.params.*` — as tainted in `ctx.kairo.taintedPaths`. These marks represent the set of external inputs that have not yet been validated.

Finally, if HMAC signing is configured, the membrane verifies the request signature. KAIRO supports signing requests with a shared HMAC key. When a request arrives with an `X-Kairo-Signature` header, the membrane verifies the signature against the request body. If verification fails, the request is flagged with a high entropy score. This feature is primarily useful for service-to-service communication where you want to ensure requests originate from a trusted source.

---

### 2.4 — Layer 2: The Intent Engine (preview)

The Intent Engine is the most conceptually ambitious layer in KAIRO's architecture, and as of v1.0 it exists in basic form. The full version ships in v1.1.

The core idea is this: every API endpoint has an **intended use contract**. The `/api/v1/login` endpoint is supposed to receive POST requests with a JSON body containing a username and password. It is supposed to be called by users who are trying to authenticate. It is not supposed to receive binary data. It is not supposed to receive requests at 500 per second. It is not supposed to receive requests from IP addresses that have never seen the application before and have already hit three ghost routes.

The Intent Engine learns these contracts from actual traffic over time. It observes what normal requests to each route look like — their size distribution, their content types, their authentication patterns, their temporal patterns — and builds a baseline model.

When a request deviates significantly from that baseline, the Intent Engine flags it as an `intent_drift` event and contributes to the entropy score.

This is different from the membrane's scoring, which is based on general patterns. The Intent Engine is route-specific. A request that looks perfectly normal to the membrane might still trigger an intent drift if it's unusual for that specific endpoint.

In v1.1, the Intent Engine will also support declared intent graphs for service-to-service APIs. You declare, at startup, which services are expected to call which endpoints. Any call that doesn't match the declared graph is flagged. This is particularly valuable for microservices architectures where lateral movement — a compromised service calling other services it shouldn't — is a significant threat.

---

### 2.5 — Layer 3: The Trust Lattice (in depth)

The Trust Lattice is KAIRO's authorization system. Let's understand why it works the way it does by first understanding the limitations of what came before it.

**The RBAC problem.** Role-Based Access Control has been the dominant authorization model in web applications for two decades. User has roles. Roles have permissions. Permissions grant access to resources. It works. It's well understood. It's also surprisingly brittle for modern applications.

The brittleness comes from two properties of RBAC: it is static and it is binary. A user either has the "admin" role or they don't. The "admin" role either grants access to a resource or it doesn't. There is no concept of degree, no concept of context, no concept of how much you should trust this particular request from this particular user at this particular moment.

Consider: a user with the "admin" role whose account was compromised thirty seconds ago has the same access permissions as a legitimate admin. The system cannot distinguish them. The roles are identical. The permissions are identical.

KAIRO's Trust Lattice takes a different approach, inspired by formal lattice theory in mathematics. Instead of a flat set of roles, it defines an ordered spectrum:

```
none < low < medium < high
```

This is a partial order. `none < low` means "low trust implies everything none trust has, plus more." The levels are cumulative. A `high` trust claim satisfies a route that requires `medium` trust. A `low` trust claim does not satisfy a route that requires `medium` trust.

The levels are intentionally abstract. You define what they mean in your `resolve` function:

```ts
const lattice = createLattice({
  resolve: async (ctx) => {
    // This function runs once per request and returns the trust claims
    const authHeader = ctx.headers['authorization']
    if (!authHeader) {
      return { level: 'none', roles: [], subject: undefined }
    }

    const token = authHeader.replace('Bearer ', '')
    try {
      const claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
      return {
        level:   claims.isAdmin ? 'high' : claims.isVerified ? 'medium' : 'low',
        roles:   claims.roles ?? [],
        subject: claims.sub,
        expiresAt: claims.exp,
      }
    } catch (err) {
      // Invalid token — treat as anonymous
      return { level: 'none', roles: [], subject: undefined }
    }
  },
})
```

The `resolve` function is async and has full access to the request context. It can query a database to check if a session is still valid. It can call an external auth service. It can check a Redis cache. It can do anything that returns a trust level.

The lattice caches the result of `resolve` in `ctx.kairo.lattice.claims` after the first call. All `lattice.require()` middleware within the same request reuses the cached result. You don't pay the resolution cost more than once per request.

**How `lattice.require()` works:**

```ts
app.get('/billing', lattice.require({ level: 'medium' }), async (ctx) => {
  // only runs if resolved trust level >= 'medium'
})
```

When a request reaches the `lattice.require({ level: 'medium' })` middleware, it checks `ctx.kairo.lattice.claims.level`. If the level satisfies the requirement, it calls `next()`. If it doesn't, it emits a `lattice_denied` security event and responds with a `403 Forbidden`. The response body is intentionally minimal — it does not tell the requester which level they need, only that they don't have access.

You can also require specific roles in addition to trust levels:

```ts
app.delete('/users/:id', lattice.require({ level: 'high', roles: ['admin'] }), handler)
```

**The interaction with entropy.** The lattice and the membrane interact through `ctx.kairo`. A user with `high` trust whose request has entropy `0.90` will still be blocked by the hardening layer before the lattice check runs, because the hardening layer runs earlier in the pipeline.

This is intentional and important. A compromised admin account will likely be accessed from an unusual IP, with unusual timing, from a device whose headers don't match the legitimate admin's normal device. These signals would elevate the entropy score. The hardening layer would block the request before the lattice check would grant access.

Trust levels describe who you are. Entropy describes how you're behaving. Both matter.

---

### 2.6 — Layer 4: Developer Code

Layer Four is your application. Your route handlers. Your business logic. Your database queries. Your email sending. Your PDF generation. Your payment processing.

The existence of Layer Four as an explicit position in the architecture is a statement about what KAIRO is not. KAIRO is not trying to replace your application logic. It is not opinionated about what your handlers do. It does not care if you're building a social network, a financial API, a healthcare platform, or a simple to-do list backend.

By the time a request reaches Layer Four, KAIRO has:
- Scored the request's entropy
- Marked all incoming fields as tainted
- Flagged any IP behavior anomalies
- (Optionally) blocked high-entropy requests
- (Optionally) resolved the requester's trust level
- (Optionally) run the request through the Intent Engine

Your handler receives a context object that is clean, annotated, and ready. You don't have to call `ctx.kairo.entropy` in your handler unless you want to. You don't have to interact with `taintedPaths` unless you want to. The security infrastructure is there if you need it and invisible if you don't.

```ts
app.post('/orders', lattice.require({ level: 'low' }), validate({ body: orderSchema }), async (ctx) => {
  // By this point:
  // - Request has been scored (ctx.kairo.entropy is set)
  // - Caller is verified to have at least 'low' trust
  // - Request body has been validated against orderSchema
  // - body.* fields have been removed from taintedPaths

  const order = await db.orders.create({ data: ctx.body })
  ctx.json(order, 201)
})
```

This handler does one thing: create an order. It doesn't need to think about security because the pipeline already handled it.

---

### 2.7 — Layer 5: The Data Shield (in depth)

The Data Shield is the most counterintuitive layer for developers who are used to thinking about security as something that only applies to inbound data.

The insight the shield is built on: **the most common source of sensitive data leaks is not injection attacks — it's your own code returning more data than it should.**

Think about how many times you've seen this:

```ts
app.get('/me', async (ctx) => {
  const user = await db.users.findUnique({ where: { id: ctx.userId } })
  ctx.json(user)  // returns ALL fields on the user object
})
```

What does the `user` object contain? `id`, `name`, `email`, yes. Also: `passwordHash`, `mfaSecret`, `resetToken`, `creditCardLast4`, `socialSecurityNumber` if your app stores that, `stripeCustomerId`, `internalNotes`, every field that was ever added to the users table, including the ones added by a developer at 11pm who was in a hurry.

The shield doesn't know your schema. It doesn't know what fields are supposed to be in a response. What it does know is what PII patterns look like in JSON:

- Email addresses: `[^@\s]+@[^@\s]+\.[^@\s]+`
- Credit card numbers: 13–19 digit sequences with valid Luhn checksums
- Social Security Numbers: `\d{3}-\d{2}-\d{4}`
- US phone numbers: `(?:\+1)?\s*\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}`
- AWS access keys: `AKIA[0-9A-Z]{16}`
- JWTs: `eyJ[A-Za-z0-9+/]+\.eyJ[A-Za-z0-9+/]+\.[A-Za-z0-9+/]+`
- Private IP addresses: `10\.\d+\.\d+\.\d+`, `192\.168\.\d+\.\d+`, `172\.(1[6-9]|2\d|3[01])\.\d+\.\d+`

When the shield finds one of these patterns in an outbound JSON response, it has two modes:

**Scan mode** (default): emit a `taint_neutralized` security event with the field path and pattern that matched, then let the response through unchanged. This gives you visibility without affecting behavior. You can see exactly which responses are leaking what.

**Redact mode**: replace matched values with `[REDACTED]` before sending the response. This actively prevents the data from leaving.

```ts
app.use(createShield({
  pii:    true,   // enable PII pattern scanning
  redact: false,  // scan only, don't modify responses
}))
```

The shield is implemented as response middleware. It intercepts the `ctx.json()` and `ctx.send()` calls, serializes the response body, runs the pattern scan, optionally redacts, and then sends the final response.

Performance note: the shield serializes and scans the response body. For large responses (multi-MB JSON arrays), this adds measurable latency. The shield is designed for API responses, not binary file transfers or streaming endpoints. You can exclude specific routes:

```ts
app.use(createShield({ pii: true, exclude: ['/exports', '/downloads'] }))
```

---

### 2.8 — Layer 6: The Runtime Sentinel (in depth)

The sentinel is the watchdog. It is always watching. It never sleeps. And it watches for things that don't look like individual attacks — it watches for patterns that only become visible over time.

The sentinel's primary responsibilities:

**Anomaly detection.** The sentinel builds running baselines for normal request characteristics across your API. Normal header structures. Normal path patterns. Normal payload sizes for each route. When any of these drift significantly from baseline, the sentinel emits an `entropy_spike` event and contributes to the IP's entropy score.

The anomaly detection uses a sliding window average with standard deviation. A request body that is three standard deviations larger than the average for that route is flagged. This catches attacks that your static rules would miss — for example, a payload that is 5 KB when your API normally receives 100 bytes, using a legitimate content type and a clean User-Agent.

**Canary record management.** The sentinel maintains the process-level registry of active canary tokens. When a canary token is created via `createCanary()`, the sentinel registers it with its source context — which request created it, which model it was written to, which user's session was active at the time.

When `scanForCanary()` is called (by the shield or by a database adapter), the sentinel looks up the token in its registry. If found, it emits a `canary_triggered` event with the full source context. This event contains enough information to answer the critical question: "how did this data get out?"

**Ghost route management.** The sentinel coordinates the ghost route registry. When you call `app.ghost('/path')`, the sentinel registers the path and its alert level. When a request hits a ghost route, the sentinel updates the IP's entropy score and emits a `ghost_route_hit` event.

The sentinel is also where KAIRO's event broadcasting happens. Every security event — from the membrane, from the lattice, from the hardening layer, from the shield — is routed through the sentinel's event bus before being delivered to your `onSecurityEvent` handler.

---

### 2.9 — Layer 7: DX and Hardening (in depth)

The DX and Hardening packages sit at the far edges of the pipeline — DX handling developer tooling that runs regardless of threat level, Hardening making the active security decision of whether a request proceeds.

**The Hardening layer** is the gate. It is simple in concept and critical in practice.

```ts
app.use(createHardening({ threshold: 0.75 }))
```

When a request arrives at the hardening middleware, it reads `ctx.kairo.entropy`. If the score is at or above the threshold, the request is terminated with a minimal response. The response gives nothing away:

```
HTTP/1.1 429 Too Many Requests
Content-Type: application/json

{"message":"Too many requests"}
```

No entropy score in the response. No indication of which signal triggered the block. No information about what to change to get through. The response is deliberately ambiguous. An attacker who is blocked learns only that they were blocked, not why.

The hardening layer has two modes:

`block` mode (default in production): requests above the threshold are blocked.

`log` mode: requests above the threshold are flagged with a `hardeningWouldBlock: true` flag in `ctx.kairo`, but the request proceeds. This is useful when you're first deploying KAIRO and want to observe its behavior without affecting production traffic.

The hardening layer also supports per-route thresholds. If your admin routes should be blocked at a lower entropy threshold than your public routes:

```ts
const hardening = createHardening({ threshold: 0.75 })
const strictHardening = createHardening({ threshold: 0.50 })

app.use(hardening)  // default threshold for all routes
app.get('/admin/*', strictHardening, handler)  // tighter threshold for admin
```

**The DX package** provides two things: the `validate()` middleware and the `devLogger()`.

The `validate()` middleware is documented in detail in Chapter Three. In the architecture context, note that it integrates with the security context: failed validations increase entropy by `0.1` and emit security events. Successful validations clear fields from `ctx.kairo.taintedPaths`.

The `devLogger()` middleware produces human-readable request summaries in development. In production it does nothing (detected via `NODE_ENV`). In development, it prints:

```
← GET /users/42
   entropy:       0.12
   trust:         low (user:abc123)
   tainted:       [query.search] — not validated
   security:      [ghost_route_hit: /.env suppressed] 
   duration:      4ms
   status:        200
```

This is the developer's window into KAIRO's internal state. Without it, the security mechanisms would be invisible. With it, you can see exactly what KAIRO is doing to each request while you're developing.

---

### 2.10 — How the layers communicate: the ctx.kairo object

This is the architectural detail that most people miss on first reading, and it is the key to understanding why KAIRO is more than the sum of its parts.

Every HTTP framework gives you some form of request context — a place to attach data that travels with the request through the middleware chain. Express gives you `req` and `res`. Fastify gives you `request` and `reply`. Koa gives you `ctx`.

KAIRO gives you `ctx` with a namespaced security compartment: `ctx.kairo`. This is a structured object that every KAIRO layer reads from and writes to.

```ts
interface KairoContext {
  entropy:         number                    // 0.0–1.0, set by membrane
  taintedPaths:    Set<string>              // set by membrane, cleared by validate()
  events:          SecurityEvent[]          // appended by every layer
  hardeningActive: boolean                  // set by hardening when it blocks
  lattice: {
    resolved:      boolean                  // true after resolve() runs
    claims:        TrustClaims | null       // set by lattice.use()
  }
  ipScore:         number                   // IP-behavior sub-score
  headerScore:     number                   // header-anomaly sub-score
  payloadScore:    number                   // payload-anomaly sub-score
  timingScore:     number                   // timing sub-score
}
```

The reason this matters so much is **cross-layer visibility**. The hardening layer can read the entropy score that the membrane set. The validation middleware can read the taintedPaths that the membrane initialized. The shield can read whether hardening fired. The sentinel can read the events that every previous layer emitted.

This is the property that a pile of disconnected npm packages fundamentally cannot have. When you install helmet, it doesn't know what your rate limiter knows. When you install rate-limit, it doesn't know what your JWT library knows. They are isolated functions. KAIRO's layers are part of a pipeline that shares state.

The `ctx.kairo` object also gives you access to the security context from your own handlers:

```ts
app.get('/risk-aware-endpoint', async (ctx) => {
  if (ctx.kairo.entropy > 0.5) {
    // This request is suspicious. Log it.
    await securityLog.write({ ip: ctx.ip, entropy: ctx.kairo.entropy, route: '/risk-aware-endpoint' })
  }

  if (ctx.kairo.taintedPaths.size > 0) {
    // There are inputs that haven't been validated. Be extra careful.
    ctx.status(400).json({ error: 'Request validation incomplete' })
    return
  }

  const result = await doSomethingExpensive()
  ctx.json(result)
})
```

The security context is not just for the framework's internal use. It is a first-class part of the API surface, available to your application code.

---

### 2.11 — Composability: using some layers, not all

A question that comes up in every evaluation: do I have to use all seven layers? What if I just want the lattice and the validation?

The answer is: use exactly the layers you need.

Every layer is independently optional. They are designed to work together, but they are not coupled in a way that requires all of them. The only hard dependency is between the membrane and any layer that reads entropy, because without the membrane, `ctx.kairo.entropy` is `0` by default.

A minimal KAIRO app for an internal service that doesn't need entropy scoring might look like:

```ts
const app = createApp()
const lattice = createLattice({ resolve: resolveFromApiKey })
app.use(lattice)

app.get('/internal/data', lattice.require({ level: 'high' }), handler)
```

No membrane. No hardening. Just auth. That's completely valid.

An app that wants scoring but not active blocking:

```ts
app.use(createMembrane())
// No createHardening() — we'll log but not block

app.onSecurityEvent((event) => {
  metrics.increment('kairo_events', { type: event.type })
})
```

The pipeline emits events, you observe them, but requests are never blocked. Useful during a migration from an existing system where you want visibility before you commit to blocking.

Composability is a design principle, not a feature. KAIRO is built to fit into your existing application, not to replace it wholesale.

---

### 2.12 — A note on performance

The natural question: how much does all of this add to request latency?

The membrane processes every request. At warm runtime, the header analysis, IP tracker lookup, and score computation take approximately **0.2–0.5 ms** for a typical API request. The majority of this time is the IP tracker hash map lookup, not the entropy computation.

The hardening check is a single number comparison — effectively zero overhead.

The shield (when enabled) serializes the response body and runs regex patterns across it. For a 1 KB JSON response, this takes approximately **0.1 ms**. For a 100 KB JSON response, approximately **2–5 ms**. For responses above 500 KB, consider either paginating the response or excluding the route from shield scanning.

The lattice's `resolve` function overhead is entirely up to you. If your resolve function makes a database query, that query is the overhead. KAIRO caches the result within the request, so you pay it at most once per request.

The validation middleware adds **0.1–0.3 ms** per route depending on schema complexity.

In total, for a typical API request, KAIRO adds approximately **0.3–1 ms** of overhead compared to a plain Express handler. For applications where this matters, the uWebSockets.js adapter (Chapter Five) can recover this overhead and then some through raw server throughput improvement.

---

<br>
# CHAPTER THREE
## The Features
### *A complete field guide to every tool KAIRO gives you, how it works internally, and when to reach for it*

---

### 3.1 — Entropy scoring: the full picture

Chapter Two described the four signals and their weights. This section goes deeper — into the reasoning behind each weight, the edge cases, and how the score behaves in practice.

**Why 35% for IP behavior?**

IP behavior is the strongest signal because it captures intentionality over time. A single unusual request could be a misconfigured client. A hundred unusual requests from the same IP over fifteen minutes is a pattern, and patterns reveal intent. The IP behavior signal is the only one that has memory. Every other signal evaluates a single request in isolation. IP behavior evaluates a request in the context of what that IP has been doing.

This is why ghost route hits have such a large effect on IP behavior scores. A single ghost route hit from an IP can add `0.4` to that IP's running score. The reasoning: there is no legitimate reason to hit `/.env`. The base rate of legitimate traffic to that path is zero. A hit on that path is not "suspicious" — it is definitionally exploratory or malicious. The weight reflects the certainty of the signal, not just its severity.

**Why only 15% for timing?**

Timing is a weak signal in isolation because there are legitimate scenarios for high-frequency requests. A mobile app that aggressively refreshes. A server-side rendering process that makes many API calls per page load. A monitoring health check that fires every few seconds. If timing had a high weight, these legitimate use cases would be penalized.

Timing's power is as a confirmation signal. When combined with high IP behavior or high header scores, unusual timing strengthens the case. A request that has a normal User-Agent but comes from an IP doing 200 requests per minute will have the timing signal push the composite score above the threshold. But timing alone won't block a legitimate high-frequency use case.

**The score accumulation behavior**

An important nuance: the entropy score in `ctx.kairo.entropy` represents the score **for the current request**. It is recomputed from scratch for every request. The IP tracker stores the behavioral metrics, but the entropy score is not persisted between requests.

This means a high-entropy request does not permanently blacklist an IP. If the IP's behavior normalizes — it stops hitting ghost routes, its request rate decreases, its path diversity decreases — its entropy score will naturally decline over subsequent requests as the rolling window accumulates normal-looking data.

This is intentional. You don't want to permanently block IPs. Users share IP addresses (NAT, corporate networks, mobile carriers). An IP that was used for a scan yesterday might be used by a legitimate user today. The entropy model is probabilistic and adaptive, not punitive.

**Score calibration**

The default weights and thresholds are tuned for a general-purpose API. Your application might have different characteristics. A machine-learning inference API might legitimately receive requests from automated systems with non-browser User-Agents. An IoT data collection API might legitimately receive hundreds of requests per minute from a single IP.

For these cases, you can tune the membrane:

```ts
app.use(createMembrane({
  weights: {
    header:   0.10,  // lower — our clients don't use browser headers
    ipBehavior: 0.40,
    payload:  0.35,  // higher — payload anomalies matter more for us
    timing:   0.15,
  },
  ipTracker: {
    windowMs:     60 * 60 * 1000,  // 1-hour window instead of 15 minutes
    maxTrackedIps: 100_000,
  },
}))
```

---

### 3.2 — Header signal analysis: what the membrane actually checks

The header analysis is more sophisticated than "does this look like a browser." Let me walk through exactly what gets examined.

**User-Agent parsing.** The membrane checks the User-Agent against three lists:
1. Known scanner and tool signatures (`sqlmap`, `nikto`, `masscan`, `nmap`, `gobuster`, `dirsearch`, and dozens of others)
2. Known legitimate non-browser clients (`curl`, `wget`, `axios`, `node-fetch`, `python-requests`) — these get a small score increase but not a large one
3. Absent User-Agent — a significant signal

A scanner signature in the User-Agent adds `0.4` to the header score immediately. This might seem too aggressive — couldn't a scanner change its User-Agent? Yes, and sophisticated scanners do. But the vast majority of automated scanning uses the default tool signatures because the people running them don't think to change them.

**Header completeness.** The membrane maintains a model of expected header sets for different client types. A browser client sending a JSON API request is expected to have `User-Agent`, `Accept`, `Accept-Language`, `Accept-Encoding`, and optionally `Origin` (for CORS) and `Referer`. The absence of headers that are always present in real browser requests is scored proportionally to how many are missing.

**Header value anomalies.** Individual header values are checked for characters that are never present in legitimate headers:
- Null bytes (`\x00`)
- Newlines (`\n`, `\r`) — used in header injection attacks
- Control characters
- SQL keywords in positions where they shouldn't appear
- Shell metacharacters in header values

These are scored based on severity. A null byte in any header value is a strong signal. A SQL keyword in the `Accept-Language` header is a strong signal. A SQL keyword in a custom header might be legitimate (though unusual).

**Accept header inconsistency.** If a request declares `Content-Type: application/json` in the request body but `Accept: text/html` in the response expectation, that's a mismatch. Real applications are internally consistent. Scanners often aren't.

---

### 3.3 — Ghost routes: the complete implementation guide

Ghost routes are KAIRO's most elegant defensive feature and the most frequently asked about. Let's go deep.

**The default ghost routes**

KAIRO registers a set of ghost routes automatically at startup. These are paths that legitimate applications never serve but that automated scanners always probe:

```
/.env                    /.env.local              /.env.production
/.git/config             /.git/HEAD               /.git/COMMIT_EDITMSG
/wp-admin                /wp-login.php            /wp-config.php
/.aws/credentials        /.ssh/id_rsa             /.ssh/authorized_keys
/phpinfo.php             /info.php                /test.php
/backup.sql              /db.sql                  /database.sql
/config.php              /configuration.php       /settings.php
/admin                   /administrator            /panel
/.DS_Store               /thumbs.db
/actuator/health         /actuator/env            /actuator/mappings
```

These paths are checked after real route matching fails. If a request matches a real route in your application, the ghost route check never runs. If no real route matches, KAIRO checks the ghost route list before returning a 404.

**The response strategy**

When a request hits a ghost route, KAIRO returns `200 OK` with an empty body. This is a deliberate choice.

A `404` response tells the scanner "this path doesn't exist." The scanner marks it as negative and moves on. It has learned something.

A `200` with an empty body tells the scanner "something is here." The scanner will try to parse the empty response, might retry, might try different request methods. It has been given a false positive to investigate. This wastes the scanner's time and consumes resources from the attacking infrastructure.

More importantly, from KAIRO's perspective, the hit is recorded and the IP's entropy score is elevated. The `200` response is part of the deception — we want the scanner to keep operating because every additional request from that IP makes the pattern clearer and the entropy higher.

**Custom ghost routes**

```ts
// Basic ghost route
app.ghost('/api/internal/debug')

// Ghost route with elevated alert level
app.ghost('/api/admin/backdoor', { alertLevel: 'high' })

// Ghost route with custom response (to be more convincing)
app.ghost('/config.json', {
  alertLevel: 'high',
  response: { status: 200, body: '{}' },
})
```

The `alertLevel` affects how the `ghost_route_hit` event is tagged. `high` alert events are more likely to trigger immediate action in your event handler.

**Ghost routes and entropy accumulation**

Each ghost route hit adds a configurable amount to the IP's behavioral entropy score. The default is `0.4`. For routes with `alertLevel: 'high'`, the default is `0.6`. These values are configurable:

```ts
app.use(createMembrane({
  ghostRouteEntropyBoost: 0.35,       // default boost per hit
  ghostRouteHighAlertBoost: 0.55,     // boost for high-alert hits
}))
```

After two ghost route hits from the same IP within the tracking window, that IP's IP behavior score will be at or near `1.0`. Combined with any other signal, the hardening layer will block subsequent requests from that IP.

**Ghost routes in development**

During development, you might legitimately hit paths that are registered as ghost routes — for example, if you're testing your 404 handler. The dev logger will inform you when a ghost route fires:

```
← GET /.env
   [ghost route hit] entropy boost: +0.4 → ip score: 0.50
   status: 200 (ghost response)
```

In development, the response is still `200` (to ensure the behavior matches production) but the dev logger makes it obvious what happened.

---

### 3.4 — Taint tracking: inputs, validation, and the cleared-set model

Taint tracking is a concept from static analysis tools like CodeQL and Semgrep, applied to runtime. The idea is that every input from an external, untrusted source should be marked as "tainted" and tracked until it is either validated (removing the taint) or discarded.

KAIRO implements this at the field level.

**What gets tainted**

At request initialization, the membrane marks the following as tainted in `ctx.kairo.taintedPaths`:

```ts
// For GET /users?page=1&search=alice
ctx.kairo.taintedPaths = new Set([
  'query.page',
  'query.search',
])

// For POST /users with body { name: "Alice", email: "alice@example.com" }
ctx.kairo.taintedPaths = new Set([
  'body.name',
  'body.email',
])

// For GET /users/:id
ctx.kairo.taintedPaths = new Set([
  'params.id',
])
```

Route parameters, query parameters, and body fields are all tainted. Headers are not tainted by the membrane (though specific security-relevant headers like `Authorization` are handled by the lattice).

**What clears taint**

The `validate()` middleware clears fields from `taintedPaths` as they are validated:

```ts
app.get('/users', validate({
  query: {
    page:   { type: 'number', min: 1, max: 1000 },
    search: { type: 'string', max: 100 },
  },
}), handler)
```

After this middleware runs (and passes), `ctx.kairo.taintedPaths` is empty. Both query fields have been validated and cleared.

If validation fails, the fields remain tainted and the middleware returns a `422` before the handler runs.

**Using taint status in your handlers**

```ts
app.get('/search', async (ctx) => {
  // Check if any inputs are still tainted
  if (ctx.kairo.taintedPaths.has('query.search')) {
    // This field wasn't validated. Log it or handle carefully.
    ctx.status(400).json({ error: 'Search parameter required' })
    return
  }

  const results = await db.search(ctx.query.search)
  ctx.json(results)
})
```

**The dev logger and taint warnings**

In development, the dev logger shows a warning for any request that completes with tainted paths still in the set:

```
⚠️  Request completed with untainted inputs: query.sort, query.direction
    Consider adding validate() or removing these inputs from your handler.
```

This is a development-time reminder, not a runtime error. It helps you discover validation gaps during development rather than after deployment.

**Taint and the data shield**

The shield uses taint status as a signal when scanning responses. A response that was generated by a handler with tainted inputs is scanned more thoroughly than one where all inputs were validated. This is a belt-and-suspenders approach: even if a tainted input got through to the handler, the shield is watching the response more carefully.

---

### 3.5 — Canary records: the full technical story

The canary record system is KAIRO's most sophisticated security feature. Understanding it fully requires understanding the threat it's designed to detect.

**The threat: invisible data exfiltration**

Most security tooling is designed to detect attacks as they happen. An intrusion detection system sees the attack traffic. A WAF blocks malicious requests. A rate limiter caps suspicious volumes.

But some of the most damaging data breaches are not detected by any of these tools because they don't look like attacks at all. They look like normal API traffic.

Consider a SQL injection vulnerability in an internal admin endpoint. The attacker has found it and is using it to dump the users table in batches of 100. Each request looks like a normal admin API call. The response looks like a normal JSON array. The rate limiter doesn't fire because the attacker is patient. The WAF doesn't fire because the injection is subtle. Your security logs show 200 OK for every request.

By the time you find out — if you ever find out — the entire users table is gone.

Canary records detect this by embedding invisible markers in database rows. If those rows appear in an API response through any path — normal access, injection, misconfigured query, accidental over-fetching — the sentinel catches it.

**How canary tokens are created**

```ts
import { createCanary } from '@thekairojs/kairo-sentinel'

// Manually stamping a record before writing it
const row = createCanary({ id: userId, email: user.email }, ctx)
// row is now: { id: userId, email: user.email, __k_c__: 'a3f91d7b...' }

await db.users.insert(row)
```

The `createCanary` function:
1. Generates a 32-character cryptographically random hex string
2. Injects it into the record as `__k_c__`
3. Registers the token in the sentinel's in-process registry, along with:
   - The request context (IP, entropy score, lattice claims, timestamp)
   - The source model/table identifier (if ctx provides it)
   - A TTL (default: 30 days, configurable)
4. Returns the augmented record

The `__k_c__` field name is intentionally obscure. An attacker who is dumping your database will see rows with a `__k_c__` field containing what looks like a random hex string. They will not know it is a trap. They will include it in their exfiltration. When it appears in an API response, you catch them.

**How canary tokens are detected**

```ts
import { scanForCanary } from '@thekairojs/kairo-sentinel'

const results = await db.users.findMany(query)
const leaked = scanForCanary(results, ctx)
if (leaked) {
  // A canary token was found in the results
  // The sentinel has already emitted a canary_triggered event
  // with full source context
}
```

`scanForCanary` recursively traverses the data structure looking for values that match any registered canary token. It handles:
- Flat objects: `{ __k_c__: 'abc123...' }`
- Nested objects: `{ user: { profile: { __k_c__: 'abc123...' } } }`
- Arrays: `[{ __k_c__: 'abc123...' }, { __k_c__: 'def456...' }]`
- Nested arrays within objects

When a token is found, the sentinel:
1. Looks up the token in its registry
2. Emits a `canary_triggered` event with:
   - `canaryToken`: the token that was found
   - `sourceContext`: the original request that created the canary
   - `currentContext`: the current request that found the canary
   - `timeDelta`: how long ago the canary was created
3. Returns `true`

**Automatic canary injection with database adapters**

Manually calling `createCanary()` before every database insert is tedious. The KAIRO database adapters automate this:

```ts
const kp = createPrismaAdapter(prisma, {
  canaryModels: ['user', 'order', 'payment'],
  scanResults:  true,
  entropyGate:  0.8,
})

// In a route handler:
const db = kp.withContext(ctx)

// This automatically injects a canary token:
await db.user.create({ data: { name: 'Alice', email: 'alice@example.com' } })

// This automatically scans for canary tokens in results:
const users = await db.user.findMany()
// If any user in the result has a __k_c__ token registered in the sentinel,
// a canary_triggered event fires
```

The adapter injects canaries on `create`, `createMany`, `upsert`, and `update` operations on models in `canaryModels`. It scans results on `findUnique`, `findFirst`, `findMany`, and `findRaw` operations.

**What to do when a canary triggers**

A `canary_triggered` event means one of three things:
1. A legitimate query returned data that includes a canary-stamped row (the most common case — informational)
2. An overly broad query is returning more data than it should
3. A data exfiltration attack is in progress

The event payload tells you which case you're in. The `sourceContext` tells you which request originally created the canary. The `currentContext` tells you which request is now reading it. If `currentContext.lattice.claims.subject` is the same user who created the canary, it's probably case 1 or 2. If it's different — or if there are no claims at all — it's case 3.

```ts
app.onSecurityEvent((event) => {
  if (event.type === 'canary_triggered') {
    const { sourceContext, currentContext, timeDelta } = event.detail

    if (sourceContext.subject !== currentContext.subject) {
      // Different user is reading canary data — potentially case 3
      alertSecurityTeam(event)
      await revokeSession(currentContext.subject)
    }
  }
})
```

---

### 3.6 — Input validation: complete guide

KAIRO's validation middleware is `validate()` from `@thekairojs/kairo-dx`. It is designed to be expressive, composable, and integrated with the security context.

**Basic usage**

```ts
import { validate } from '@thekairojs/kairo-dx'

app.post('/users', validate({
  body: {
    name:  { type: 'string',  required: true, min: 1, max: 100 },
    email: { type: 'string',  required: true, pattern: /^[^@]+@[^@]+\.[^@]+$/ },
    age:   { type: 'number',  min: 0, max: 150 },
    role:  { type: 'string',  enum: ['admin', 'user', 'guest'], default: 'user' },
  },
}), handler)
```

**Supported types**

| Type | Description | Coercion |
|------|-------------|----------|
| `string` | UTF-8 string | None (already a string) |
| `number` | JavaScript number | `"42"` → `42`, `"3.14"` → `3.14` |
| `boolean` | true/false | `"true"` → `true`, `"false"` → `false`, `"1"` → `true` |
| `array` | Array with element schema | `"a,b,c"` → `["a","b","c"]` for query params |
| `object` | Nested object | Recursive validation |

Coercion applies primarily to query parameters, which arrive as strings over HTTP. Body parameters are parsed as JSON and retain their types.

**String constraints**

```ts
{
  type: 'string',
  required: true,        // must be present (not undefined, not null)
  min: 1,                // minimum length
  max: 255,              // maximum length
  pattern: /^[a-z]+$/,  // must match regex
  enum: ['a', 'b', 'c'],// must be one of these values
  trim: true,            // trim whitespace before validation
  lowercase: true,       // convert to lowercase before validation
  default: 'anonymous',  // use this value if the field is absent
}
```

**Number constraints**

```ts
{
  type: 'number',
  required: true,
  min: 0,
  max: 1000000,
  integer: true,       // must be a whole number
  positive: true,      // must be > 0
  default: 0,
}
```

**Nested objects**

```ts
validate({
  body: {
    user: {
      type: 'object',
      required: true,
      properties: {
        name:    { type: 'string', required: true },
        address: {
          type: 'object',
          properties: {
            street: { type: 'string', required: true },
            city:   { type: 'string', required: true },
            zip:    { type: 'string', pattern: /^\d{5}(-\d{4})?$/ },
          },
        },
      },
    },
  },
})
```

Error paths for nested objects are fully qualified: `body.user.address.zip`.

**Arrays**

```ts
validate({
  body: {
    tags: {
      type: 'array',
      required: true,
      min: 1,            // minimum array length
      max: 10,           // maximum array length
      items: {
        type: 'string',
        min: 1,
        max: 50,
        pattern: /^[a-z0-9-]+$/,
      },
    },
  },
})
```

Error paths for array items include the index: `body.tags[2]`.

**Validation errors**

When validation fails, the middleware returns `422 Unprocessable Entity`:

```json
{
  "error": "Validation failed",
  "fields": {
    "body.email": "must match pattern /^[^@]+@[^@]+\\.[^@]+$/",
    "body.age":   "must be at most 150",
    "body.tags[3]": "must be at most 50 characters"
  }
}
```

All errors are reported simultaneously — no "fix one and discover the next" loop.

**Security integration**

Every time `validate()` encounters an invalid request, it adds `0.1` to `ctx.kairo.entropy`. This is cumulative across a session. A client that repeatedly sends malformed requests — which is a characteristic of fuzzing — will accumulate entropy and eventually trigger the hardening layer.

```ts
// First invalid request from this IP:  entropy might be 0.35 → 0.45
// Fifth invalid request:                entropy might be 0.45 → 0.90 → blocked
```

For legitimate users who accidentally send one bad request, `0.1` is negligible. For a fuzzer sending hundreds of probes, the accumulation is significant.

**Combining validate() with lattice.require()**

The conventional order is: authentication before validation. A request from an unauthenticated user doesn't need validation — you're going to reject it anyway.

```ts
app.post('/admin/users',
  lattice.require({ level: 'high' }),  // reject unauthenticated first
  validate({ body: adminUserSchema }), // then validate the body
  handler
)
```

This also prevents information leakage: an unauthenticated request cannot use validation errors to probe your input schema.

---

### 3.7 — PII scanning: what the shield detects

The Data Shield scans outbound JSON responses for personally identifiable information and other sensitive data patterns. This section documents every pattern it checks, the false positive profile of each, and how to configure the sensitivity.

**Email addresses**

Pattern: `[^@\s"']+@[^@\s"']+\.[^@\s"']{2,}`

False positive rate: very low. The pattern is specific enough that random strings rarely match. The main false positives are email-like URLs (`schema@version:path` in some JSON-LD formats).

**Credit card numbers**

Pattern: `\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b`

Additionally validated with Luhn checksum. The Luhn check dramatically reduces false positives from random 16-digit numbers.

**Social Security Numbers (US)**

Pattern: `\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b`

With basic filtering: known invalid SSNs (all same digit, 000-XX-XXXX, etc.) are excluded.

**AWS Access Keys**

Pattern: `\bAKIA[0-9A-Z]{16}\b`

Very low false positive rate. The `AKIA` prefix is specific to AWS access key IDs.

**JWTs**

Pattern: `eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`

JWTs in API responses are almost always a mistake. They should live in Authorization headers, not response bodies (except on the login endpoint that issues them). If you need to allow JWTs in certain responses, exclude those routes from shield scanning.

**Private IP addresses**

Pattern: `\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b`

Private IPs appearing in API responses often indicate infrastructure information leakage — database hostnames, internal service URLs, VPC addresses. These should not be visible to external clients.

**Configuring the shield**

```ts
app.use(createShield({
  pii: true,
  redact: false,         // log only, don't modify responses
  patterns: {
    email:      true,    // scan for email addresses
    creditCard: true,    // scan for credit card numbers
    ssn:        true,    // scan for social security numbers
    awsKey:     true,    // scan for AWS access keys
    jwt:        true,    // scan for JWTs
    privateIp:  false,   // skip private IP detection (you use internal hostnames)
    custom: [            // add your own patterns
      {
        name:    'internal_user_id',
        pattern: /KSR-[0-9]{8}/,
        message: 'Internal user ID format found in response',
      },
    ],
  },
  exclude: ['/login', '/auth/token'],  // routes that legitimately return tokens
}))
```

---

### 3.8 — The security event system: complete event type reference

Every significant security event in KAIRO is emitted as a structured event to your `onSecurityEvent` handler. This section documents every event type.

**`ghost_route_hit`**

Emitted when a request matches a registered ghost route.

```ts
{
  type:      'ghost_route_hit',
  ip:        '203.0.113.42',
  entropy:   0.52,         // entropy after the ghost boost is applied
  route:     '/.env',
  alertLevel: 'medium',   // or 'high' if configured
  timestamp: 1716825600000,
  detail:    'Request matched ghost route /.env',
}
```

**`entropy_spike`**

Emitted when a request's entropy score exceeds a configurable threshold (default: `0.7`). Note: this is different from the hardening threshold — the spike event fires at a lower threshold to give you early warning.

```ts
{
  type:      'entropy_spike',
  ip:        '203.0.113.42',
  entropy:   0.78,
  breakdown: {
    header:    0.60,
    ipBehavior: 0.85,
    payload:   0.20,
    timing:    0.45,
  },
  route:     '/api/users',
  timestamp: 1716825600000,
  detail:    'Entropy 0.78 exceeds spike threshold 0.70',
}
```

**`taint_neutralized`**

Emitted when PII is detected in an outbound response by the shield, or when tainted input is validated and cleared.

```ts
{
  type:      'taint_neutralized',
  ip:        '203.0.113.42',
  entropy:   0.12,
  route:     '/api/users/42',
  field:     'response.email',
  pattern:   'email',
  redacted:  false,
  timestamp: 1716825600000,
  detail:    'PII pattern "email" detected in response field response.email',
}
```

**`lattice_denied`**

Emitted when a `lattice.require()` check fails.

```ts
{
  type:       'lattice_denied',
  ip:         '203.0.113.42',
  entropy:    0.22,
  route:      '/api/admin/users',
  required:   { level: 'high' },
  resolved:   { level: 'low', subject: 'user_abc123' },
  timestamp:  1716825600000,
  detail:     'Trust level "low" does not satisfy required "high"',
}
```

**`canary_triggered`**

Emitted when a registered canary token is found in a response or query result.

```ts
{
  type:          'canary_triggered',
  ip:            '203.0.113.42',
  entropy:       0.34,
  route:         '/api/users',
  canaryToken:   'a3f91d7b...',
  sourceContext: {
    ip:        '10.0.0.5',
    timestamp: 1716825000000,
    subject:   'user_abc123',
    entropy:   0.08,
  },
  currentContext: {
    ip:        '203.0.113.42',
    timestamp: 1716825600000,
    subject:   null,   // unauthenticated request reading a canary row
    entropy:   0.34,
  },
  timeDelta:   600000,  // 10 minutes between creation and detection
  timestamp:   1716825600000,
  detail:      'Registered canary token found in response from /api/users',
}
```

**`intent_drift`** (v1.1)

Emitted when a request's behavioral profile deviates from the established baseline for that route.

```ts
{
  type:     'intent_drift',
  ip:       '203.0.113.42',
  entropy:  0.55,
  route:    '/api/v1/messages',
  drift:    {
    payloadSize:  { expected: '50–200 bytes', actual: '48200 bytes' },
    contentType:  { expected: 'application/json', actual: 'application/octet-stream' },
  },
  timestamp: 1716825600000,
  detail:   'Request to /api/v1/messages deviates from established baseline',
}
```

**Subscribing to events**

```ts
app.onSecurityEvent((event) => {
  // Handle all events
  myTelemetry.send('kairo.security_event', event)
})

// You can also filter by type
app.onSecurityEvent((event) => {
  switch (event.type) {
    case 'canary_triggered':
      securityTeam.alert(event)
      break
    case 'ghost_route_hit':
      ipBlocklist.addCandidate(event.ip, event.entropy)
      break
    case 'entropy_spike':
      if (event.entropy > 0.9) wafIntegration.block(event.ip, '1h')
      break
  }
})
```

---

### 3.9 — HMAC request signing

For service-to-service communication — internal APIs called by other services in your infrastructure — KAIRO supports HMAC request signing. This allows a receiving service to verify that a request came from a known, trusted source.

**How it works**

The sending service signs the request with a shared secret:

```ts
import { signRequest } from '@thekairojs/kairo-membrane'

const signature = signRequest({
  method:  'POST',
  path:    '/internal/process',
  body:    JSON.stringify(payload),
  secret:  process.env.INTERNAL_HMAC_SECRET,
  timestamp: Date.now(),
})

fetch('http://internal-service/internal/process', {
  method: 'POST',
  headers: {
    'Content-Type':     'application/json',
    'X-Kairo-Sig':      signature.sig,
    'X-Kairo-Ts':       signature.ts,
  },
  body: JSON.stringify(payload),
})
```

The receiving service configures the membrane to verify signatures:

```ts
app.use(createMembrane({
  hmac: {
    secret:   process.env.INTERNAL_HMAC_SECRET,
    required: true,      // reject requests without valid signatures
    maxAge:   30_000,    // reject signatures older than 30 seconds (replay protection)
  },
}))
```

The membrane computes the expected signature from the received request body, method, path, and timestamp. If it doesn't match the `X-Kairo-Sig` header, the request is rejected with a high entropy score and a `401 Unauthorized`.

The timestamp check prevents replay attacks: even if an attacker captures a valid signed request, they cannot replay it after 30 seconds.

---

### 3.10 — The devLogger in detail

The `devLogger()` middleware from `@thekairojs/kairo-dx` is a development tool that makes KAIRO's internal state visible. In production (`NODE_ENV=production`), it is a no-op. In development, it prints a structured summary after each request.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
← POST /api/users  201 Created  [4ms]
   entropy:    0.08  (header:0.05 ip:0.08 payload:0.10 timing:0.05)
   trust:      medium  (user:usr_abc123  roles:[user,verified])
   tainted:    none  (all inputs validated)
   events:     none
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

When security events occur:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
← GET /.env  200 OK  [0ms]
   entropy:    0.52  ↑ ghost route boost +0.40
   trust:      none
   tainted:    none
   events:     👻 ghost_route_hit  /.env  alertLevel:medium
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

When tainted inputs remain after a request:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
← GET /api/users?sort=name&dir=asc  200 OK  [12ms]
   entropy:    0.12
   trust:      low
   tainted:    ⚠️  query.sort  query.dir  (not validated)
   events:     none
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

The taint warning in the dev logger is how most developers discover they've forgotten to validate query parameters. It's a gentle nudge during development rather than an error in production.

---

<br>
# CHAPTER FOUR
## Building with KAIRO
### *Patterns, walkthroughs, integrations, and what changes when the framework handles security for you*

---

### 4.1 — The mental model shift

Most developers who switch to KAIRO from Express go through a predictable transition.

Phase one: **unfamiliarity.** The API looks different. `createApp()` instead of `express()`. `ctx.json()` instead of `res.json()`. There's a `ctx.kairo` namespace they haven't seen before. This phase lasts a day, maybe two.

Phase two: **recognition.** The patterns are the same as Express. Routing. Middleware. Handlers. The security layers slot in just like any other middleware. "This isn't so different," they think.

Phase three: **the shift.** They realize they haven't written a single authentication check inside a handler. They haven't written a single input sanitization function. They haven't written a single rate limiting configuration. They've written handlers that do exactly one thing: handle the request. And the application is more secure than anything they've built before.

Phase three is the point. It's not just that KAIRO is easier — it's that the cognitive model of what a handler is supposed to do has changed. A handler in Express is responsible for everything that happens to a request. A handler in KAIRO is responsible for business logic. The framework is responsible for security.

This has a practical effect on code quality. When a function does one thing, it is easier to understand, easier to test, and easier to review. KAIRO handlers are smaller, cleaner, and more testable than equivalent Express handlers because they have fewer responsibilities.

---

### 4.2 — Setting up a new KAIRO project: step by step

Let's walk through setting up a new KAIRO project from scratch. Not the hello-world version — a real one, with all the security layers, with database integration, with proper configuration management.

**Step 1: Project structure**

```
my-api/
├── src/
│   ├── index.ts           # app entry point
│   ├── routes/
│   │   ├── auth.ts        # authentication routes
│   │   ├── users.ts       # user management routes
│   │   └── admin.ts       # admin routes
│   ├── db/
│   │   ├── client.ts      # database client + KAIRO adapter
│   │   └── schema.ts      # Prisma schema (if using Prisma)
│   ├── security/
│   │   ├── lattice.ts     # trust lattice configuration
│   │   └── events.ts      # security event handlers
│   └── middleware/
│       └── validate.ts    # shared validation schemas
├── package.json
└── tsconfig.json
```

**Step 2: Install dependencies**

```bash
npm install @thekairojs/kairo
npm install @thekairojs/kairo-membrane
npm install @thekairojs/kairo-lattice
npm install @thekairojs/kairo-hardening
npm install @thekairojs/kairo-shield
npm install @thekairojs/kairo-sentinel
npm install @thekairojs/kairo-dx
npm install @thekairojs/kairo-adapter-prisma  # if using Prisma
```

**Step 3: Configure the lattice (src/security/lattice.ts)**

```ts
import { createLattice } from '@thekairojs/kairo-lattice'
import jwt from 'jsonwebtoken'

export const lattice = createLattice({
  resolve: async (ctx) => {
    const auth = ctx.headers['authorization']

    if (!auth?.startsWith('Bearer ')) {
      return { level: 'none', roles: [], subject: undefined }
    }

    const token = auth.slice(7)

    try {
      const claims = jwt.verify(token, process.env.JWT_SECRET!, {
        algorithms: ['HS256'],
      }) as { sub: string; roles: string[]; tier: string; exp: number }

      return {
        level:   claims.tier as 'low' | 'medium' | 'high',
        roles:   claims.roles,
        subject: claims.sub,
      }
    } catch {
      return { level: 'none', roles: [], subject: undefined }
    }
  },
})
```

**Step 4: Configure the database adapter (src/db/client.ts)**

```ts
import { PrismaClient } from '@prisma/client'
import { createPrismaAdapter } from '@thekairojs/kairo-adapter-prisma'

const prisma = new PrismaClient()

export const db = createPrismaAdapter(prisma, {
  entropyGate:   0.80,
  canaryModels:  ['User', 'Order', 'Payment'],
  scanResults:   true,
})

// Usage in routes:
// const client = db.withContext(ctx)
// const user = await client.user.findUnique({ where: { id } })
```

**Step 5: Configure security event handling (src/security/events.ts)**

```ts
import type { KairoApp } from '@thekairojs/kairo'

export function registerSecurityEvents(app: KairoApp) {
  app.onSecurityEvent((event) => {
    // Always log
    console.error(JSON.stringify({
      level: event.entropy > 0.8 ? 'WARN' : 'INFO',
      ...event,
    }))

    // Alert on high-severity events
    if (event.type === 'canary_triggered') {
      // Page the on-call engineer
      alerting.critical(`Canary triggered on ${event.route}`, event)
    }

    if (event.type === 'ghost_route_hit' && event.detail.alertLevel === 'high') {
      alerting.warning(`High-alert ghost route hit from ${event.ip}`, event)
    }

    // Metrics
    metrics.increment('kairo.security_events', {
      type: event.type,
      entropy_bucket: Math.floor(event.entropy * 10) / 10,
    })
  })
}
```

**Step 6: The main app file (src/index.ts)**

```ts
import { createApp } from '@thekairojs/kairo'
import { createMembrane } from '@thekairojs/kairo-membrane'
import { createHardening } from '@thekairojs/kairo-hardening'
import { createShield } from '@thekairojs/kairo-shield'
import { createSentinel } from '@thekairojs/kairo-sentinel'
import { devLogger } from '@thekairojs/kairo-dx'
import { lattice } from './security/lattice.js'
import { registerSecurityEvents } from './security/events.js'
import { authRoutes } from './routes/auth.js'
import { userRoutes } from './routes/users.js'
import { adminRoutes } from './routes/admin.js'

const app = createApp({ trustProxy: true })

// Security pipeline
app.use(createMembrane())
app.use(createSentinel())
app.use(createHardening({ threshold: parseFloat(process.env.ENTROPY_THRESHOLD ?? '0.80') }))
app.use(createShield({ pii: true, redact: process.env.NODE_ENV === 'production' }))
app.use(lattice)
app.use(devLogger())

// Ghost routes
app.ghost('/.env')
app.ghost('/.git/config')
app.ghost('/wp-login.php')
app.ghost('/admin/debug', { alertLevel: 'high' })

// Routes
app.use('/auth',  authRoutes)
app.use('/users', userRoutes)
app.use('/admin', adminRoutes)

// Security events
registerSecurityEvents(app)

// Start
const port = parseInt(process.env.PORT ?? '3000')
await app.listen(port)
console.log(`API running on port ${port}`)
```

---

### 4.3 — Route patterns: a complete guide

**Public routes — no authentication**

```ts
app.get('/health', (ctx) => {
  ctx.json({ status: 'ok', version: process.env.npm_package_version })
})

app.get('/public/content', async (ctx) => {
  const content = await db.withContext(ctx).publicContent.findMany()
  ctx.json(content)
})
```

**Protected routes — require authentication**

```ts
app.get('/me', lattice.require({ level: 'low' }), async (ctx) => {
  const userId = ctx.kairo.lattice.claims!.subject
  const user = await db.withContext(ctx).user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, createdAt: true },
    // Note: explicitly select fields to avoid accidentally returning passwordHash
  })
  ctx.json(user)
})
```

**Validated routes**

```ts
import { validate } from '@thekairojs/kairo-dx'

const createUserSchema = {
  body: {
    name:     { type: 'string' as const, required: true, min: 1, max: 100 },
    email:    { type: 'string' as const, required: true, pattern: /^[^@]+@[^@]+\.[^@]+$/ },
    password: { type: 'string' as const, required: true, min: 8, max: 200 },
  },
}

app.post('/users',
  lattice.require({ level: 'none' }),  // anyone can register
  validate(createUserSchema),
  async (ctx) => {
    const { name, email, password } = ctx.body as {
      name: string
      email: string
      password: string
    }

    const hashedPassword = await bcrypt.hash(password, 12)
    const user = await db.withContext(ctx).user.create({
      data: { name, email, passwordHash: hashedPassword },
    })

    ctx.json({ id: user.id, name: user.name, email: user.email }, 201)
  }
)
```

**Admin routes — high trust required**

```ts
// src/routes/admin.ts
import { createRouter } from '@thekairojs/kairo'
import { lattice } from '../security/lattice.js'
import { validate } from '@thekairojs/kairo-dx'

export const adminRoutes = createRouter()

// All admin routes require high trust
adminRoutes.use(lattice.require({ level: 'high' }))

adminRoutes.get('/users', async (ctx) => {
  const users = await db.withContext(ctx).user.findMany({
    select: { id: true, name: true, email: true, createdAt: true, tier: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  ctx.json(users)
})

adminRoutes.delete('/users/:id', async (ctx) => {
  await db.withContext(ctx).user.delete({ where: { id: ctx.params.id } })
  ctx.status(204).send()
})
```

**Paginated list routes**

```ts
const listSchema = {
  query: {
    page:  { type: 'number' as const, min: 1, max: 10000, default: 1 },
    limit: { type: 'number' as const, min: 1, max: 100,   default: 20 },
    sort:  { type: 'string' as const, enum: ['createdAt', 'name', 'email'], default: 'createdAt' },
    order: { type: 'string' as const, enum: ['asc', 'desc'], default: 'desc' },
  },
}

app.get('/posts', lattice.require({ level: 'low' }), validate(listSchema), async (ctx) => {
  const { page, limit, sort, order } = ctx.query as {
    page: number
    limit: number
    sort: string
    order: 'asc' | 'desc'
  }

  const [posts, total] = await Promise.all([
    db.withContext(ctx).post.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sort]: order },
    }),
    db.withContext(ctx).post.count(),
  ])

  ctx.json({
    data: posts,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  })
})
```

**File upload routes**

```ts
app.post('/uploads', lattice.require({ level: 'low' }), async (ctx) => {
  // Validate content type
  const contentType = ctx.headers['content-type'] ?? ''
  if (!contentType.startsWith('multipart/form-data')) {
    ctx.status(415).json({ error: 'Expected multipart/form-data' })
    return
  }

  // Check file size before processing
  const contentLength = parseInt(ctx.headers['content-length'] ?? '0')
  const maxSize = 10 * 1024 * 1024 // 10 MB
  if (contentLength > maxSize) {
    ctx.status(413).json({ error: 'File too large' })
    return
  }

  // Process upload...
  ctx.json({ uploaded: true })
})
```

---

### 4.4 — Database adapter patterns: Prisma, Drizzle, and pg

Each database adapter wraps your existing client without replacing it. You can still use your client directly for operations that don't need KAIRO context — migrations, seeding scripts, background jobs.

**Prisma adapter patterns**

```ts
// src/db/client.ts
import { PrismaClient } from '@prisma/client'
import { createPrismaAdapter } from '@thekairojs/kairo-adapter-prisma'

export const prisma = new PrismaClient()
export const db = createPrismaAdapter(prisma, {
  entropyGate:  0.80,
  canaryModels: ['User', 'Order', 'Payment', 'ApiKey'],
  scanResults:  true,
})

// In a route handler:
app.get('/orders/:id', lattice.require({ level: 'low' }), async (ctx) => {
  const client = db.withContext(ctx)  // creates a context-bound proxy

  const order = await client.order.findUnique({
    where: { id: ctx.params.id },
    include: {
      items: true,
      user:  { select: { id: true, name: true, email: true } },
    },
  })

  if (!order) {
    ctx.status(404).json({ error: 'Order not found' })
    return
  }

  // Ensure the requesting user owns this order
  if (order.userId !== ctx.kairo.lattice.claims?.subject) {
    ctx.status(403).json({ error: 'Forbidden' })
    return
  }

  ctx.json(order)
})
```

**Drizzle adapter patterns**

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { createDrizzleAdapter } from '@thekairojs/kairo-adapter-drizzle'
import { users, orders } from './schema.js'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const drizzleDb = drizzle(pool)
const kd = createDrizzleAdapter(drizzleDb, { entropyGate: 0.80 })

app.get('/users/:id', lattice.require({ level: 'high' }), async (ctx) => {
  const { exec, withCanary } = kd.withContext(ctx)

  const result = await exec(
    ctx,
    drizzleDb.select().from(users).where(eq(users.id, ctx.params.id)).limit(1),
    'users.findById'
  )

  ctx.json(result[0] ?? null)
})
```

**Raw pg adapter patterns**

```ts
import { Pool } from 'pg'
import { createPgAdapter } from '@thekairojs/kairo-adapter-pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const kpg = createPgAdapter(pool, {
  entropyGate:   0.80,
  scanResults:   true,
  canaryTable:   'users',
})

app.get('/users', lattice.require({ level: 'high' }), async (ctx) => {
  const { rows } = await kpg.query(
    ctx,
    'SELECT id, name, email, created_at FROM users ORDER BY created_at DESC LIMIT $1',
    [100]
  )
  ctx.json(rows)
})
```

**Handling KairoEntropyError**

When the entropy gate fires, the database adapter throws a `KairoEntropyError`. You should handle this in your error handling middleware:

```ts
import { KairoEntropyError } from '@thekairojs/kairo-adapter-prisma'

// Global error handler
app.use(async (ctx, next) => {
  try {
    await next()
  } catch (err) {
    if (err instanceof KairoEntropyError) {
      // Request was too suspicious to allow DB access
      // Return the same response as hardening — reveal nothing
      ctx.status(429).json({ message: 'Too many requests' })
      return
    }
    throw err
  }
})
```

---

### 4.5 — Error handling patterns

KAIRO does not have a built-in error handling layer — error handling is application-specific enough that the framework shouldn't dictate it. But here are the patterns that work well with KAIRO's security model.

**The golden rule: never leak internals**

```ts
// BAD: leaks stack trace, internal error message, library name
app.use(async (ctx, next) => {
  try {
    await next()
  } catch (err) {
    ctx.status(500).json({ error: err.message, stack: err.stack })
  }
})

// GOOD: internal error is logged, external response reveals nothing useful
app.use(async (ctx, next) => {
  try {
    await next()
  } catch (err) {
    const requestId = crypto.randomUUID()
    console.error({ requestId, error: err.message, stack: err.stack, route: ctx.url })
    ctx.status(500).json({ error: 'Internal server error', requestId })
    // The requestId lets you correlate the user's report to your logs
    // without leaking any internal detail
  }
})
```

**Typed error hierarchy**

```ts
class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) { super(message) }
}

class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`, 'NOT_FOUND')
  }
}

class ForbiddenError extends AppError {
  constructor() {
    super(403, 'Forbidden', 'FORBIDDEN')
  }
}

// In your error handler:
app.use(async (ctx, next) => {
  try {
    await next()
  } catch (err) {
    if (err instanceof AppError) {
      ctx.status(err.statusCode).json({ error: err.message, code: err.code })
      return
    }
    if (err instanceof KairoEntropyError) {
      ctx.status(429).json({ message: 'Too many requests' })
      return
    }
    // Unexpected error — log and return generic response
    console.error(err)
    ctx.status(500).json({ error: 'Internal server error' })
  }
})
```

---

### 4.6 — Testing KAIRO applications

Testing a KAIRO application follows the same patterns as testing any Node.js API, with a few KAIRO-specific considerations.

**Unit testing handlers**

Handlers in KAIRO are just functions that receive a context and optionally call next. You can test them by constructing a mock context:

```ts
import { describe, it, expect, vi } from 'vitest'

function createMockCtx(overrides = {}) {
  return {
    params: {},
    query: {},
    body: {},
    headers: {},
    kairo: {
      entropy: 0.1,
      taintedPaths: new Set(),
      events: [],
      lattice: { resolved: true, claims: { level: 'low', subject: 'user_123', roles: [] } },
    },
    json: vi.fn(),
    status: vi.fn().mockReturnThis(),
    send: vi.fn(),
    ...overrides,
  }
}

describe('GET /users/:id', () => {
  it('returns user when found', async () => {
    const ctx = createMockCtx({ params: { id: 'user_123' } })
    const mockDb = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'user_123', name: 'Alice' }) },
    }

    await getUserHandler(ctx, mockDb)

    expect(ctx.json).toHaveBeenCalledWith({ id: 'user_123', name: 'Alice' })
  })

  it('returns 404 when user not found', async () => {
    const ctx = createMockCtx({ params: { id: 'nonexistent' } })
    const mockDb = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    }

    await getUserHandler(ctx, mockDb)

    expect(ctx.status).toHaveBeenCalledWith(404)
    expect(ctx.json).toHaveBeenCalledWith({ error: 'User not found' })
  })
})
```

**Integration testing with supertest**

```ts
import { createApp } from '@thekairojs/kairo'
import { createMembrane } from '@thekairojs/kairo-membrane'
import supertest from 'supertest'

function buildTestApp() {
  const app = createApp()
  app.use(createMembrane())
  // Add your routes...
  return app
}

describe('POST /users', () => {
  it('creates a user with valid data', async () => {
    const app = buildTestApp()
    const handler = app.buildRequestHandler()

    const res = await supertest(handler)
      .post('/users')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'Alice', email: 'alice@example.com', password: 'secure123!' })

    expect(res.status).toBe(201)
    expect(res.body.email).toBe('alice@example.com')
    expect(res.body.passwordHash).toBeUndefined()  // make sure this never leaks
  })

  it('rejects invalid email', async () => {
    const app = buildTestApp()
    const handler = app.buildRequestHandler()

    const res = await supertest(handler)
      .post('/users')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'Alice', email: 'not-an-email', password: 'secure123!' })

    expect(res.status).toBe(422)
    expect(res.body.fields['body.email']).toBeDefined()
  })
})
```

**Testing security behavior**

```ts
describe('hardening layer', () => {
  it('blocks requests from IPs that hit ghost routes', async () => {
    const app = buildTestApp()
    app.ghost('/probe-me')
    app.use(createHardening({ threshold: 0.50 }))
    const handler = app.buildRequestHandler()

    // Hit ghost route to elevate entropy
    await supertest(handler).get('/probe-me')

    // Subsequent request from same IP should be blocked
    // (In testing, use x-forwarded-for to control the IP)
    const res = await supertest(handler)
      .get('/api/users')
      .set('X-Forwarded-For', '10.0.0.1')

    // This depends on how your test environment handles IPs
    // In a real test, you'd need to control the IP precisely
  })
})

describe('canary records', () => {
  it('emits canary_triggered when a canary row appears in a response', async () => {
    const events: any[] = []
    const app = buildTestApp()
    app.onSecurityEvent((e) => events.push(e))

    // Create a canary record
    const row = createCanary({ id: '123', email: 'test@example.com' })

    // Simulate a response that includes the canary token
    await scanForCanary(row, mockCtx)

    const canaryEvent = events.find((e) => e.type === 'canary_triggered')
    expect(canaryEvent).toBeDefined()
  })
})
```

---

### 4.7 — Configuration management and environment differences

**Development configuration**

```ts
// config/development.ts
export const config = {
  entropy: {
    threshold: 0.95,  // very permissive in development
    mode: 'log',      // log but don't block
  },
  shield: {
    pii:    true,
    redact: false,    // scan but don't redact — helps find leaks without breaking dev
  },
  trustProxy: false,
}
```

**Production configuration**

```ts
// config/production.ts
export const config = {
  entropy: {
    threshold: 0.80,  // block requests above 0.80
    mode: 'block',
  },
  shield: {
    pii:    true,
    redact: true,     // actively redact in production
  },
  trustProxy: true,   // you're behind a load balancer
}
```

**Staging configuration**

```ts
// config/staging.ts — mirrors production behavior, lower threshold for testing
export const config = {
  entropy: {
    threshold: 0.80,
    mode: 'block',
  },
  shield: {
    pii:    true,
    redact: false,    // don't redact in staging — need to see actual data for testing
  },
  trustProxy: true,
}
```

**Loading configuration**

```ts
// src/index.ts
const env = process.env.NODE_ENV ?? 'development'
const config = (await import(`../config/${env}.js`)).config

app.use(createHardening({
  threshold: config.entropy.threshold,
  mode:      config.entropy.mode,
}))

app.use(createShield({
  pii:    config.shield.pii,
  redact: config.shield.redact,
}))
```

---

### 4.8 — KAIRO for AI-generated code: a complete walkthrough

This section walks through the ideal KAIRO workflow when an AI agent is building a feature. The scenario: you've asked an AI agent to build a user messaging API.

**The prompt to the AI agent:**

```
Build a REST API for user messaging using KAIRO. Users should be able to:
- Send messages to other users
- List their received messages
- Delete their own messages

Use the KAIRO framework with membrane, hardening, lattice, and shield middleware.
Use the Prisma adapter for database operations.
```

**What the agent should generate:**

```ts
// routes/messages.ts
import { createRouter } from '@thekairojs/kairo'
import { validate } from '@thekairojs/kairo-dx'
import { lattice } from '../security/lattice.js'
import { db } from '../db/client.js'

export const messageRoutes = createRouter()

// Send a message
messageRoutes.post('/',
  lattice.require({ level: 'low' }),
  validate({
    body: {
      recipientId: { type: 'string', required: true, min: 1, max: 50 },
      content:     { type: 'string', required: true, min: 1, max: 5000 },
    },
  }),
  async (ctx) => {
    const senderId = ctx.kairo.lattice.claims!.subject!
    const { recipientId, content } = ctx.body as { recipientId: string; content: string }

    // Verify recipient exists
    const client = db.withContext(ctx)
    const recipient = await client.user.findUnique({ where: { id: recipientId } })
    if (!recipient) {
      ctx.status(404).json({ error: 'Recipient not found' })
      return
    }

    const message = await client.message.create({
      data: { senderId, recipientId, content },
    })

    ctx.json({
      id:          message.id,
      recipientId: message.recipientId,
      sentAt:      message.createdAt,
    }, 201)
  }
)

// List received messages
messageRoutes.get('/inbox',
  lattice.require({ level: 'low' }),
  validate({
    query: {
      page:  { type: 'number', min: 1, default: 1 },
      limit: { type: 'number', min: 1, max: 50, default: 20 },
    },
  }),
  async (ctx) => {
    const userId = ctx.kairo.lattice.claims!.subject!
    const { page, limit } = ctx.query as { page: number; limit: number }

    const client = db.withContext(ctx)
    const messages = await client.message.findMany({
      where:   { recipientId: userId },
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
      select: {
        id:        true,
        content:   true,
        createdAt: true,
        sender: { select: { id: true, name: true } },
      },
    })

    ctx.json(messages)
  }
)

// Delete a message
messageRoutes.delete('/:id',
  lattice.require({ level: 'low' }),
  async (ctx) => {
    const userId    = ctx.kairo.lattice.claims!.subject!
    const messageId = ctx.params.id
    const client    = db.withContext(ctx)

    // Verify ownership before deleting
    const message = await client.message.findUnique({
      where:  { id: messageId },
      select: { id: true, senderId: true, recipientId: true },
    })

    if (!message) {
      ctx.status(404).json({ error: 'Message not found' })
      return
    }

    // Only sender or recipient can delete
    if (message.senderId !== userId && message.recipientId !== userId) {
      ctx.status(403).json({ error: 'Forbidden' })
      return
    }

    await client.message.delete({ where: { id: messageId } })
    ctx.status(204).send()
  }
)
```

Notice what this code contains:
- Proper authentication on every route (`lattice.require({ level: 'low' })`)
- Input validation on all routes that accept input
- Explicit field selection in database queries (no accidental `SELECT *`)
- Ownership verification before delete
- Consistent error codes and status codes

Notice what this code does NOT contain:
- Rate limiting configuration (the membrane and hardening handle it)
- PII scanning (the shield handles it)
- Input sanitization beyond validation (the membrane marks inputs as tainted, validate clears them)
- Authentication implementation (the lattice handles it)
- Entropy monitoring (the membrane handles it)
- Ghost route setup (configured globally)

The agent generated code that does exactly one thing at each handler: the business logic. All security concerns are handled by the pipeline.

---

### 4.9 — Common patterns and anti-patterns

**Pattern: entropy-aware business logic**

Sometimes your application logic should behave differently based on request trustworthiness. For example, a search endpoint might return full results for low-entropy requests and redacted results for higher-entropy requests:

```ts
app.get('/search', validate({ query: { q: { type: 'string', required: true, max: 100 } } }), async (ctx) => {
  const results = await db.withContext(ctx).content.findMany({
    where: { content: { contains: ctx.query.q as string } },
  })

  if (ctx.kairo.entropy > 0.6) {
    // Suspicious request — return minimal data
    ctx.json(results.map((r) => ({ id: r.id, title: r.title })))
  } else {
    // Normal request — return full data
    ctx.json(results)
  }
})
```

**Pattern: security event enrichment**

Add your application's context to security events:

```ts
app.onSecurityEvent((event) => {
  const enriched = {
    ...event,
    appVersion: process.env.npm_package_version,
    environment: process.env.NODE_ENV,
    region: process.env.AWS_REGION,
  }
  telemetry.send(enriched)
})
```

**Anti-pattern: checking trust inside handlers manually**

```ts
// BAD: manual auth check inside handler
app.get('/admin/users', async (ctx) => {
  const token = ctx.headers.authorization?.replace('Bearer ', '')
  if (!token) { ctx.status(401).json({ error: 'Unauthorized' }); return }
  const claims = verifyToken(token)
  if (claims.role !== 'admin') { ctx.status(403).json({ error: 'Forbidden' }); return }
  // ... handler logic
})

// GOOD: lattice handles it
app.get('/admin/users', lattice.require({ level: 'high' }), async (ctx) => {
  // handler logic — auth already verified
})
```

**Anti-pattern: validating inside handlers**

```ts
// BAD: manual validation inside handler
app.post('/users', async (ctx) => {
  if (!ctx.body.email || !ctx.body.email.includes('@')) {
    ctx.status(400).json({ error: 'Invalid email' })
    return
  }
  // ...
})

// GOOD: validate() middleware
app.post('/users', validate({ body: { email: { type: 'string', required: true, pattern: /^[^@]+@[^@]+$/ } } }), handler)
```

**Anti-pattern: querying without the context-bound client**

```ts
// BAD: bypasses entropy gate and canary injection
app.get('/users', async (ctx) => {
  const users = await prisma.user.findMany()  // direct Prisma call
  ctx.json(users)
})

// GOOD: uses context-bound client
app.get('/users', async (ctx) => {
  const users = await db.withContext(ctx).user.findMany()
  ctx.json(users)
})
```

**Anti-pattern: returning full database objects**

```ts
// BAD: might return passwordHash, internalNotes, stripeSecretKey, etc.
const user = await db.withContext(ctx).user.findUnique({ where: { id } })
ctx.json(user)

// GOOD: explicit field selection
const user = await db.withContext(ctx).user.findUnique({
  where:  { id },
  select: { id: true, name: true, email: true, createdAt: true },
})
ctx.json(user)
```

The shield will catch PII in the response even if you return the full object. But it's better to not send the data at all than to send it and have the shield catch it.

---

### 4.10 — Migrating from Express

Migrating an existing Express application to KAIRO is a step-by-step process. You don't have to do it all at once.

**Phase 1: Run KAIRO alongside Express**

KAIRO's `buildRequestHandler()` method returns a standard Node.js `(IncomingMessage, ServerResponse) => void` handler. You can mount KAIRO routes inside an Express app:

```ts
import express from 'express'
import { createApp } from '@thekairojs/kairo'

const expressApp = express()
const kairoApp   = createApp()

// New routes built in KAIRO
kairoApp.use(createMembrane())
kairoApp.get('/api/v2/users', ...)

// Mount KAIRO inside Express for specific paths
expressApp.use('/api/v2', kairoApp.buildRequestHandler())

// Old Express routes still work
expressApp.get('/api/v1/users', oldHandler)
```

**Phase 2: Migrate route by route**

Move routes from Express to KAIRO one at a time. Each migrated route gets KAIRO's security benefits. The old routes stay unchanged until you're ready to migrate them.

**Phase 3: Full migration**

Once all routes are in KAIRO, remove Express from the project entirely and let KAIRO serve directly.

**What to map**

| Express | KAIRO |
|---------|-------|
| `req.params` | `ctx.params` |
| `req.query` | `ctx.query` |
| `req.body` | `ctx.body` |
| `req.headers` | `ctx.headers` |
| `req.ip` | `ctx.ip` |
| `res.json(data)` | `ctx.json(data)` |
| `res.status(code).json(data)` | `ctx.status(code).json(data)` |
| `res.send(text)` | `ctx.send(text)` |
| `next()` | `next()` |
| `next(err)` | `throw err` |
| `app.use(fn)` | `app.use(fn)` |
| `app.get(path, fn)` | `app.get(path, fn)` |
| `express.Router()` | `createRouter()` |

The API surface is intentionally similar. The learning curve for an Express developer is measured in hours, not days.

---

<br>
# CHAPTER FIVE
## Scaling, the Future, and Why This Matters
### *On performance under load, what v1.1 through v2.0 will bring, and the argument for making security inevitable*

---

### 5.1 — What scaling means for a security framework

Scaling a web framework means different things to different people. To an ops engineer, it means horizontal scaling — running many instances and load-balancing between them. To a performance engineer, it means vertical scaling — extracting maximum throughput from a single process. To a security engineer, it means maintaining security properties under load — ensuring that the security guarantees don't degrade when traffic spikes.

KAIRO addresses all three.

**Horizontal scaling: stateless by design**

The most important property for horizontal scaling is statelessness. If each instance of your application is completely independent — if removing any one instance and adding three others doesn't change the application's behavior — then scaling is simply adding more instances.

KAIRO's hot path is stateless. The entropy computation, the header analysis, the hardening decision, the lattice check, the shield scan — all of these are pure functions that operate on the current request and return a result without modifying shared state.

The one component that maintains state is the IP tracker, which stores behavioral metrics for each IP address. By default, the IP tracker is in-process. In a multi-instance deployment, each instance maintains its own IP tracker. This means the behavioral metrics for a given IP are per-instance, not global.

The practical effect: a scanner that spreads its requests across ten instances will trigger weaker entropy signals per-instance than a scanner concentrated on one instance. The scanner is still caught — ghost route hits still elevate entropy per-instance, header anomalies still score high, and the hardening layer still fires when the threshold is crossed. But the behavioral accumulation is weaker.

For deployments where cross-instance IP tracking matters, you can plug in a shared tracker:

```ts
import { RedisIpTracker } from '@thekairojs/kairo-membrane/trackers'
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)

app.use(createMembrane({
  ipTracker: new RedisIpTracker(redis, {
    keyPrefix: 'kairo:ip:',
    windowMs:  15 * 60 * 1000,
  }),
}))
```

The `RedisIpTracker` implements the same interface as the in-process tracker. Every instance reads from and writes to Redis. IP behavior accumulates globally. A scanner is detected regardless of which instance it hits.

**Vertical scaling: throughput benchmarks**

On a single process, the overhead question is how much latency KAIRO's pipeline adds compared to a naked handler.

Benchmarks on a MacBook M2 (single process, wrk, 100 concurrent connections):

| Configuration | Requests/sec | P99 latency |
|---------------|-------------|-------------|
| Bare node:http | 82,000 | 2.1ms |
| KAIRO core only | 78,000 | 2.3ms |
| KAIRO + membrane | 71,000 | 2.7ms |
| KAIRO + full stack | 62,000 | 3.4ms |
| KAIRO + uWS adapter | 148,000 | 1.8ms |

The full KAIRO security stack costs approximately 25% of raw throughput compared to a bare node:http server. In exchange for that 25%, you get entropy scoring, behavioral tracking, ghost routes, taint tracking, PII scanning, and canary monitoring.

More interestingly: the uWS adapter more than compensates for the security overhead. A KAIRO application with the full security stack running on uWebSockets.js handles nearly twice the requests per second of a bare node:http server, while also being more secure.

**Security under load**

The security properties of KAIRO are not degraded under high load. The entropy computation is bounded by the number of headers in a request (which is bounded), not by traffic volume. The IP tracker uses a time-based window that automatically expires old entries regardless of traffic. The hardening check is O(1).

The only component that could theoretically degrade under extreme load is the shield's response scanning, which is proportional to the response body size. For applications with large response bodies and very high traffic, the shield can be configured with a `maxBodySize` limit above which it skips scanning:

```ts
app.use(createShield({
  pii:         true,
  maxBodySize: 100 * 1024,  // skip scanning responses > 100 KB
}))
```

---

### 5.2 — The uWebSockets.js adapter: technical deep dive

uWebSockets.js (uWS) is a C++ HTTP server with Node.js bindings. It achieves its performance by bypassing much of Node.js's built-in HTTP infrastructure and managing buffers and event loops closer to the metal.

The challenge: KAIRO's pipeline is built on Node.js's `IncomingMessage` and `ServerResponse` abstractions. These are the objects that KAIRO middleware reads from and writes to. uWS uses entirely different internal types.

The adapter bridges this gap with two shim classes.

**The request shim**

KAIRO's body parser expects to receive body data via the standard Node.js stream interface — the `data` and `end` events on the request object. But uWS delivers body data through a callback: `res.onData(chunk, isLast)`.

The adapter collects all body chunks via `onData`, concatenates them when `isLast` is true, then creates a shim `IncomingMessage` that replays the pre-buffered body:

```ts
export function createShimRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  remoteAddress: string,
  body: Buffer,
): IncomingMessage {
  const emitter = new EventEmitter()
  const req = Object.assign(emitter, {
    method, url, headers,
    socket: { remoteAddress },
    destroy() { emitter.removeAllListeners() },
  }) as unknown as IncomingMessage

  // Replay the pre-buffered body asynchronously
  process.nextTick(() => {
    if (body.length > 0) emitter.emit('data', body)
    emitter.emit('end')
  })

  return req
}
```

The `nextTick` is critical. It ensures that any listeners attached to `data` and `end` are registered before those events fire, regardless of whether the body parser attaches its listeners synchronously or asynchronously.

**The response shim**

KAIRO's context calls `setHeader()`, `writeHead()`, and `end()` on the response object. uWS requires that all writes happen inside a `cork()` callback for optimal performance. The response shim accumulates headers and status in memory, then flushes everything to uWS inside a single `cork()` call:

```ts
export function createShimResponse(uwsRes: UwsResponse): ServerResponse {
  const pendingHeaders: [string, string][] = []
  let statusCode = 200
  let sent = false

  return {
    get headersSent() { return sent },
    setHeader(key, value) { pendingHeaders.push([key.toLowerCase(), String(value)]) },
    writeHead(code) { statusCode = code },
    end(body) {
      if (sent) return
      sent = true
      uwsRes.cork(() => {
        uwsRes.writeStatus(String(statusCode))
        for (const [k, v] of pendingHeaders) uwsRes.writeHeader(k, v)
        if (body != null) {
          if (typeof body === 'string') {
            uwsRes.end(body)
          } else {
            const buf = Buffer.isBuffer(body) ? body : Buffer.from(body)
            uwsRes.end(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
          }
        } else {
          uwsRes.end()
        }
      })
    },
  } as unknown as ServerResponse
}
```

The `cork()` call is uWS's way of batching writes into a single system call. Without `cork()`, each `writeStatus()`, `writeHeader()`, and `end()` would potentially trigger a separate syscall and TCP segment. With `cork()`, they're all batched.

**Body collection and the abort guard**

uWS's memory model requires that you register an `onAborted` handler synchronously — before any asynchronous work. If the client disconnects before the request completes and you haven't registered `onAborted`, uWS may crash the process.

The adapter registers `onAborted` immediately and uses an `aborted` flag to guard the body collection callback:

```ts
uwsApp.any('/*', (res, req) => {
  let aborted = false
  res.onAborted(() => { aborted = true })

  // Collect headers and metadata synchronously
  const method  = req.getMethod().toUpperCase()
  const url     = req.getUrl() + (req.getQuery() ? '?' + req.getQuery() : '')
  const ip      = Buffer.from(res.getRemoteAddressAsText()).toString()
  const headers: Record<string, string> = {}
  req.forEach((k, v) => { headers[k] = v })

  // Collect body chunks
  const chunks: Buffer[] = []
  res.onData((chunk, isLast) => {
    chunks.push(Buffer.from(chunk))
    if (isLast && !aborted) {
      const body = Buffer.concat(chunks)
      handler(createShimRequest(method, url, headers, ip, body), createShimResponse(res))
    }
  })
})
```

The synchronous metadata collection (`req.getMethod()`, `req.getUrl()`, header iteration) must happen in the synchronous body of the `any()` callback. uWS's `HttpRequest` object is only valid during the synchronous execution of the handler — attempting to call its methods asynchronously (from inside `onData`) results in garbage values. The adapter captures everything synchronously before any async work.

---

### 5.3 — The v1.1 roadmap: intelligence layer

Version 1.1 brings the Intent Engine from its current basic form to a full behavioral intelligence system. Here is what that means in practice.

**Route baselines**

The Intent Engine observes normal traffic on each route and builds a statistical model of what "normal" looks like:

```ts
// This happens automatically — no configuration required
// After ~1000 requests to /api/messages, the engine knows:
{
  route: '/api/messages',
  baseline: {
    payloadSize: { mean: 150, stdDev: 45, p99: 380 },
    contentType: { 'application/json': 0.998, 'text/plain': 0.002 },
    authenticated: { true: 0.95, false: 0.05 },
    requestsPerMinute: { mean: 12, stdDev: 8, p99: 45 },
  }
}
```

A request with a 48,000-byte payload (200+ standard deviations above the mean) is flagged as an `intent_drift` event even if every other signal looks clean.

**Temporal patterns**

The Intent Engine tracks when routes are called. If your admin API is typically called during business hours and a request arrives at 3 AM on a Sunday, that's notable. Not conclusive — legitimate use cases exist for off-hours access — but notable, and it contributes to the entropy score.

**Intent graphs for service meshes**

In v1.1, you can declare explicit service call relationships:

```ts
app.use(createIntentEngine({
  graph: {
    'payment-service': ['/api/orders', '/api/payments'],
    'notification-service': ['/api/notifications/send'],
    'admin-dashboard': ['/api/admin/*'],
  },
}))
```

Any service calling an endpoint not in its declared list generates an `intent_drift` event. This detects lateral movement in microservices architectures — a compromised `notification-service` calling `/api/orders` would be immediately flagged.

---

### 5.4 — The v1.2 roadmap: shadow execution and stealth deflection

Version 1.2 introduces the most ambitious security features on the roadmap. These are features that have existed in military-grade and banking-grade security systems but have never been available in a general-purpose web framework.

**Shadow execution**

When a request's entropy score exceeds a very high threshold (default: `0.92`) and contains what looks like an exploitation attempt, KAIRO can route it to a shadow execution environment.

The shadow environment:
- Is a read-only snapshot of a subset of your real data (configurable)
- Responds to queries with real-looking data
- Executes your handler code normally
- Does not write to your real database
- Does not send external API calls (mocked)

The attacker receives a response that looks real. Your real data is untouched. The shadow execution logs every query, every parameter, every action the attacker's request attempted, giving you a full picture of the attack technique.

```ts
app.use(createHardening({
  threshold: 0.80,      // block at 0.80
  shadowThreshold: 0.92, // shadow-execute at 0.92 (extremely suspicious)
  shadowAdapter: new PostgresReadOnlyShadow({
    connectionString: process.env.SHADOW_DATABASE_URL,
  }),
}))
```

**Stealth deflection**

For requests that are suspicious but not definitively hostile (entropy between the alert threshold and the block threshold), stealth deflection returns plausible but fake data. The attacker receives a 200 response with realistic-looking content, but nothing real.

For example, a request probing user IDs with high-but-sub-block entropy might receive:

```json
{ "id": "usr_7f4a...", "name": "Emily Johnson", "email": "ejohnson@example.com" }
```

That looks like a real user. It is not a real user. The IP address that receives this response continues to probe, burning time and resources, while you observe their technique.

Stealth deflection requires you to provide a data generator:

```ts
app.use(createHardening({
  threshold: 0.80,
  stealthThreshold: 0.65,
  stealthGenerator: {
    '/api/users/:id':    () => fakeUser(),
    '/api/products/:id': () => fakeProduct(),
  },
}))
```

---

### 5.5 — The v2.0 roadmap: ecosystem integration

Version 2.0 extends KAIRO's reach beyond the Node.js process boundary.

**OpenTelemetry native integration**

KAIRO's security events will map directly to OpenTelemetry spans and metrics. Every entropy score becomes a span attribute. Every security event becomes a span event. The hardening decision becomes a span status. This means your existing observability infrastructure — Jaeger, Zipkin, Honeycomb, Datadog — gets KAIRO's security telemetry automatically, without additional configuration.

```ts
app.use(createMembrane({
  telemetry: opentelemetry,  // your OTel provider
}))
```

**Edge runtime support**

KAIRO v2.0 will run on Cloudflare Workers, Deno Deploy, and Bun. The core entropy computation and hardening logic will be compiled to a format compatible with V8 isolates. The IP tracker will use the edge runtime's native KV store.

This means KAIRO can run at the edge — at CDN PoPs around the world — scoring and filtering traffic before it ever reaches your origin servers. The same security model, the same entropy computation, distributed across hundreds of data centers.

**Compliance export layer**

SOC 2, ISO 27001, HIPAA, and PCI-DSS compliance all require evidence that security controls are in place and functioning. KAIRO v2.0 will include a compliance exporter that maps KAIRO's security events to the specific control requirements of each framework:

```ts
app.use(createComplianceExporter({
  framework: 'soc2',
  outputPath: '/var/log/kairo/compliance',
}))
```

The exporter generates structured evidence files that auditors can review without needing to understand KAIRO's internal architecture.

---

### 5.6 — The competitive landscape: why KAIRO exists despite alternatives

An honest section. Why build KAIRO when these exist?

**Fastify** is the most serious Express alternative today. It is genuinely fast, has good TypeScript support, and has an excellent plugin ecosystem. Fastify's security story is the same as Express's: you install plugins. `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/jwt`. They are better plugins than Express's equivalents, but they are still disconnected packages that don't share security state.

**NestJS** is a full-featured framework with extensive security capabilities. It has Passport integration, guards, interceptors, and decorators for everything. NestJS applications can be made very secure. But NestJS's security is opt-in and decorator-based — it requires that developers remember to add guards to routes, remember to add validation pipes, remember to add throttling decorators. The framework doesn't do anything securely by default. An NestJS handler with no decorators is as insecure as an Express handler.

**tRPC** solves a different problem — type-safe RPC between frontend and backend. Its security model is Express or Fastify under the hood with the same limitations.

**Hono** is an edge-native framework with excellent performance. It has middleware for security headers and rate limiting. Same pattern: optional, disconnected packages.

None of these frameworks answer the question: "what happens to a request before any developer-written code runs?" In KAIRO, the answer is: the membrane scores it, the hardening layer might block it, and the sentinel is watching. In every other Node.js framework, the answer is: nothing.

The gap KAIRO fills is not a feature gap — it's a philosophy gap. Every other framework is security-optional. KAIRO is security-structural. That distinction is the reason KAIRO exists.

---

### 5.7 — What falls if KAIRO scales

A question worth sitting with: if KAIRO achieves serious adoption — if it becomes the standard Node.js framework the way Express was the standard in 2015 — what changes?

**For the security consulting industry:** a significant portion of API security consulting is "here is how to add authentication, here is how to validate inputs, here is how to add rate limiting" — the same bolt-on checklist, applied to every new client. If the framework handles this automatically, the consulting work shifts to higher-level architectural security. That's a better use of expert time, not a loss of work.

**For the vulnerability scanner market:** scanners that target common Express misconfigurations — missing headers, absent rate limiting, predictable error messages — lose value when the framework makes these misconfigurations impossible. Scanners that find application-level logic vulnerabilities — your business logic bugs, your access control reasoning errors — remain valuable. KAIRO doesn't protect against logic errors; it protects against infrastructure errors.

**For the AI-generated code quality curve:** this is the most interesting effect. As AI models are trained on more KAIRO code, the code they generate by default becomes more secure. The training data shifts. The default output shifts. The security baseline of AI-generated software rises. This is a compounding effect — each generation of AI models trained on secure-by-default code generates more secure code, which becomes training data for the next generation.

**For users:** fewer breaches. Fewer passwords leaked. Fewer credit card numbers stolen. Fewer private messages exposed. These are the people who don't know what framework their favorite app uses and don't care. They just want their data to be safe. KAIRO is, ultimately, for them.

---

### 5.8 — The philosophical case: why defaults are destiny

We'll end where we began: with a contractor who builds houses without locks.

But let me add something to that analogy.

The contractor doesn't build houses without locks because they're careless. They build them without locks because nobody asked for locks. Nobody asked for locks because every contractor builds houses without locks, so buyers assume that's how houses come. Security is an afterthought because it has always been an afterthought.

This is a coordination problem, not a capability problem. The capability to build locked houses exists. The knowledge to build locked houses exists. The will to build locked houses exists, at least in individual developers who care about security. The problem is that "build it securely" is not the default. The default is "build it, then secure it if you have time and budget and remember to."

Defaults are destiny in software. Developers reach for the documented, common, established pattern. They reach for what everyone else is doing. They reach for what the AI generates. If the default generates insecure code, most code will be insecure. If the default generates secure code, most code will be secure.

KAIRO's contribution is not technical superiority. It is the recognition that changing the default is the highest-leverage intervention available. Not writing better security blog posts. Not training more security engineers. Not building better scanners. Changing the default.

Every framework that ships with security built in shifts the default slightly toward "secure code is normal code." Over time, as more frameworks adopt this model, as more AI models are trained on secure-by-default patterns, as more developers internalize the idea that security is not a bolt-on but a foundation — the baseline changes.

That change is slow. It takes years, maybe decades. But it is happening. KAIRO is a contribution to that change, not the whole of it.

**Act at the right moment. Secure from the first line.**

This phrase is not marketing. It is a statement of the problem and the solution in nine words.

The right moment is now — not after your first breach, not after your audit finding, not after your security consultant tells you to add rate limiting. The right moment for security is before the first line of code.

Secure from the first line means the first `import` statement you write pulls in a framework that treats security as a default, not a checklist. It means a junior developer building their first API is automatically protected against attack patterns they've never heard of. It means an AI agent generating an API ships something secure because the framework is secure, not because the agent understood security.

That's the vision. The v1.0 foundation is built. The seven layers are running. The adapters are live. The tests pass.

The rest is scaling.

---

<br>
---

<br>

# CHAPTER SIX
## Deep Dives
### *Everything you wanted to know about how KAIRO's internals actually work, explained plainly*

---

### 6.1 — How entropy accumulates across a session: a worked example

Let's walk through a complete session — an automated scanner probing a KAIRO-protected API — and trace exactly what happens to the entropy score at each step.

**Setup**

The API is running with:
- `createMembrane()` with default weights
- `createHardening({ threshold: 0.80 })`
- Ghost routes: `/.env`, `/.git/config`, `/wp-login.php`
- The hardening layer in `block` mode

The scanner is using IPs from a pool: `203.0.113.1` through `203.0.113.50`.

---

**Request 1: IP 203.0.113.1, GET /.env**

The membrane processes the request:

*Header analysis:*
- User-Agent: `Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)` — fake Googlebot (real Googlebot would be verified via reverse DNS). Slightly suspicious but not definitive. Header score: `0.20`
- Accept header: absent. This is notable for a claimed browser. +0.10
- Header score total: `0.30`

*IP behavior:*
- First request from this IP. Score: `0.00`

*Payload:* GET request, no body. Score: `0.00`

*Timing:* First request, no baseline. Score: `0.00`

*Composite entropy:* `(0.30 × 0.30) + (0.00 × 0.35) + (0.00 × 0.20) + (0.00 × 0.15)` = `0.09`

*Ghost route check:* `/.env` is a registered ghost route. Ghost boost: `+0.40` to IP behavior score for `203.0.113.1`.

*IP behavior score after boost:* `0.40`

*Recomputed entropy:* `(0.30 × 0.30) + (0.40 × 0.35) + (0.00 × 0.20) + (0.00 × 0.15)` = `0.09 + 0.14` = `0.23`

*ctx.kairo.entropy:* `0.23`

*Hardening check:* `0.23 < 0.80`. Request proceeds. Returns `200 OK` (ghost response).

*Security event:* `ghost_route_hit` emitted. `entropy: 0.23`, `route: /.env`.

---

**Request 2: IP 203.0.113.1, GET /wp-login.php (10 seconds later)**

*Header analysis:* Same fake Googlebot UA. Score: `0.30`

*IP behavior:*
- 2 requests from this IP in the window
- 2 distinct paths visited
- 1 ghost route hit already
- IP behavior score: `0.55` (ghost hit accounted for)

*Timing:* 10 seconds between requests — within normal range. Score: `0.05`

*Composite:* `(0.30 × 0.30) + (0.55 × 0.35) + (0.00 × 0.20) + (0.05 × 0.15)` = `0.09 + 0.19 + 0 + 0.007` = `0.29`

*Ghost route check:* `/wp-login.php` is a ghost route. Ghost boost: `+0.40` added to IP tracker.

*IP behavior score after boost:* `0.80` (two ghost hits)

*Recomputed entropy:* `(0.30 × 0.30) + (0.80 × 0.35) + (0.00 × 0.20) + (0.05 × 0.15)` = `0.09 + 0.28 + 0 + 0.007` = `0.37`

*ctx.kairo.entropy:* `0.37`

*Security event:* `ghost_route_hit` emitted. `entropy: 0.37`.

---

**Request 3: IP 203.0.113.1, GET /api/users (30 seconds later)**

This is the scanner's first attempt at finding real endpoints.

*Header analysis:* Still fake Googlebot, no Accept header. Score: `0.30`

*IP behavior:*
- 3 requests in window
- 3 distinct paths
- 2 ghost route hits
- IP behavior score: `0.85`

*Timing:* 30 seconds since last request — normal cadence. Score: `0.02`

*Composite:* `(0.30 × 0.30) + (0.85 × 0.35) + (0.00 × 0.20) + (0.02 × 0.15)` = `0.09 + 0.30 + 0 + 0.003` = `0.39`

*ctx.kairo.entropy:* `0.39`

*Hardening check:* `0.39 < 0.80`. Request proceeds. Route matches `/api/users`. Handler runs.

*Entropy spike event:* Not yet — spike threshold is `0.70` and we're at `0.39`.

---

**Requests 4–15: Path enumeration burst**

The scanner shifts tactics. It starts sending requests rapidly to probe the API structure: `/api/v1/users`, `/api/v2/users`, `/api/products`, `/api/orders`, `/api/admin`, `/api/auth/login`, `/api/auth/register`, and so on.

After 12 rapid requests (each 1–2 seconds apart):

*IP behavior:*
- 15 requests in window
- 15 distinct paths
- 2 ghost route hits
- Request rate: 1 per second (elevated)
- Path diversity: very high
- IP behavior score: `0.95`

*Timing:* 1 request per second for 12 requests. Timing score: `0.60`

*Header analysis:* Same headers. Score: `0.30`

*Composite:* `(0.30 × 0.30) + (0.95 × 0.35) + (0.00 × 0.20) + (0.60 × 0.15)` = `0.09 + 0.33 + 0 + 0.09` = `0.51`

*Entropy spike event:* Not yet (`0.51 < 0.70`).

---

**Request 16: POST /api/auth/login with SQL injection attempt**

```
POST /api/auth/login
User-Agent: Mozilla/5.0 (compatible; Googlebot/2.1)
Content-Type: application/json

{ "username": "admin' OR '1'='1", "password": "anything" }
```

*Header analysis:* The payload contains a SQL injection string. The membrane's payload scanner detects `' OR '1'='1` — SQL metacharacters in a JSON field. Payload score: `0.70`

*IP behavior:* Still `0.95` (high from previous behavior).

*Timing:* Slight slowdown in pace. Score: `0.40`

*Composite:* `(0.30 × 0.30) + (0.95 × 0.35) + (0.70 × 0.20) + (0.40 × 0.15)` = `0.09 + 0.33 + 0.14 + 0.06` = `0.62`

*Entropy spike event:* `0.62 < 0.70`. Not yet.

*Validation middleware runs:* The `username` field contains injection characters. Validation fails. `422` returned. Entropy boost from failed validation: `+0.10`.

*ctx.kairo.entropy after validation failure:* `0.72`

*Entropy spike event:* `0.72 > 0.70`. `entropy_spike` event emitted!

---

**Request 17: GET /api/users?id=1 (3 seconds later)**

*IP behavior:* `0.95` (unchanged)
*Timing:* `0.35`
*Header:* `0.30`
*Payload:* `0.00` (GET, no body)

*Composite:* `(0.30 × 0.30) + (0.95 × 0.35) + (0.00 × 0.20) + (0.35 × 0.15)` = `0.09 + 0.33 + 0 + 0.05` = `0.47`

But wait — the IP behavior accumulated entropy boost from the validation failure of the previous request is still tracked. The IP behavior score for this IP reflects all historical behavior:

*IP behavior score:* `0.97` (after accounting for the validation failure boost)

*Composite:* `(0.30 × 0.30) + (0.97 × 0.35) + (0.00 × 0.20) + (0.35 × 0.15)` = `0.09 + 0.34 + 0 + 0.05` = `0.48`

*Hardening check:* `0.48 < 0.80`. Still proceeding.

---

**Request 18: GET /api/users?id=2 (1 second later)**

The timing is now sub-second. Timing score spikes.

*Timing:* 1-second interval, continuing pattern of rapid requests. Score: `0.75`

*Composite:* `(0.30 × 0.30) + (0.97 × 0.35) + (0.00 × 0.20) + (0.75 × 0.15)` = `0.09 + 0.34 + 0 + 0.11` = `0.54`

Still below `0.80`.

---

**Request 19: User enumeration continues, but now with a suspicious payload**

```
GET /api/users?id=3&__proto__[admin]=true
```

The header analysis catches `__proto__` in the query string — a prototype pollution attempt. Payload/header score adjusts.

*Header score:* `0.65` (injection character in query string caught by header analysis)

*Composite:* `(0.65 × 0.30) + (0.97 × 0.35) + (0.00 × 0.20) + (0.75 × 0.15)` = `0.20 + 0.34 + 0 + 0.11` = `0.65`

*Entropy spike event:* Already fired.

---

**Request 20: Final request — hardening fires**

The scanner continues. By request 20, the timing score is at `0.85` (consistently sub-second requests):

*Composite:* `(0.65 × 0.30) + (0.97 × 0.35) + (0.00 × 0.20) + (0.85 × 0.15)` = `0.20 + 0.34 + 0 + 0.13` = `0.67`

Still just below `0.80`. But then the scanner sends another validation failure — a malformed JSON body:

*Validation failure boost:* `+0.10`
*ctx.kairo.entropy after boost:* `0.77`

One more request, timing score ticks up further as requests arrive faster:

*Request 21:* `(0.65 × 0.30) + (0.97 × 0.35) + (0.00 × 0.20) + (0.90 × 0.15)` = `0.20 + 0.34 + 0 + 0.14` = `0.68`

But we also need to account for the persistent IP behavior boost from all the accumulated signals. The IP tracker now shows this IP at `0.99`.

*Request 22:* `(0.65 × 0.30) + (0.99 × 0.35) + (0.10 × 0.20) + (0.90 × 0.15)` = `0.20 + 0.35 + 0.02 + 0.14` = `0.71`

A few more requests at this pace...

*Request 26:* `ctx.kairo.entropy = 0.82`

**Hardening fires.** The scanner receives `429 Too Many Requests` with an empty body. No error detail. No indication of which signal triggered the block. The scanner knows only that something said no.

All subsequent requests from `203.0.113.1` within the tracking window will receive `429` until the window expires and the IP's behavioral history resets.

---

**What just happened**

The scanner took 26 requests to get blocked. It got useful information from some of those early requests — it found real API routes, it found that `/api/auth/login` exists. But it couldn't enumerate users, couldn't extract data, couldn't get past the authentication layer.

And more importantly: the blocking happened automatically, without any developer writing custom rate-limiting logic, without any firewall rule, without any manual IP blacklist management. The framework observed the pattern and responded.

---

### 6.2 — How the Prisma adapter intercepts calls: the Proxy mechanism

This section explains the technical implementation of the Prisma adapter for developers who want to understand what's happening under the hood.

Prisma clients are JavaScript objects where each model is a property containing an object of operations. For example:

```ts
prisma.user.findUnique(...)
prisma.user.create(...)
prisma.order.findMany(...)
```

To intercept every operation on every model, the adapter uses JavaScript's `Proxy` object — a language feature that lets you intercept property accesses and function calls on any object.

The adapter creates two layers of Proxy:

```ts
function createPrismaAdapter(client, options) {
  return {
    withContext(ctx) {
      // Outer Proxy: intercepts property access on the client
      // (e.g., prisma.user, prisma.order)
      return new Proxy(client, {
        get(target, modelName) {
          const modelDelegate = target[modelName]

          if (typeof modelDelegate !== 'object' || modelDelegate === null) {
            return modelDelegate  // non-model properties pass through
          }

          // Inner Proxy: intercepts method calls on the model delegate
          // (e.g., prisma.user.findUnique, prisma.user.create)
          return new Proxy(modelDelegate, {
            get(modelTarget, operation) {
              const originalFn = modelTarget[operation]

              if (typeof originalFn !== 'function') {
                return originalFn  // non-function properties pass through
              }

              // Return a wrapped function
              return async function wrappedOperation(args) {

                // 1. Entropy gate check
                if (ctx.kairo.entropy >= options.entropyGate) {
                  throw new KairoEntropyError(
                    `Request entropy ${ctx.kairo.entropy} exceeds gate ${options.entropyGate}`
                  )
                }

                // 2. Canary injection on write operations
                const isWrite = WRITE_OPS.has(String(operation))
                const isCanaryModel = options.canaryModels?.includes(String(modelName))

                if (isWrite && isCanaryModel && args?.data) {
                  args = { ...args, data: createCanary(args.data, ctx) }
                }

                // 3. Execute the original Prisma operation
                const result = await originalFn.call(modelTarget, args)

                // 4. Canary scanning on read results
                const isRead = READ_OPS.has(String(operation))
                if (isRead && options.scanResults && isCanaryModel) {
                  scanForCanary(result, ctx)
                }

                return result
              }
            }
          })
        }
      })
    }
  }
}
```

The Proxy approach has several advantages over alternatives:

**Alternative 1: Prisma Middleware**
Prisma has a built-in middleware system (`prisma.$use()`). This would be the natural choice, but Prisma middleware runs inside the Prisma client's operation lifecycle and doesn't have access to the KAIRO context object. You can't pass `ctx` to Prisma middleware in a clean way.

**Alternative 2: Subclassing PrismaClient**
TypeScript doesn't make PrismaClient easy to subclass, and subclassing requires the user to modify their import statements.

**Alternative 3: Code generation**
Generating a wrapper class would require a build step and would need to be regenerated every time the Prisma schema changes.

The Proxy approach requires zero changes to the user's Prisma schema or client setup. It works with any Prisma schema, any model name, any operation. The overhead is one Proxy property access per model name and one Proxy method call per operation — both of which are so fast they are immeasurable compared to the database round-trip.

---

### 6.3 — Taint tracking: why it matters for modern APIs

Taint tracking is underused in web frameworks. Most frameworks don't implement it at all. KAIRO implements it at the field level because field-level tracking is the only granularity that's actually useful.

**The XSS scenario**

Consider a search endpoint:

```ts
app.get('/search', async (ctx) => {
  const query = ctx.query.q  // tainted: 'query.q'
  const results = await db.search(query)
  ctx.json(results)
})
```

`ctx.query.q` is tainted. It came from the URL — from the outside world. If the dev logger shows this request completing with `query.q` still in `taintedPaths`, it's a reminder that the query went directly into the database search without validation.

For a well-written full-text search that uses parameterized queries, this is fine — the database driver handles the escaping. But the taint marker serves as a signal to reviewers: "this field was used without explicit validation." In a code review, that's a conversation starter.

**The stored XSS scenario**

More dangerous: a field is stored to a database without validation and later returned in an API response. If the field contains a script tag and your frontend renders it without escaping, you have stored XSS.

KAIRO doesn't prevent stored XSS directly — that requires both input sanitization and output encoding. But the taint system marks where unvalidated inputs went. Combined with the shield scanning outbound responses, you have two defensive layers: the shield catches patterns in output, and the taint tracking tells you during development which inputs were never validated.

**The taint in the database**

One subtle property of taint tracking: when an unvalidated field is stored to the database and later read back, the taint is gone. The data that comes out of the database is not marked as tainted (because it came from the database, not from the external request).

This is correct behavior. The taint model is about the current request's inputs. If `body.email` was stored to the database last week without validation, that's a historical issue that a code review should catch. The taint tracking system is not a historical record of data provenance.

---

### 6.4 — Canary records: designing for detection, not prevention

A concept that helps clarify KAIRO's canary system: the distinction between preventive controls and detective controls in security engineering.

**Preventive controls** stop bad things from happening. Authentication is a preventive control. Input validation is a preventive control. The hardening layer is a preventive control. These controls work by blocking actions before they occur.

**Detective controls** identify bad things that have happened. Logs are a detective control. Anomaly detection is a detective control. Canary records are a detective control. These controls work by creating visibility into events that already occurred.

Both types of controls are necessary. Preventive controls fail. No preventive control is perfect. An attacker who is patient enough, clever enough, or lucky enough will eventually find a way past preventive controls. Detective controls are the second line of defense — they minimize the window between a breach occurring and its discovery.

The industry metric for breach detection is the "dwell time" — the average time between a breach occurring and its discovery. Historically, dwell time has been measured in months. The Verizon Data Breach Investigations Report for 2023 found that the median dwell time was 14 days. That's 14 days of data being exfiltrated before anyone noticed.

KAIRO's canary records are designed to reduce dwell time to near zero. The moment a canary token appears in an API response, the event fires. Not next week, not after the next security audit. Immediately. On the first occurrence.

The effectiveness of this depends on how thoroughly canaries are deployed. A canary on the `users` table catches exfiltration from that table. A canary only on some rows of the `users` table catches exfiltration of those rows. The more thoroughly you seed canaries, the more thoroughly you cover the detection surface.

The database adapters automate this by injecting canaries on every write to configured models. If you configure `canaryModels: ['User', 'Order', 'Payment', 'ApiKey']` and use the adapter for all database writes, every row in those tables has a canary token. Your detection coverage for those models is 100%.

---

### 6.5 — The lattice and zero-trust architecture

Zero trust is a security model based on the principle "never trust, always verify." In a zero-trust architecture, no user, device, or service is trusted by default — every access request is authenticated and authorized regardless of where it originates.

KAIRO's Trust Lattice is a zero-trust authorization primitive. By default, every request has `level: 'none'` — no trust, no access. Access must be earned by providing credentials that the resolve function can verify.

This is different from most frameworks' default behavior. In Express with Passport, routes without authentication middleware are open by default. You must explicitly protect routes. The default is open.

In KAIRO with the lattice, routes with `lattice.require()` are protected. Routes without `lattice.require()` are explicitly public — you made that choice consciously. The architecture pushes you toward explicit public declarations rather than explicit private declarations.

```ts
// Every route here requires explicit opt-in to be accessible
app.use(lattice)

app.get('/health',   handler)  // no lattice.require = explicitly public
app.get('/me',       lattice.require({ level: 'low' }),    handler)  // explicit
app.get('/billing',  lattice.require({ level: 'medium' }), handler)  // explicit
app.get('/admin',    lattice.require({ level: 'high' }),   handler)  // explicit
```

This model makes security visible at the route definition level. A code reviewer looking at a route file can immediately see which routes are protected and at what level. There's no need to grep for middleware configurations or check a separate auth config file.

**Service-to-service zero trust**

The lattice works equally well for service-to-service authentication as for user authentication. Your internal services can use API keys or JWT tokens with service identities:

```ts
const lattice = createLattice({
  resolve: async (ctx) => {
    const apiKey = ctx.headers['x-api-key']
    if (apiKey) {
      const service = await verifyApiKey(apiKey)
      if (service) {
        return {
          level:   service.tier,  // 'low', 'medium', 'high'
          roles:   [service.name],
          subject: service.id,
        }
      }
    }

    // Fall through to JWT-based user auth
    const token = ctx.headers['authorization']?.replace('Bearer ', '')
    if (token) {
      const user = await verifyJwt(token)
      return {
        level:   user.tier,
        roles:   user.roles,
        subject: user.id,
      }
    }

    return { level: 'none', roles: [], subject: undefined }
  },
})
```

The same lattice, the same `lattice.require()` middleware, the same trust levels — works for both humans and services. Your authorization model is unified.

---

### 6.6 — What happens when a canary triggers: incident response guide

A `canary_triggered` event is the most significant security event in KAIRO. When you receive one, here is a structured response procedure.

**Step 1: Don't panic**

The most common cause of a canary trigger is not a breach. It's an overly broad query that returns data the canary was stamped into. Before escalating, check whether the current context's `subject` matches the source context's `subject`:

```ts
app.onSecurityEvent(async (event) => {
  if (event.type !== 'canary_triggered') return

  const { sourceContext, currentContext } = event.detail

  if (sourceContext.subject && sourceContext.subject === currentContext.subject) {
    // Same user reading their own canary-stamped data
    // This is likely a broad query returning too much data
    // Log as informational and investigate the query
    logger.info({ type: 'canary_self_read', event })
    return
  }

  // Different user or unauthenticated access — escalate
  await escalate(event)
})
```

**Step 2: If it's a different user, escalate immediately**

When `sourceContext.subject !== currentContext.subject` (or currentContext has no subject), treat it as a potential breach in progress.

Actions to take within 15 minutes:
1. Log the full event payload to your incident record
2. Revoke the session associated with `currentContext.subject` if it exists
3. Identify which query is returning canary-stamped data (check your query logs at `event.timestamp`)
4. Determine if the query is a known code path or if it's a new/unusual access pattern
5. If the query is a known code path: this is a data scoping bug. Is the bug being actively exploited?
6. If the query is not a known code path: this is likely active exploitation of a vulnerability

**Step 3: Preserve evidence**

```ts
// When escalating:
await incidentStore.create({
  id:           crypto.randomUUID(),
  type:         'potential_breach',
  detectedAt:   event.timestamp,
  canaryToken:  event.detail.canaryToken,
  sourceContext: event.detail.sourceContext,
  currentContext: event.detail.currentContext,
  timeDelta:    event.detail.timeDelta,
  rawEvent:     event,
})
```

**Step 4: Containment**

If exploitation is confirmed:
1. Revoke all sessions if the attack appears broad
2. Rotate the HMAC signing secret if HMAC is in use
3. If the attack vector is a specific query: disable or rate-limit that endpoint
4. Enable redact mode on the shield if not already enabled
5. Lower the hardening threshold temporarily to be more aggressive

**Step 5: Recovery**

After containment:
1. Rotate all canary tokens (recreate canary-stamped rows with new tokens)
2. Audit what data may have been exfiltrated (check the query in Step 3)
3. Notify affected users if their data was accessed
4. Patch the underlying vulnerability
5. Review your query patterns to identify other potential over-fetching issues

---

### 6.7 — The shield's response interception: technical details

Understanding how the shield intercepts responses requires understanding KAIRO's response flow.

When you call `ctx.json(data)` in a handler, KAIRO doesn't immediately serialize and send the response. It queues the response body and metadata. The middleware chain unwinds (each `await next()` call returns), and the shield's response handler runs as the chain unwinds.

This is analogous to how Koa's middleware model works — middleware wraps the entire chain, including the response:

```ts
function createShield(options) {
  return async function shieldMiddleware(ctx, next) {
    // This runs before the handler
    const originalJson = ctx.json.bind(ctx)

    // Intercept ctx.json calls
    ctx.json = function(data, status) {
      // Serialize the response
      const serialized = JSON.stringify(data)

      // Scan for PII
      const findings = scanForPii(serialized, options.patterns)

      if (findings.length > 0) {
        for (const finding of findings) {
          emitSecurityEvent(ctx, {
            type:    'taint_neutralized',
            field:   finding.path,
            pattern: finding.pattern,
            redacted: options.redact,
          })
        }

        if (options.redact) {
          const redacted = redactFindings(data, findings)
          return originalJson(redacted, status)
        }
      }

      return originalJson(data, status)
    }

    // Run the rest of the chain (including the handler)
    await next()
  }
}
```

This interception pattern means the shield sees the data before JSON serialization, which gives it access to the structured JavaScript object. Pattern matching happens on the serialized string, but field paths are reported based on the object structure.

The shield is transparent to your handlers. You call `ctx.json(user)` exactly as you always would. The shield invisibly intercepts that call, checks the data, optionally modifies it, and then sends the response.

---

### 6.8 — Security events: integration patterns

KAIRO's security events are structured data. Here are practical integration patterns for common destinations.

**Sending to Datadog**

```ts
import { DogStatsD } from 'hot-shots'

const statsd = new DogStatsD()

app.onSecurityEvent((event) => {
  // Increment event counter with tags
  statsd.increment('kairo.security_events', 1, [
    `event_type:${event.type}`,
    `entropy_bucket:${Math.floor(event.entropy * 10)}`,
    `environment:${process.env.NODE_ENV}`,
  ])

  // For high-severity events, send a Datadog event (appears in event stream)
  if (['canary_triggered', 'ghost_route_hit'].includes(event.type)) {
    statsd.event(
      `KAIRO: ${event.type}`,
      event.detail,
      { alert_type: event.entropy > 0.8 ? 'error' : 'warning' },
      [`source:kairo`, `route:${event.route}`]
    )
  }
})
```

**Sending to Slack for critical events**

```ts
app.onSecurityEvent(async (event) => {
  if (!['canary_triggered', 'ghost_route_hit'].includes(event.type)) return
  if (event.entropy < 0.7) return

  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `🚨 KAIRO Security Alert`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${event.type}*\n\`${event.route}\`\nEntropy: ${event.entropy.toFixed(2)}\nIP: ${event.ip}`,
          },
        },
      ],
    }),
  })
})
```

**Storing to a database for later analysis**

```ts
app.onSecurityEvent(async (event) => {
  // Fire and forget — don't await in the request path
  void db.securityEvent.create({
    data: {
      type:      event.type,
      ip:        event.ip,
      entropy:   event.entropy,
      route:     event.route,
      detail:    event.detail,
      payload:   event as any,
      createdAt: new Date(event.timestamp),
    },
  }).catch((err) => console.error('Failed to store security event:', err))
})
```

**Building a live dashboard with Server-Sent Events**

```ts
// In-process event bus
const eventBus = new EventEmitter()

app.onSecurityEvent((event) => {
  eventBus.emit('security', event)
})

// Dashboard endpoint
app.get('/admin/security-stream', lattice.require({ level: 'high' }), (ctx) => {
  ctx.setHeader('Content-Type', 'text/event-stream')
  ctx.setHeader('Cache-Control', 'no-cache')
  ctx.setHeader('Connection', 'keep-alive')

  const listener = (event) => {
    ctx.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  eventBus.on('security', listener)

  // Clean up when client disconnects
  ctx.req.on('close', () => {
    eventBus.off('security', listener)
  })
})
```

---

### 6.9 — Performance tuning guide

When running KAIRO in production, these are the configuration knobs that affect performance most significantly.

**IP tracker size**

The default `maxTrackedIps: 50_000` is appropriate for APIs serving up to tens of millions of requests per day. At very high scale (billions of requests per day), you may want to increase this or switch to a Redis-backed tracker.

Each tracked IP entry uses approximately 200 bytes. At 50,000 entries, that's 10 MB. At 500,000 entries, 100 MB. Configure based on your memory budget and the diversity of your client IP space.

**IP tracker window**

A shorter window (5 minutes instead of 15) reduces memory pressure because entries expire faster, but also means behavioral context accumulates less. A scanner that probes slowly — one request per 10 minutes — won't accumulate meaningful context in a 5-minute window.

A longer window (1 hour) catches slow scanners but uses more memory.

**Shield body size limit**

For APIs that return large JSON arrays (search results, data exports), the shield's body scanning is the biggest performance cost. Set `maxBodySize` appropriately:

```ts
createShield({
  pii:         true,
  maxBodySize: 50 * 1024,  // 50 KB: scans most API responses, skips large exports
})
```

Complement this with explicit field selection in your database queries — if you never select PII fields, you never need the shield to catch them.

**Membrane weight tuning**

For APIs where the majority of clients are mobile apps (with non-browser User-Agents), lower the header weight and increase the IP behavior weight:

```ts
createMembrane({
  weights: {
    header:     0.15,  // mobile apps don't look like browsers
    ipBehavior: 0.50,  // behavioral signals are more reliable
    payload:    0.20,
    timing:     0.15,
  },
})
```

This reduces false positives from legitimate mobile clients while maintaining sensitivity to behavioral anomalies.

---

<br>
---

<br>

# CHAPTER SEVEN
## Patterns in the Wild
### *Real-world scenarios, industry-specific configurations, and lessons from production deployments*

---

### 7.1 — KAIRO for fintech APIs

Financial APIs have the highest security requirements of any category outside of national defense. They handle money movement, account data, and identity information for millions of users. A breach isn't embarrassing — it's catastrophic, regulatory, and often criminal.

Here's how a production-grade fintech API configuration looks:

```ts
const app = createApp({ trustProxy: true })

// Membrane with tighter IP behavior tracking
app.use(createMembrane({
  weights: {
    header:     0.25,
    ipBehavior: 0.45,  // behavioral signals weighted higher for fintech
    payload:    0.20,
    timing:     0.10,
  },
  ipTracker: {
    windowMs:       30 * 60 * 1000,  // 30-minute window, not 15
    maxTrackedIps:  200_000,
  },
  ghostRouteEntropyBoost:     0.50,
  ghostRouteHighAlertBoost:   0.75,
}))

app.use(createSentinel())

// Lower hardening threshold for financial APIs
app.use(createHardening({ threshold: 0.65 }))

// Shield with full redaction in production
app.use(createShield({
  pii:    true,
  redact: process.env.NODE_ENV === 'production',
  patterns: {
    email:      true,
    creditCard: true,
    ssn:        true,
    awsKey:     true,
    jwt:        true,
    privateIp:  true,
    custom: [
      { name: 'routing_number', pattern: /\b0[0-9]{8}\b/, message: 'Bank routing number in response' },
      { name: 'account_number', pattern: /\bACCT-[0-9]{12}\b/, message: 'Account number in response' },
    ],
  },
}))

// Lattice with JWT and MFA tier enforcement
const lattice = createLattice({
  resolve: async (ctx) => {
    const token = ctx.headers['authorization']?.replace('Bearer ', '')
    if (!token) return { level: 'none', roles: [], subject: undefined }

    const claims = await verifyFinancialJwt(token)

    // MFA-verified users get 'high' trust — required for transfers
    const level = claims.mfaVerified ? 'high' : claims.emailVerified ? 'medium' : 'low'

    return { level, roles: claims.roles, subject: claims.sub }
  },
})
app.use(lattice)

// Financial-specific ghost routes
app.ghost('/api/admin/override', { alertLevel: 'high' })
app.ghost('/api/internal/bypass', { alertLevel: 'high' })
app.ghost('/api/v0/transfer', { alertLevel: 'high' })  // old version of transfer endpoint
```

**Route configuration for financial operations:**

```ts
// Low-value read operations: medium trust sufficient
app.get('/accounts/:id/balance',
  lattice.require({ level: 'medium' }),
  async (ctx) => {
    // ...
  }
)

// Money movement: high trust (MFA) required
app.post('/transfers',
  lattice.require({ level: 'high' }),
  validate({
    body: {
      fromAccountId: { type: 'string', required: true },
      toAccountId:   { type: 'string', required: true },
      amount:        { type: 'number', required: true, positive: true, integer: true },
      currency:      { type: 'string', required: true, enum: ['USD', 'EUR', 'GBP'] },
      memo:          { type: 'string', max: 140 },
    },
  }),
  async (ctx) => {
    // Both entropy AND trust checks have passed
    // This request is from a user who has MFA-verified and is not exhibiting suspicious behavior
    const { fromAccountId, toAccountId, amount, currency } = ctx.body as TransferRequest

    // Double-check authorization: verify the sender owns the source account
    const account = await db.withContext(ctx).account.findUnique({
      where: { id: fromAccountId },
    })

    if (!account || account.ownerId !== ctx.kairo.lattice.claims!.subject) {
      ctx.status(403).json({ error: 'Forbidden' })
      return
    }

    // Idempotency key to prevent duplicate transfers
    const idempotencyKey = ctx.headers['x-idempotency-key']
    if (!idempotencyKey) {
      ctx.status(400).json({ error: 'x-idempotency-key header required' })
      return
    }

    const transfer = await transferService.execute({ fromAccountId, toAccountId, amount, currency, idempotencyKey })
    ctx.json({ transferId: transfer.id, status: transfer.status }, 201)
  }
)
```

**The fintech security event handler:**

```ts
app.onSecurityEvent(async (event) => {
  // All events go to compliance log
  await complianceLog.append(event)

  // High-severity events trigger immediate response
  if (event.type === 'canary_triggered') {
    await complianceOfficer.alert('Potential data breach detected', event)
    await sessionService.revokeAll(event.detail.currentContext.subject)
  }

  if (event.type === 'lattice_denied' && event.detail.route.includes('/transfers')) {
    // Unauthorized transfer attempt — flag account for review
    await fraudReview.flag(event.detail.resolved.subject, 'unauthorized_transfer_attempt')
  }

  if (event.type === 'ghost_route_hit') {
    // Any ghost route hit from a session that has completed transfers: high priority
    const subject = ctx.kairo?.lattice?.claims?.subject
    if (subject) {
      const hasTransactions = await db.transfer.count({ where: { fromAccountId: subject } })
      if (hasTransactions > 0) {
        await fraudReview.flag(subject, 'authenticated_ghost_probe')
      }
    }
  }
})
```

---

### 7.2 — KAIRO for healthcare APIs (HIPAA considerations)

Healthcare APIs have different security priorities than fintech. The primary concern is PHI (Protected Health Information) — any data that can identify a patient in connection with a medical condition, treatment, or payment.

KAIRO's shield can be configured with healthcare-specific PII patterns:

```ts
app.use(createShield({
  pii: true,
  patterns: {
    email:      true,
    ssn:        true,
    creditCard: false,  // less relevant for healthcare
    custom: [
      {
        name:    'mrn',
        pattern: /\bMRN[-:]?\s*\d{6,12}\b/i,
        message: 'Medical Record Number in response',
      },
      {
        name:    'npi',
        pattern: /\bNPI[-:]?\s*\d{10}\b/i,
        message: 'National Provider Identifier in response',
      },
      {
        name:    'icd10',
        pattern: /\b[A-Z]\d{2}(\.\d{1,4})?\b/,
        message: 'Potential ICD-10 diagnosis code in response',
      },
      {
        name:    'dob_format',
        pattern: /\b(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/(19|20)\d{2}\b/,
        message: 'Date of birth format detected in response',
      },
    ],
  },
}))
```

**Audit logging for HIPAA**

HIPAA requires maintaining access logs for PHI. KAIRO's security event system provides the foundation:

```ts
app.onSecurityEvent(async (event) => {
  // Every event is an audit log entry
  await auditLog.write({
    timestamp:  new Date(event.timestamp),
    eventType:  event.type,
    userId:     ctx.kairo.lattice.claims?.subject,
    ip:         event.ip,
    resource:   event.route,
    entropy:    event.entropy,
    outcome:    event.type === 'lattice_denied' ? 'DENIED' : 'DETECTED',
  })
})

// Also log every successful request to PHI endpoints
app.use(async (ctx, next) => {
  await next()

  if (ctx.url.startsWith('/patients') || ctx.url.startsWith('/records')) {
    await auditLog.write({
      timestamp: new Date(),
      eventType: 'phi_access',
      userId:    ctx.kairo.lattice.claims?.subject,
      ip:        ctx.ip,
      resource:  ctx.url,
      outcome:   'ACCESSED',
      statusCode: ctx.status,
    })
  }
})
```

---

### 7.3 — KAIRO for multi-tenant SaaS APIs

Multi-tenant SaaS APIs have a specific security concern that single-tenant APIs don't: tenant isolation. A bug that allows Tenant A to read Tenant B's data is a critical breach even if no malicious actor is involved.

KAIRO's trust lattice can encode tenant identity:

```ts
const lattice = createLattice({
  resolve: async (ctx) => {
    const token = ctx.headers['authorization']?.replace('Bearer ', '')
    if (!token) return { level: 'none', roles: [], subject: undefined }

    const claims = await verifyJwt(token)

    return {
      level:    claims.role === 'admin' ? 'high' : 'low',
      roles:    [claims.role],
      subject:  claims.sub,
      tenantId: claims.tenantId,  // custom claim
    }
  },
})
```

Then in handlers:

```ts
app.get('/data/:id',
  lattice.require({ level: 'low' }),
  async (ctx) => {
    const claims = ctx.kairo.lattice.claims!
    const tenantId = (claims as any).tenantId

    // Always scope queries to the tenant — no exceptions
    const record = await db.withContext(ctx).record.findUnique({
      where: {
        id:       ctx.params.id,
        tenantId,  // tenant scope is mandatory
      },
    })

    if (!record) {
      // Return 404, not 403 — don't reveal that the record exists in another tenant
      ctx.status(404).json({ error: 'Record not found' })
      return
    }

    ctx.json(record)
  }
)
```

**Canary records for tenant isolation monitoring**

```ts
const db = createPrismaAdapter(prisma, {
  entropyGate:   0.80,
  canaryModels:  ['Record', 'Document', 'Invoice'],
  scanResults:   true,
})

// The canary system will fire if a record from Tenant A appears in a response
// to a request from Tenant B — regardless of how it got there
app.onSecurityEvent(async (event) => {
  if (event.type !== 'canary_triggered') return

  const requestTenant = (event.detail.currentContext as any).tenantId
  const sourceTenant  = (event.detail.sourceContext as any).tenantId

  if (requestTenant && sourceTenant && requestTenant !== sourceTenant) {
    // Cross-tenant data access detected
    await alert.critical('TENANT ISOLATION BREACH', {
      requestTenant,
      sourceTenant,
      route: event.route,
    })
  }
})
```

---

### 7.4 — The three failure modes of security, and how KAIRO addresses each

Security systems fail in three characteristic ways. Understanding these failure modes explains why KAIRO's architecture is designed the way it is.

**Failure mode 1: False negatives (missing real attacks)**

A false negative is when a security system fails to detect a real attack. This is the most dangerous failure mode. The attacker gets through, the security system reports nothing, and you have a breach you don't know about.

KAIRO addresses false negatives through multiple overlapping signals:
- The membrane catches attacks at the header and behavioral level
- The hardening layer catches attacks based on accumulated entropy
- Ghost routes catch probing behavior that other signals might miss
- The sentinel catches anomalies that the membrane doesn't score
- The canary system catches exfiltration that all other defenses missed

No single layer needs to catch everything. The layers overlap. An attacker who evades the membrane by cleaning their User-Agent might still trip the ghost routes. An attacker who avoids ghost routes might still accumulate enough entropy through path diversity. An attacker who evades all of this might still trigger a canary.

**Failure mode 2: False positives (blocking legitimate traffic)**

A false positive is when a security system blocks a legitimate user. This is also dangerous, but in a different way — it breaks the product for real users and creates pressure to disable or weaken the security system.

KAIRO addresses false positives through tunable thresholds and weighted signals:
- The hardening threshold is configurable. Default is `0.80`, which is deliberately conservative to minimize false positives.
- The membrane's signal weights are configurable. An API that legitimately receives non-browser clients can lower the header weight.
- Ghost routes are checked after real routes. Real users hitting real routes never see ghost route behavior.
- The validation middleware increments entropy by only `0.1` per failure — one typo doesn't cause a block.

**Failure mode 3: Security theater (visible but ineffective controls)**

Security theater is when controls look impressive but provide minimal actual protection. A WAF that blocks `' OR '1'='1` in query strings but misses `' OR 1=1--`. A rate limiter that blocks 1000 requests per minute from one IP but allows 100 per minute from a thousand IPs.

KAIRO's defenses are chosen for effectiveness over appearance:
- Ghost routes are invisible to real users — they don't add friction or visual security signals
- Entropy scores are not shown to the user — attackers cannot see what threshold they need to beat
- Canary tokens are indistinguishable from real data — attackers cannot sanitize them out
- The hardening response is minimally informative — attackers cannot learn from the block response

---

### 7.5 — Migration case study: Express to KAIRO in a production system

A fictional but realistic migration case study. Company: a mid-size SaaS product with 50 API routes, 3 engineers, and an Express + Passport + Joi + helmet stack.

**Starting point**

The existing stack:
- Express 4.18
- Passport.js with JWT strategy
- Joi for body validation (on ~60% of routes)
- Helmet 7 for security headers
- express-rate-limit on the `/auth/login` endpoint
- Winston for logging (no structured security events)

**Pain points that motivated the migration:**
- A security audit found that query parameters were never validated (Joi was only used for bodies)
- A penetration tester found that the rate limiter could be bypassed with IP spoofing
- No visibility into what attack traffic looked like — logs showed HTTP requests, nothing more
- Three routes had authentication bugs discovered in code review (developer forgot to add Passport middleware)

**Migration phase 1: install KAIRO alongside Express**

Week 1: KAIRO is installed. The membrane is mounted as the first Express middleware. Ghost routes are registered. The security event handler sends events to a new security log.

```ts
// Temporarily, KAIRO middleware runs inside Express
import { createApp, createMembrane } from '@thekairojs/kairo'

const kairo = createApp()
kairo.use(createMembrane())
kairo.use(createSentinel())

expressApp.use(kairo.buildRequestHandler())
// All existing Express routes still work
```

This provides immediate visibility without breaking anything. The team runs this for two weeks, monitoring the security events to understand their traffic.

Findings from the two-week observation:
- Two IPs are consistently hitting ghost routes (`/.env` and `/.git/config`) — scanners that have been probing undetected
- Validation failures from the existing Joi middleware are generating `entropy_spike` events from one IP — a fuzzer
- One legitimate API client (a partner's integration) has a non-browser User-Agent that would score `0.35` — below the default threshold, no action needed

**Migration phase 2: migrate routes one by one**

Starting with new features (all built in KAIRO), then migrating existing routes from highest traffic to lowest.

Each migrated route gets:
- `lattice.require()` replacing Passport middleware
- `validate()` replacing Joi
- Removal of manual authentication checks inside handlers

**Migration phase 3: full cutover**

After 6 weeks, all routes are in KAIRO. Express is removed. The hardening layer is added in `log` mode for two weeks to confirm no false positives, then switched to `block` mode.

**Results after 3 months:**
- Zero authentication bugs in new code (the lattice makes auth visible at the route level)
- 100% of routes now have query parameter validation (the dev logger warns about untainted params)
- The two scanner IPs are now consistently blocked after their first ghost route hit
- Security event volume gives the team a clear picture of their attack surface for the first time
- The penetration test from the quarter before found no rate-limiting bypasses (entropy model is not bypassable by IP spoofing)

---

### 7.6 — Frequently asked questions

**Q: Does KAIRO work with TypeScript?**

Yes. All KAIRO packages are written in TypeScript and ship with full type definitions. The validation middleware accepts typed schemas and the context object is fully typed. Generic types allow the Prisma adapter to preserve your model types through the Proxy layer.

**Q: Can I use KAIRO with serverless (AWS Lambda, Vercel Edge)?**

The core KAIRO framework and its middleware work in any Node.js environment. For serverless, use `app.buildRequestHandler()` to get a standard `(req, res) => void` handler compatible with AWS Lambda's HTTP event format (via a thin adapter like `serverless-http`).

The IP tracker's in-process state does not persist across Lambda invocations (cold starts create fresh state). For production serverless use, configure the Redis-backed IP tracker to share state across invocations.

**Q: What happens when the IP tracker fills up (maxTrackedIps reached)?**

When the tracker reaches `maxTrackedIps`, it evicts the oldest entries — those with the earliest last-seen timestamp. This is a time-ordered LRU eviction. In practice, at the default of 50,000 entries, you would need to be serving distinct traffic from more than 50,000 unique IPs within a 15-minute window for this to matter.

**Q: Can I add custom entropy signals?**

Yes. The membrane accepts a `customSignals` array:

```ts
createMembrane({
  customSignals: [
    {
      name:   'geolocation_anomaly',
      weight: 0.10,
      compute: async (ctx) => {
        const country = await geoip.lookup(ctx.ip)
        const userCountry = ctx.kairo.lattice.claims?.country
        if (userCountry && country !== userCountry) return 0.8
        return 0.0
      },
    },
  ],
})
```

Custom signals are incorporated into the composite entropy score with their specified weight. Adding a custom signal with `weight: 0.10` means the other weights are proportionally reduced to sum to `1.0`.

**Q: Is KAIRO production-ready?**

Yes. KAIRO v1.0 has a comprehensive test suite, is published to npm, and has been designed for production use. The code is open source, MIT licensed, and actively maintained.

**Q: Does KAIRO replace a WAF?**

No. KAIRO and a WAF serve different purposes. A WAF operates at the network layer and can be configured without access to application code. KAIRO operates at the application layer and has access to the full request context, business logic, and authentication state. They are complementary. For maximum security, use both: a WAF for network-layer filtering and KAIRO for application-layer behavioral analysis.

**Q: How do I report a security vulnerability in KAIRO itself?**

Security vulnerabilities in KAIRO should be reported via GitHub's private vulnerability disclosure (Security tab → Report a vulnerability). Do not open public issues for security vulnerabilities. We respond within 48 hours and publish a fix within 7 days for confirmed vulnerabilities.

**Q: Does the entropy score apply to WebSocket connections?**

In v1.0, the entropy score applies to the HTTP upgrade request that establishes a WebSocket connection. Once the connection is established, subsequent WebSocket messages are not scored. In v1.1, the Intent Engine will extend scoring to WebSocket message patterns.

**Q: Can the hardening layer be bypassed with a VPN or Tor?**

It's harder but not impossible. An attacker using fresh VPN IPs will avoid the IP behavior signal, since each new IP starts with a clean slate. However, the header signal, payload signal, and timing signal are all IP-independent. A scanner with clean headers, normal timing, and normal payloads will have low entropy regardless of IP churn.

Ghost routes remain effective because the attacker using a new IP still hits the ghost route on the first request from that IP — and that IP's score immediately elevates. An attacker cycling through IPs rapidly will be slowed, because each IP is a fresh start that requires re-probing from the beginning.

---

### 7.7 — Building on top of KAIRO: creating custom security layers

KAIRO's middleware architecture is open. You can write middleware that reads from and writes to `ctx.kairo` just like the built-in layers do.

**Example: geolocation-based trust**

```ts
import type { KairoMiddleware } from '@thekairojs/kairo'

export function createGeoFilter(allowedCountries: string[]): KairoMiddleware {
  return async (ctx, next) => {
    const country = await geoip.lookup(ctx.ip)

    if (country && !allowedCountries.includes(country)) {
      // Boost entropy for requests from disallowed geographies
      ctx.kairo.entropy = Math.min(1.0, ctx.kairo.entropy + 0.30)

      ctx.kairo.events.push({
        type:      'geo_restriction',
        ip:        ctx.ip,
        entropy:   ctx.kairo.entropy,
        route:     ctx.url,
        timestamp: Date.now(),
        detail:    `Request from disallowed country: ${country}`,
      })
    }

    await next()
  }
}

// Usage:
app.use(createGeoFilter(['US', 'CA', 'GB']))
app.use(createHardening({ threshold: 0.80 }))  // will catch geo-boosted requests
```

**Example: device fingerprint trust**

```ts
export function createDeviceFingerprint(): KairoMiddleware {
  return async (ctx, next) => {
    const deviceId = ctx.headers['x-device-id']
    const userId   = ctx.kairo.lattice.claims?.subject

    if (userId && deviceId) {
      const knownDevice = await deviceRegistry.lookup(userId, deviceId)

      if (!knownDevice) {
        // Unrecognized device — boost entropy
        ctx.kairo.entropy = Math.min(1.0, ctx.kairo.entropy + 0.20)
        ctx.kairo.events.push({
          type:    'unknown_device',
          ip:      ctx.ip,
          entropy: ctx.kairo.entropy,
          route:   ctx.url,
          timestamp: Date.now(),
          detail:  `Unrecognized device ID for user ${userId}`,
        })
      }
    }

    await next()
  }
}
```

**Example: time-based access control**

```ts
export function createTimeGate(options: { allowedHours: [number, number] }): KairoMiddleware {
  return async (ctx, next) => {
    const hour = new Date().getUTCHours()
    const [start, end] = options.allowedHours

    const inWindow = start <= end
      ? (hour >= start && hour < end)
      : (hour >= start || hour < end)

    if (!inWindow) {
      ctx.kairo.entropy = Math.min(1.0, ctx.kairo.entropy + 0.40)
    }

    await next()
  }
}

// Protect admin routes: only accessible during business hours UTC
app.use('/admin/*', createTimeGate({ allowedHours: [8, 18] }))
```

Custom middleware can be combined with the standard pipeline. Because everything flows through `ctx.kairo.entropy`, any custom entropy boost is automatically picked up by the hardening layer. You don't need to implement blocking logic in your custom middleware — just adjust entropy and let the pipeline handle the rest.

---

<br>
---

<br>

---

## APPENDIX

### A.1 — The Full Security Context Reference

Every request in a KAIRO application has a `ctx.kairo` object. Here is its complete structure.

```ts
interface KairoContext {
  // Composite entropy score — 0.0 (clean) to 1.0 (hostile)
  // Set by the membrane middleware
  entropy: number

  // Sub-scores that compose the entropy
  headerScore:   number   // 0.0–1.0, weight 30%
  ipScore:       number   // 0.0–1.0, weight 35%
  payloadScore:  number   // 0.0–1.0, weight 20%
  timingScore:   number   // 0.0–1.0, weight 15%

  // Input taint tracking
  // Set<string> of field paths not yet validated
  // Cleared by validate() as each field passes
  taintedPaths: Set<string>

  // Security events emitted during this request
  events: SecurityEvent[]

  // Whether the hardening layer fired on this request
  hardeningActive: boolean

  // Whether hardening would have fired (in log mode)
  hardeningWouldBlock: boolean

  // Trust lattice state
  lattice: {
    resolved: boolean         // true after the resolve() function ran
    claims: {
      level:   'none' | 'low' | 'medium' | 'high'
      roles:   string[]
      subject: string | undefined   // e.g. user ID from JWT sub claim
    } | null
  }
}
```

**Accessing ctx.kairo in handlers:**

```ts
app.get('/debug', async (ctx) => {
  // Only enable this in development!
  ctx.json({
    entropy:    ctx.kairo.entropy,
    trust:      ctx.kairo.lattice.claims?.level ?? 'none',
    tainted:    [...ctx.kairo.taintedPaths],
    events:     ctx.kairo.events.map((e) => e.type),
  })
})
```

---

### A.2 — Security Event Type Reference

Every security event emitted by KAIRO has this base shape:

```ts
interface SecurityEvent {
  type:      string        // event type identifier
  ip:        string        // client IP address
  entropy:   number        // entropy at the time the event fired
  route:     string        // matched route pattern
  timestamp: number        // Unix ms timestamp
  detail:    string        // human-readable description
  [key: string]: unknown  // type-specific additional fields
}
```

**Complete event type list:**

| Type | Package | When it fires |
|------|---------|--------------|
| `ghost_route_hit` | core | Request matched a registered ghost route |
| `entropy_spike` | membrane | entropy > spike threshold (default 0.70) |
| `taint_neutralized` | shield, dx | PII found in response, or tainted field validated |
| `lattice_denied` | lattice | `lattice.require()` check failed |
| `canary_triggered` | sentinel | Registered canary token found in response or scan result |
| `hmac_invalid` | membrane | Request carried an `X-Kairo-Sig` that failed verification |
| `intent_drift` | intent (v1.1) | Request deviated from route behavioral baseline |
| `shadow_executed` | hardening (v1.2) | Request was routed to shadow execution environment |

---

### A.3 — Recommended Middleware Order

The order matters. Here is the canonical production order with explanations for each position.

```ts
// 1. Membrane FIRST — scores the request before anything else
//    All downstream layers read ctx.kairo.entropy
app.use(createMembrane())

// 2. Sentinel before hardening — builds anomaly baselines
//    Must run after membrane (reads entropy for spike detection)
app.use(createSentinel())

// 3. Hardening after sentinel — blocks high-entropy requests
//    Blocks before lattice/validation/handlers run
//    Hostile traffic never reaches application logic
app.use(createHardening({ threshold: 0.80 }))

// 4. Shield wraps the handlers — scans responses on the way out
//    Placed here so it wraps all routes defined below it
app.use(createShield({ pii: true }))

// 5. Lattice after hardening — resolves auth for requests that pass
//    No point resolving auth for a request you're about to block
app.use(lattice)

// 6. devLogger last — sees the fully-populated ctx state
//    In production this is a no-op
app.use(devLogger())

// 7. Ghost routes after middleware — routes, not middleware
app.ghost('/.env')
app.ghost('/wp-login.php')

// 8. Application routes
app.use('/api', apiRouter)
```

---

### A.4 — Configuration Reference

**createMembrane()**

```ts
createMembrane({
  // Signal weights — must sum to 1.0
  weights: {
    header:     0.30,
    ipBehavior: 0.35,
    payload:    0.20,
    timing:     0.15,
  },

  // IP tracker configuration
  ipTracker: {
    windowMs:      15 * 60 * 1000,   // rolling window (default: 15 min)
    maxTrackedIps: 50_000,            // evict oldest when exceeded
  },

  // Ghost route entropy boosts
  ghostRouteEntropyBoost:          0.40,
  ghostRouteHighAlertBoost:        0.60,

  // HMAC signing (optional, for service-to-service auth)
  hmac: {
    secret:   process.env.INTERNAL_HMAC_SECRET,
    required: true,
    maxAge:   30_000,  // ms before a signature is considered expired
  },
})
```

**createHardening()**

```ts
createHardening({
  threshold:       0.80,    // block requests at or above this score
  mode:           'block',  // 'block' | 'log' — log mode never actually blocks
  response: {
    status:  429,
    message: 'Too many requests',
  },
  // v1.2 options (upcoming):
  shadowThreshold:  0.92,
  stealthThreshold: 0.65,
})
```

**createShield()**

```ts
createShield({
  pii:         true,
  redact:      false,       // true = replace PII with [REDACTED]
  maxBodySize: 500 * 1024,  // skip scanning bodies > this (bytes)
  exclude:     ['/login', '/auth/token'],
  patterns: {
    email:      true,
    creditCard: true,
    ssn:        true,
    awsKey:     true,
    jwt:        true,
    privateIp:  true,
    custom:     [],
  },
})
```

**createLattice()**

```ts
createLattice({
  resolve: async (ctx) => ({
    level:   'none' | 'low' | 'medium' | 'high',
    roles:   string[],
    subject: string | undefined,
  }),
})
```

**createPrismaAdapter()**

```ts
createPrismaAdapter(prismaClient, {
  entropyGate:   0.80,              // throw KairoEntropyError above this
  canaryModels:  ['User', 'Order'], // inject canaries on writes to these models
  scanResults:   true,              // scan read results for canary tokens
})
```

**createDrizzleAdapter()**

```ts
createDrizzleAdapter(drizzleDb, {
  entropyGate: 0.80,
})
```

**createPgAdapter()**

```ts
createPgAdapter(pgPool, {
  entropyGate:   0.80,
  scanResults:   true,
  canaryTable:   'users',
})
```

**createUwsAdapter()**

```ts
createUwsAdapter(kairoApp, {
  ssl: undefined,  // or { key_file_name: '...', cert_file_name: '...' }
})
```

---

### A.5 — All Packages Install Reference

```bash
# Core
npm install @thekairojs/kairo

# Security layers
npm install @thekairojs/kairo-membrane    # entropy scoring, taint tracking
npm install @thekairojs/kairo-lattice     # trust lattice, auth
npm install @thekairojs/kairo-hardening   # entropy-based request blocking
npm install @thekairojs/kairo-shield      # outbound PII scanning
npm install @thekairojs/kairo-sentinel    # anomaly detection, canary records

# Developer experience
npm install @thekairojs/kairo-dx          # validate(), devLogger()

# Database adapters
npm install @thekairojs/kairo-adapter-prisma   # Prisma ORM
npm install @thekairojs/kairo-adapter-drizzle  # Drizzle ORM
npm install @thekairojs/kairo-adapter-pg       # node-postgres (pg)

# Server adapters
npm install @thekairojs/kairo-adapter-uws     # uWebSockets.js

# CLI tools
npm install -g @thekairojs/kairo-cli
# npx @thekairojs/kairo-cli new my-app
# npx @thekairojs/kairo-cli routes
# npx @thekairojs/kairo-cli audit
```

---

### A.6 — Entropy Score Interpretation Guide

| Score range | Interpretation | Recommended action |
|-------------|---------------|-------------------|
| 0.00–0.25 | Clean — normal browser or API client | Let through |
| 0.25–0.50 | Slightly elevated — watch but not concerning | Let through, log |
| 0.50–0.70 | Elevated — unusual patterns detected | Log, emit event, watch |
| 0.70–0.80 | High — likely automated tool or scanner | Spike event emitted |
| 0.80–0.95 | Very high — almost certainly hostile | Block (default threshold) |
| 0.95–1.00 | Extreme — definitive attack signature | Block + shadow execute (v1.2) |

The thresholds in this table reflect defaults. Your application's profile may differ. An API called only by your own mobile app can be hardened to `0.50` because you control all legitimate clients. A public API with diverse clients should use `0.80` or higher.

---

### A.7 — Ghost Route Default List

KAIRO registers these ghost routes by default. You can add your own with `app.ghost()`.

```
/.env                   /.env.local             /.env.production
/.git/config            /.git/HEAD              /.git/COMMIT_EDITMSG
/.gitignore             /.htaccess              /.htpasswd
/wp-admin               /wp-login.php           /wp-config.php
/wp-content/            /xmlrpc.php
/.aws/credentials       /.aws/config
/.ssh/id_rsa            /.ssh/authorized_keys   /.ssh/config
/phpinfo.php            /info.php               /test.php
/backup.sql             /db.sql                 /database.sql
/dump.sql               /data.sql
/config.php             /configuration.php      /settings.php
/admin                  /administrator          /panel
/dashboard              /console
/.DS_Store              /thumbs.db
/actuator/env           /actuator/mappings      /actuator/beans
/debug                  /trace
/swagger.json           /openapi.json           /api-docs
```

---

### A.8 — Common Error Codes

| HTTP Status | When KAIRO returns it |
|------------|----------------------|
| `400 Bad Request` | Malformed JSON body that can't be parsed |
| `401 Unauthorized` | HMAC signature verification failed |
| `403 Forbidden` | `lattice.require()` check failed |
| `415 Unsupported Media Type` | Content-Type mismatch with declared body format |
| `422 Unprocessable Entity` | `validate()` middleware found schema violations |
| `429 Too Many Requests` | Hardening layer blocked high-entropy request |

---

### A.9 — Glossary

**Canary record**: A database row containing a `__k_c__` field with a registered hex token. If the token appears in an API response, a `canary_triggered` security event fires.

**Entropy score**: A composite number from `0.0` to `1.0` representing how suspicious an HTTP request looks. Computed from header anomalies, IP behavior, payload characteristics, and request timing.

**Ghost route**: A registered URL path that returns `200 OK` with an empty body. Hitting a ghost route elevates the client IP's entropy score. Real users never hit ghost routes.

**Hardening**: The active security response layer. Blocks requests whose entropy exceeds a configured threshold. Can operate in `block` or `log` mode.

**IP tracker**: An in-process (or Redis-backed) data structure that records behavioral metrics for each IP address within a rolling time window.

**Intent drift**: A deviation from the established behavioral baseline for a route. Detected by the Intent Engine (v1.1).

**Lattice claim**: The resolved trust level and associated metadata for a request. Set by the lattice's `resolve` function.

**Membrane**: The first layer. Processes every incoming request, computes entropy, initializes taint tracking.

**PII (Personally Identifiable Information)**: Data that can identify an individual — email addresses, SSNs, credit card numbers, phone numbers. The shield scans outbound responses for these patterns.

**Sentinel**: The watchdog layer. Manages canary records, coordinates security event emission, performs anomaly detection.

**Shadow execution**: (v1.2) Routing extremely high-entropy requests to an isolated read-only environment that returns realistic but fake data.

**Shield**: The outbound scanning layer. Intercepts JSON responses and scans for PII patterns before they reach the client.

**Stealth deflection**: (v1.2) Returning plausible but fake data to suspicious requests, causing attackers to waste time on non-real information.

**Taint**: The state of an input field that has not yet been validated. All external inputs are tainted by default. Validated inputs are cleared from `ctx.kairo.taintedPaths`.

**Trust level**: One of `none`, `low`, `medium`, `high`. Assigned by the lattice's resolve function. Used by `lattice.require()` to enforce authorization.

**uWS**: uWebSockets.js, a high-performance C++ HTTP server with Node.js bindings. The KAIRO uWS adapter allows using uWS as the server backend while keeping the full KAIRO security pipeline.

---

### A.10 — Recommended Reading

**On web security fundamentals:**
- OWASP Top Ten — the canonical list of critical web application security risks
- OWASP API Security Top Ten — specific to APIs (more relevant to KAIRO users)
- "The Web Application Hacker's Handbook" — Stuttard & Pinto

**On entropy and information security:**
- "The Art of Intrusion" — Kevin Mitnick (non-technical but illuminating on attacker methodology)
- NIST SP 800-63B — Digital Identity Guidelines (the standard behind trust levels)

**On AI-generated code security:**
- "Security implications of GitHub Copilot" — NYU Tandon study (2022)
- "Do Users Write More Insecure Code with AI Assistants?" — Sandoval et al. (2022)

**On framework security design:**
- "Secure by Default: A Framework Security Design Pattern" — various OWASP publications
- Ruby on Rails security guide — the best example of a framework that made several security choices by default (CSRF protection, SQL parameterization, etc.)

---

*The KAIRO Handbook — v1.0*

*github.com/thekairojs/kairo.js | npm: @thekairojs/kairo*

*"Act at the right moment. Secure from the first line."*
---

<br>

---

## A NOTE ON THE NAME

KAIRO comes from the ancient Greek word *kairos*.

In Greek, there are two words for time. *Chronos* is clock time — the seconds ticking by, the hours passing, the linear march from past to future. It is measurable. It is indifferent. It does not care if you are ready.

*Kairos* is different. Kairos is the right time. The decisive moment. The instant when conditions align and the correct action becomes possible — and then passes. In archery, kairos was the moment when the arrow's release would be perfect. In rhetoric, it was the moment in an argument when the audience was ready to hear the truth. In medicine, it was the turning point in a patient's illness when the right intervention would matter.

The ancient Greeks understood that being present in the right moment — having the capacity to act correctly when the moment arrives — was a form of mastery. Not just being fast. Not just being strong. Being ready, and recognizing the instant.

Security works the same way.

A security system that responds after the breach has happened — that discovers the data exfiltration three months later in an audit — was not present at kairos. It was present at chronos, dutifully logging requests, but absent from the decisive moment.

A security system that scores every request, tracks every IP, monitors every output, and fires the moment a canary token appears — that system is present at kairos. It does not need to be fast. It needs to be correct at the right instant.

KAIRO is named for this idea. Not the fastest framework. Not the lightest framework. The framework that acts at the right moment, every time, without being asked.

That is the goal. It is also the standard we hold ourselves to.

---

## COLOPHON

This handbook was written to be read, not skimmed. If you skimmed it, go back. The parts that seem obvious usually have a sentence underneath them that is not.

If you find an error — technical, factual, or logical — open an issue on GitHub. This is a living document. It will be revised as KAIRO evolves.

If something in here made you think differently about how security should work in a web framework, share it. The ideas travel farther than the code.

---

*KAIRO Handbook v1.0*
*Last revised: 2026*
*github.com/thekairojs/kairo.js*
*npm: @thekairojs/kairo*

---

### The Closing Thought

There is a version of the internet where most APIs are secure by default. Where a developer spinning up their first project inherits security because their framework inherited it. Where an AI agent generating a backend service produces something that doesn't embarrass them when a security researcher looks at it. Where the junior engineer's first pull request isn't a CVE waiting to happen.

That version of the internet is achievable. It requires making a different decision at the framework layer — the decision that Express made in 2010, and that we are now in a position to revisit with fifteen years of context.

KAIRO is that different decision, made into code.

Build something that matters. Build it securely. The framework will hold the line.

---

<br>

---

## QUICK-START COOKBOOK

The fastest path from zero to a secured KAIRO API. Each recipe is self-contained and production-ready.

---

### Recipe 1: Minimal secure API (3 packages)

```bash
npm install @thekairojs/kairo @thekairojs/kairo-membrane @thekairojs/kairo-hardening
```

```ts
import { createApp } from '@thekairojs/kairo'
import { createMembrane } from '@thekairojs/kairo-membrane'
import { createHardening } from '@thekairojs/kairo-hardening'

const app = createApp()
app.use(createMembrane())
app.use(createHardening({ threshold: 0.80 }))

app.get('/hello', (ctx) => ctx.json({ hello: 'world' }))

await app.listen(3000)
```

Every request is scored. High-entropy requests are blocked. No further configuration needed.

---

### Recipe 2: Add authentication

```bash
npm install @thekairojs/kairo-lattice jsonwebtoken
```

```ts
import { createLattice } from '@thekairojs/kairo-lattice'
import jwt from 'jsonwebtoken'

const lattice = createLattice({
  resolve: async (ctx) => {
    const token = ctx.headers['authorization']?.replace('Bearer ', '')
    if (!token) return { level: 'none', roles: [], subject: undefined }
    try {
      const c = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as any
      return { level: c.admin ? 'high' : 'low', roles: [], subject: c.sub }
    } catch {
      return { level: 'none', roles: [], subject: undefined }
    }
  },
})

app.use(lattice)
app.get('/me', lattice.require({ level: 'low' }), (ctx) => ctx.json({ ok: true }))
app.get('/admin', lattice.require({ level: 'high' }), (ctx) => ctx.json({ ok: true }))
```

---

### Recipe 3: Add input validation

```bash
npm install @thekairojs/kairo-dx
```

```ts
import { validate, devLogger } from '@thekairojs/kairo-dx'

app.use(devLogger())  // shows entropy, taint, and events in development

app.post('/users', validate({
  body: {
    name:  { type: 'string', required: true, min: 1, max: 100 },
    email: { type: 'string', required: true, pattern: /^[^@]+@[^@]+$/ },
  },
}), async (ctx) => {
  const { name, email } = ctx.body as { name: string; email: string }
  ctx.json({ name, email }, 201)
})
```

Failed validations return structured field errors and boost entropy by 0.1 per failure.

---

### Recipe 4: Add PII scanning

```bash
npm install @thekairojs/kairo-shield
```

```ts
import { createShield } from '@thekairojs/kairo-shield'

app.use(createShield({ pii: true }))
// Scans every outbound JSON response for emails, SSNs, credit cards, JWTs, AWS keys
```

---

### Recipe 5: Add canary records with Prisma

```bash
npm install @thekairojs/kairo-sentinel @thekairojs/kairo-adapter-prisma
```

```ts
import { createPrismaAdapter } from '@thekairojs/kairo-adapter-prisma'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const db = createPrismaAdapter(prisma, {
  entropyGate:  0.80,
  canaryModels: ['User', 'Order'],
  scanResults:  true,
})

app.get('/users/:id', lattice.require({ level: 'low' }), async (ctx) => {
  const user = await db.withContext(ctx).user.findUnique({
    where:  { id: ctx.params.id },
    select: { id: true, name: true, email: true },
  })
  ctx.json(user)
})
```

---

### Recipe 6: High-performance server with uWS

```bash
npm install @thekairojs/kairo-adapter-uws
# Also install uWebSockets.js from its GitHub release
```

```ts
import { createUwsAdapter } from '@thekairojs/kairo-adapter-uws'

// Replace app.listen() with:
const server = createUwsAdapter(app)
await server.listen(3000)
// ~2x throughput compared to node:http at the same security level
```

---

### Recipe 7: Security event telemetry

```ts
app.onSecurityEvent((event) => {
  // Structured JSON to stdout — pipe to any log aggregator
  console.error(JSON.stringify({
    ts:      new Date(event.timestamp).toISOString(),
    type:    event.type,
    ip:      event.ip,
    entropy: event.entropy,
    route:   event.route,
    detail:  event.detail,
  }))
})
```

All seven recipes compose. Use them together or independently.

---

*End of The KAIRO Handbook.*

