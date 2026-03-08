# Satoshi's Market

**Trustless peer‑to‑peer marketplace for OP‑721 NFTs and OP‑20 tokens on
Bitcoin (OPNet).**

Satoshi's Market enables direct trading of NFTs and tokens using an
atomic escrow contract.\
Users can create listings, post buy requests, and fulfill requests
through private listings without intermediaries.

------------------------------------------------------------------------

## Live Demo

https://satoshis-market.vercel.app

------------------------------------------------------------------------

## What is Satoshi's Market?

Satoshi's Market is a decentralized marketplace built for the OPNet
ecosystem.

It allows users to:

-   List **OP‑721 NFTs** for BTC
-   List **OP‑20 tokens** for BTC
-   Create **buy requests** for assets
-   Fulfill requests by creating **private listings**
-   Trade assets through a **trustless escrow contract**

The goal is to enable **peer‑to‑peer trading on Bitcoin** without
custodial platforms.

------------------------------------------------------------------------

## Key Features

### Asset Listings

Users can list:

-   OP‑721 NFTs
-   OP‑20 tokens

Listings include:

-   contract address
-   token ID or token amount
-   BTC price
-   optional private buyer

------------------------------------------------------------------------

### Buy Requests

If an asset is not listed, users can create a **buy request**.

A request defines:

-   asset contract
-   NFT token ID or token amount
-   BTC price offered

Sellers can fulfill the request by creating a **private listing** for
that wallet.

------------------------------------------------------------------------

### Private Listings

Private listings restrict a trade to a specific wallet.

Use cases:

-   fulfilling buy requests
-   OTC trades
-   direct P2P deals

Only the specified wallet can purchase the listing.

------------------------------------------------------------------------

### Atomic Escrow

Trades are executed through an **OPNet escrow contract**.

Trade flow:

1.  Seller lists asset
2.  Buyer sends BTC transaction
3.  Contract verifies required payment outputs
4.  Asset transfers to buyer

This ensures **atomic settlement**.

------------------------------------------------------------------------

### Wallet Notifications

Users are notified when:

-   a private listing is created for their wallet
-   transactions are pending

Notifications appear in the **navbar when the wallet connects**.

------------------------------------------------------------------------

## How the Request System Works

Bitcoin cannot be escrowed directly in smart contracts.

To enable buy offers, Satoshi's Market uses a **Request → Listing
workflow**.

Process:

1.  User creates a buy request
2.  Sellers view open requests
3.  Seller fulfills request by creating a private listing
4.  Buyer receives a notification
5.  Buyer purchases the listing normally

This enables **buyer liquidity without locking BTC in contracts**.

------------------------------------------------------------------------

## Marketplace Filters

The marketplace supports filtering by:

-   asset type (OP‑721 / OP‑20)
-   own listings
-   private listings
-   listing status
-   requests vs listings

------------------------------------------------------------------------

## Tech Stack

Frontend

-   Next.js
-   React
-   Tailwind CSS

Backend

-   Next.js API routes
-   Neon Postgres database

Blockchain

-   OPNet
-   OP‑721 NFT standard
-   OP‑20 token standard

Infrastructure

-   Vercel hosting
-   Neon serverless database

------------------------------------------------------------------------

## Running Locally

Clone the repository

    git clone https://github.com/solcollecta/satoshis-market
    cd satoshis-market

Install dependencies

    npm install

Create a `.env.local` file

    DATABASE_URL=your_neon_database_url
    NEXT_PUBLIC_OP_RPC_URL=your_rpc_endpoint

Start the development server

    npm run dev

------------------------------------------------------------------------

## Future Improvements

-   improved UI design
-   collection pages
-   better mobile support
-   analytics for requests and listings

------------------------------------------------------------------------

## License

MIT
