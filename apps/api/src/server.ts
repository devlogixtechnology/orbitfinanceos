import Fastify, { type FastifyInstance } from "fastify";

export function buildServer(): FastifyInstance {
  const server = Fastify({
    logger: {
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers['x-api-key']",
      ],
    },
  });

  server.get("/health", () => ({
    name: "OrbitOS API",
    status: "ok",
  }));

  return server;
}
