/**
 * VibeGPT – PM2 ecosystem (non-Docker deployment alternative).
 *
 * Runs the OmniRoute gateway under PM2 alongside the API and worker.
 * PostgreSQL + pgvector still need to be running (Docker or native).
 *
 * Usage:
 *   npm install -g pm2 omniroute
 *   pm2 start infrastructure/ecosystem.config.cjs
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: "vibegpt-router",
      // OmniRoute gateway — OpenAI-compatible on :20128, dashboard at /dashboard.
      script: "omniroute",
      args: "serve --no-open",
      interpreter: "none",
      env: {
        PORT: 20128,
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
    {
      name: "vibegpt-api",
      cwd: "./services/api",
      script: "python",
      args: "-m uvicorn app.main:app --host 0.0.0.0 --port 8000",
      interpreter: "none",
      env: {
        LLM_PROVIDER: "router",
        ROUTER_BASE_URL: "http://localhost:20128/v1",
        ROUTER_DASHBOARD_URL: "http://localhost:20128/dashboard",
      },
      autorestart: true,
    },
    {
      name: "vibegpt-worker",
      cwd: "./services/api",
      script: "python",
      args: "-m app.workers.document_worker",
      interpreter: "none",
      autorestart: true,
    },
    {
      name: "vibegpt-web",
      cwd: "./apps/web",
      script: "npm",
      args: "run start",
      interpreter: "none",
      env: {
        PORT: 3000,
      },
      autorestart: true,
    },
  ],
};
