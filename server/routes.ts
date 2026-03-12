import type { Express } from "express";
import { createServer, type Server } from 'node:http';
import { WebSocketServer } from 'ws'
import { handleWebSocket } from './game-rooms';

export async function registerRoutes(app: Express): Promise<Server> {
    app.get("/api/health", (_req, res) => {
        res.json({ status: "ok" });
    });

    const httpServer = createServer(app);

    const wss = new WebSocketServer({ server: httpServer, path: "/" });

    wss.on("connection", (ws) => {
        handleWebSocket(ws);
    });

    return httpServer;
}
