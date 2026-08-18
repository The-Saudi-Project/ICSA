# Infrastructure Analysis & Scaling Strategy
**Target Scale:** 200 Restaurants, 5,000 Tables

## 1. Executive Summary
The current platform infrastructure runs on the Free Tiers of Vercel (Frontend), Render (Backend API), and MongoDB Atlas (Database). While highly suitable for prototyping and initial development, this stack cannot sustain the target scale of 200 restaurants. Under peak commercial load, the current system will experience severe bottlenecks resulting in query timeouts, dropped orders, and extended offline periods.

This report outlines the specific failure points of the current free-tier architecture and presents a highly cost-effective, scalable migration strategy to DigitalOcean.

---

## 2. Current Architecture Limits & Crash Points

### A. MongoDB Atlas (M0 Free Tier)
* **Limits:** 100 Operations/Second and 512 MB Storage.
* **Crash Point (Concurrency):** At roughly 30 to 50 concurrent active users placing orders, the strict 100 Ops/Sec limit will be exceeded. The database will aggressively throttle queries, causing the API to queue requests and eventually fail with `504 Gateway Timeout` errors.
* **Crash Point (Storage):** At the target scale of 20,000 orders per day (200 restaurants * 100 orders), the 512 MB total storage limit will be consumed in less than 30 days. Once full, the database forces a read-only mode, entirely halting business operations.

### B. Render Backend API (Free Tier)
* **Limits:** 0.1 shared vCPU and 500 uptime hours per month.
* **Crash Point (CPU):** A 0.1 vCPU allocation cannot comfortably process more than 10-20 requests per second (RPS). During a dinner rush, event loop lag will occur, resulting in `502 Bad Gateway` errors.
* **Crash Point (Uptime):** The 500-hour monthly limit equates to 20.8 days. If the API receives continuous traffic (or is kept awake via uptime monitors), it will automatically shut down on the 21st day of the month and remain offline until the next billing cycle.

### C. Vercel Frontend (Hobby Tier)
* **Limits:** 100 GB Bandwidth per month.
* **Crash Point (Bandwidth):** Operating 5,000 tables will generate an estimated 300,000+ monthly visits. Assuming a 2MB page load, this will consume 600 GB of bandwidth—six times the Hobby tier limit. Vercel responds to overages by hard-blocking the frontend application.

---

## 3. The DigitalOcean Migration Strategy

To support 200 restaurants reliably without incurring the $100+/month costs of managed Enterprise tiers (like Vercel Pro and MongoDB Atlas M20), we recommend migrating the entire stack to a single, dedicated Virtual Private Server (VPS) on DigitalOcean.

### Recommended Architecture
By hosting the Frontend, Backend API, and Database on a single robust DigitalOcean Droplet, we eliminate network latency between the API and database, remove all restrictive free-tier caps, and lock in a low, predictable monthly operational cost.

* **Frontend:** Edge-cached by Cloudflare, served statically via Nginx on the server.
* **Backend API:** Containerized Node.js environment (Docker).
* **Database:** Self-hosted MongoDB container (Docker) utilizing local NVMe storage.

### Monthly Cost Breakdown
| Service | Purpose | Monthly Cost |
| :--- | :--- | :--- |
| **DigitalOcean Droplet** | Compute (2 vCPUs, 4 GB RAM, 80 GB NVMe SSD) | $24.00 |
| **Cloudflare** | DNS Management & Edge Caching CDN | $0.00 |
| **MongoDB** | Database (Self-hosted on Droplet) | $0.00 |
| **Total Estimated Cost** | **Enterprise-grade capacity** | **$24.00 / month** |

---

## 4. Conclusion
The current free-tier stack is guaranteed to fail under the sustained load of 200 restaurants due to strict compute hours, bandwidth limits, and database operation caps. 

Migrating to a **$24/month DigitalOcean Droplet** is the most cost-efficient method to achieve the necessary scale. The droplet provides 80 GB of fast NVMe storage (sufficient for years of order history) and 2 vCPUs / 4 GB RAM, which easily supports the anticipated 100-300 Requests Per Second (RPS) during peak restaurant dinner rushes. This migration ensures near 100% platform availability and protects the business from sudden traffic-induced outages.
