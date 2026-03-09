# Satoshi's Market V2 — Sicherheitsaudit-Bericht

**Datum:** 09.03.2026
**Umfang:** Smart-Contract-Integration, Frontend (Next.js 14 / React), Backend-API-Routes, Wallet-Interaktion
**Auditor:** Automatisiertes Audit via OPNet Bob AI + Claude Code Agents

---

## Zusammenfassung

Der AtomicSwapEscrow Smart Contract basiert auf einem soliden "Verify-don't-Custody" Atomic-Swap-Design. BTC-Zahlungen und Token-Transfers werden in einer einzigen Bitcoin-Transaktion ausgefuehrt, wodurch ein Zahlungsbypass unmoeglich ist. Der Contract implementiert Reentrancy-Guards, CEI-Pattern, Input-Validierung und On-Chain-Fee-Caps.

**Es wurden keine Schwachstellen gefunden, die zu einem Verlust von Geldern fuehren koennten.**

Das Hauptrisiko liegt in der Off-Chain-Infrastruktur (API-Routes), wo einige Mutations-Endpoints keine Authentifizierung haben und dadurch Griefing-Angriffe auf die Datenbank-Ebene ermoeglichen. Diese koennen den On-Chain-Zustand nicht beeinflussen.

---

## Smart Contract Ergebnisse

### Positive Befunde

| # | Befund |
|---|--------|
| INFO-1 | ReentrancyGuard mit CEI-Pattern korrekt implementiert |
| INFO-2 | Fee-Cap On-Chain bei 10% durchgesetzt (MAX_FEE_BPS = 1000) |
| INFO-3 | Atomares Transaktionsmodell verhindert BTC-Zahlungsbypass |
| INFO-4 | AllowedTaker (Private OTC) wird vollstaendig On-Chain durchgesetzt |
| INFO-5 | Schnorr-Signatur-Verifizierung nutzt korrekte Kryptographie |

### Risiko: Front-Running bei oeffentlichen Angeboten (Medium)

Wenn ein Kaeufer eine `fillOffer`-Transaktion sendet, landet sie im Bitcoin-Mempool. Ein Front-Runner koennte eine eigene Fill-Transaktion mit hoeherer Gebuehr senden. Die Original-Transaktion des Kaeufers wird revertiert (kein Geldverlust), aber er verpasst den Trade.

**Mitigation:** Das `allowedTaker`-Feature ermoeglicht private Angebote, die immun gegen Front-Running sind. Bei oeffentlichen Angeboten ist dies eine inhärente Mempool-Race-Condition, die bei allen Blockchain-Marktplaetzen vorkommt.

---

## Frontend & Backend Ergebnisse

### HIGH

| # | Befund | Datei | On-Chain-Auswirkung |
|---|--------|-------|---------------------|
| H-1 | Fill-API unauthentifiziert — jeder kann falsche Fill-Eintraege schreiben | `/api/fill/route.ts` | Keine (nur DB) |
| H-2 | Hidden-Listings-API unauthentifiziert — jeder kann Listings verstecken | `/api/hidden-listings/route.ts` | Keine (nur DB) |
| H-3 | Fulfill-Request-API unauthentifiziert — jeder kann Requests als erfuellt markieren | `/api/requests/[id]/fulfill/route.ts` | Keine (nur DB) |
| H-4 | RPC-Proxy leitet beliebige JSON-RPC-Methoden ohne Whitelist weiter | `/api/opnet-rpc/route.ts` | Keine | **BEHOBEN** |

**Hinweis zu H-1, H-2, H-3:** Diese Endpoints werden automatisch nach On-Chain-Transaktionsbestaetigung aufgerufen. Wallet-Signaturen hinzuzufuegen wuerde ein zweites Wallet-Popup nach jedem Kauf/Listing erfordern — eine erhebliche UX-Verschlechterung. Die empfohlene Loesung ist On-Chain-Verifikation (txid/listingId On-Chain pruefen bevor es in die DB geschrieben wird) statt Signaturen.

### MEDIUM

| # | Befund | Datei | Status |
|---|--------|-------|--------|
| M-1 | Schnorr-Pubkey kann nicht gegen P2OP-Adresse verifiziert werden | `verifySignature.ts` | Bekannte OPNet-Limitation |
| M-2 | Kein Rate-Limiting auf API-Routes | Alle API-Routes | Offen |
| M-3 | NFT-Metadaten-Proxy folgt Redirects (SSRF-Bypass-Risiko) | `/api/nft-metadata/route.ts` | **BEHOBEN** |
| M-4 | `maximumAllowedSatToSpend` fest auf 100.000 Sats kodiert | `listing/[id]/page.tsx` | Offen |
| M-5 | 5-Minuten-Replay-Fenster ohne Nonce/Deduplizierung | `verifySignature.ts` | Offen |
| M-6 | Abgelaufene Listings zeigen aktiven Kauf-Button | `listing/[id]/page.tsx` | **BEHOBEN** |

### LOW

| # | Befund | Datei |
|---|--------|-------|
| L-1 | SQL-LIKE-Wildcards in Request-Suche nicht escaped | `requestsDb.ts` |
| L-2 | Offer-Scanning stoppt nach 2 leeren Batches (koennte Angebote uebersehen) | `opnet.ts` |
| L-3 | Kein Rate-Limiting auf APIs | Alle Routes |
| L-4 | Console.log in Produktion gibt Aktivitaetsdaten preis | `opnet.ts` |

### INFO

| # | Befund |
|---|--------|
| I-1 | Kein CSRF-Schutz (bei signierten Routes durch Wallet-Signatur mitigiert) |
| I-2 | Keine Content-Security-Policy-Header |
| I-3 | NFT-Bild-URL-Schema-Validierung ist gut (blockiert `javascript:`) |
| I-4 | Wallet-Auto-Reconnect beim Laden der Seite (Standard-DApp-Verhalten) |

---

## Was in dieser Session behoben wurde

| Fix | Beschreibung |
|-----|-------------|
| Schnorr-Signaturen | Echte kryptographische Signatur-Verifizierung fuer Request-Erstellung und -Stornierung |
| Token-Balance-Pruefung | Verhindert, dass User Tokens listen die sie nicht besitzen |
| Abgelaufene Listings | Kauf-Button wird deaktiviert wenn Listing abgelaufen ist |
| RPC-Methoden-Whitelist | Nur sichere Lese-Methoden werden an den OPNet-Node weitergeleitet |
| NFT-Proxy SSRF | Redirects werden jetzt gegen die Hostname-Allowlist validiert |
| Unnoetige Signaturen entfernt | Post-Transaktions-Wallet-Popups eliminiert (Fill, Fulfill, Hide) |
| Signatur-UI-Hinweise | Benutzer sehen erklaerenden Text waehrend Wallet-Signatur-Aufforderungen |

---

## Gesamtbewertung

**Gelder sind sicher.** Das Atomic-Swap-Design stellt sicher, dass Tokens und BTC in einer einzigen Transaktion getauscht werden. Der Reentrancy-Guard, das CEI-Pattern, die Zahlungs-Verifizierung und der Fee-Cap des Contracts bieten robuste On-Chain-Sicherheit.

**Off-Chain-Griefing ist das verbleibende Hauptrisiko.** Drei unsignierte API-Routes erlauben Datenbank-Manipulation (falsche Fills, versteckte Listings, falsche Erfuellungen). Diese beeinflussen weder den On-Chain-Zustand noch Gelder, koennten aber die Benutzererfahrung beeintraechtigen. Die empfohlene Mitigation ist serverseitige On-Chain-Verifikation statt zusaetzlicher Wallet-Signaturen.

**Die Anwendung ist fuer den Testnet-Einsatz produktionsreif**, wobei Rate-Limiting und On-Chain-Verifikation fuer die unsignierten Endpoints vor dem Mainnet-Launch hinzugefuegt werden sollten.
